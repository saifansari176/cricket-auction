import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuctionSettings } from '../models/auction-settings';
import { AuctionBid } from '../models/bid';
import { AuthService } from './auth.service';
import { FirebaseService } from './firestore.service';

@Injectable({
  providedIn: 'root'
})
export class AuctionService {

  firebase = inject(FirebaseService);

  authService = inject(AuthService);
  
  private settingsCollection = 'auctionSettings';

  private bidsCollection = 'bids';

  activeAuction$ = new BehaviorSubject<AuctionSettings | null>(null);
  selectedPlayer$ = new BehaviorSubject<{id: string, name: string} | null>(null);

  async save(settings: AuctionSettings, auctionId?: string): Promise<string> {

    const now = new Date().toISOString();
    let activeAuctionId = auctionId;
    const user = await this.authService.waitForUser();
    const ownerDetails = {
      createdBy: settings.createdBy || user?.uid || '',
      createdByEmail: settings.createdByEmail || user?.email || ''
    };

    if (activeAuctionId) {

      await this.firebase.update(
        this.settingsCollection,
        activeAuctionId,
        {
          ...settings,
          ...ownerDetails,
          updatedAt: now
        }
      );

    } else {

      const auctionRef = await this.firebase.add(
        this.settingsCollection,
        {
          ...settings,
          ...ownerDetails,
          createdAt: now,
          updatedAt: now
        }
      );

      activeAuctionId = auctionRef.id;

    }

    await this.setActiveAuction(activeAuctionId || '');

    return activeAuctionId || '';

  }

   async get(): Promise<AuctionSettings | null> {

  const auction = await this.firebase.getById<AuctionSettings>(
    this.settingsCollection,
    await this.getCurrentSelectionKey()
  );

  this.activeAuction$.next(auction);

  return auction;

}

  async getActiveAuctionId(): Promise<string> {

    const current = await this.get();

    return current?.activeAuctionId || current?.id || '';

  }

  async getAuctionById(auctionId: string): Promise<AuctionSettings | null> {
    return await this.firebase.getById<AuctionSettings>(
      this.settingsCollection,
      auctionId
    );
  }

  async getAuctions(): Promise<AuctionSettings[]> {
    const user = await this.authService.waitForUser();
    const isAdmin = this.authService.isAdmin(user);

    const auctions = await this.firebase.getAll<AuctionSettings>(
      this.settingsCollection
    );

    return auctions
      .filter((auction) => auction.id !== 'current')
      .filter((auction) => !auction.id?.startsWith('current_'))
      .filter((auction) => isAdmin || !user?.uid || auction.createdBy === user.uid)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  }

  async setActiveAuction(auctionId: string): Promise<void> {
    const auction = await this.firebase.getById<AuctionSettings>(
      this.settingsCollection,
      auctionId
    );

    if (!auction) {
      return;
    }

    const now = new Date().toISOString();

    await this.firebase.set(
      this.settingsCollection,
      await this.getCurrentSelectionKey(),
      {
        ...auction,
        activeAuctionId: auctionId,
        updatedAt: now
      }
    );

    this.activeAuction$.next({
      ...auction,
      activeAuctionId: auctionId,
      updatedAt: now
    });
  }

  async deleteAuction(auctionId: string): Promise<void> {

    await this.firebase.delete(
      this.settingsCollection,
      auctionId
    );

    const current = await this.get();

    if (current?.activeAuctionId === auctionId) {

      await this.firebase.delete(
        this.settingsCollection,
        await this.getCurrentSelectionKey()
      );

    }

  }
  
  async saveBid(bid: AuctionBid): Promise<void> {

    const { id: _id, ...data } = bid;

    const payload: Omit<AuctionBid, 'id'> = {
      ...data,
      auctionId: data.auctionId || await this.getActiveAuctionId()
    };

    await this.firebase.add(
      this.bidsCollection,
      payload
    );

  }

  async getBids(): Promise<AuctionBid[]> {

    const activeAuctionId = await this.getActiveAuctionId();

    const bids = await this.firebase.getAll<AuctionBid>(
      this.bidsCollection
    );

    return activeAuctionId
      ? bids.filter((bid) => bid.auctionId === activeAuctionId)
      : bids;
  }

  async getSoldPlayers(): Promise<AuctionBid[]> {

    const bids = await this.getBids();

    return bids.filter(
      bid => bid.sold
    );

  }

  async getTeamPlayers(teamId: string): Promise<AuctionBid[]> {

    const bids = await this.getBids();

    return bids.filter(

      bid =>

        bid.teamId === teamId &&

        bid.sold

    );

  }

  async getPlayerHistory(playerId: string): Promise<AuctionBid[]> {

    const bids = await this.getBids();

    return bids.filter(

      bid =>

        bid.playerId === playerId

    );

  }

  async clearAuctionHistory(): Promise<void> {

    const bids = await this.getBids();

    for (const bid of bids) {

      if (!bid.id) {
        continue;
      }

      await this.firebase.delete(

        this.bidsCollection,

        bid.id

      );

    }

  }

  setSelectedPlayer(playerId: string, playerName: string): void {
    this.selectedPlayer$.next({ id: playerId, name: playerName });
  }

  clearSelectedPlayer(): void {
    this.selectedPlayer$.next(null);
  }

  getSelectedPlayer() {
    return this.selectedPlayer$.asObservable();
  }

  private async getCurrentSelectionKey(): Promise<string> {
    const user = await this.authService.waitForUser();

    return user?.uid ? `current_${user.uid}` : 'current';
  }

}
