import { inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuctionSettings } from '../models/auction-settings';
import { AuctionBid } from '../models/bid';
import { Player } from '../models/player';
import { Team } from '../models/team';
import { AuthService } from './auth.service';
import { FirebaseService } from './firestore.service';

export interface LiveAuctionState {
  currentPlayerId?: string;
  currentBid?: number;
  highestTeamId?: string;
  status?: 'live' | 'completed';
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuctionService {

  firebase = inject(FirebaseService);

  authService = inject(AuthService);
  
  /** Each auction is now the parent document for its own teams, players and bids. */
  private auctionsCollection = 'auctions';
  private legacySettingsCollection = 'auctionSettings';
  private readonly selectionCollection = 'preferences';

  activeAuction$ = new BehaviorSubject<AuctionSettings | null>(null);
  selectedPlayer$ = new BehaviorSubject<{id: string, name: string} | null>(null);
  selectedCategoryId$ = new BehaviorSubject<string>('');
  private returnToDashboardAfterSale = false;

  setReturnToDashboardAfterSale(value: boolean): void {
    this.returnToDashboardAfterSale = value;
  }

  shouldReturnToDashboardAfterSale(): boolean {
    return this.returnToDashboardAfterSale;
  }

  clearReturnToDashboardAfterSale(): void {
    this.returnToDashboardAfterSale = false;
  }

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
        this.auctionsCollection,
        activeAuctionId,
        {
          ...settings,
          ...ownerDetails,
          updatedAt: now
        }
      );

    } else {

      const auctionRef = await this.firebase.add(
        this.auctionsCollection,
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

    await this.migrateLegacyData();
    const selection = await this.getSelection();
    const auction = selection?.activeAuctionId
      ? await this.getAuctionById(selection.activeAuctionId)
      : null;

    const activeAuction = auction && selection?.activeAuctionId
      ? { ...auction, activeAuctionId: selection.activeAuctionId }
      : auction;
  this.activeAuction$.next(activeAuction);

  return activeAuction;

}

  async getActiveAuctionId(): Promise<string> {

    const current = await this.get();

    if (current?.activeAuctionId) {
      return current.activeAuctionId;
    }

    const auctions = await this.getAuctions();

    if (auctions.length !== 1 || !auctions[0].id) {
      return '';
    }

    await this.setActiveAuction(auctions[0].id);
    return auctions[0].id;

  }

  async getAuctionById(auctionId: string): Promise<AuctionSettings | null> {
    return await this.firebase.getById<AuctionSettings>(
      this.auctionsCollection,
      auctionId
    );
  }

  async getAuctions(): Promise<AuctionSettings[]> {
    const user = await this.authService.waitForUser();
    const isAdmin = this.authService.isAdmin(user);

    await this.migrateLegacyData();
    const auctions = await this.firebase.getAll<AuctionSettings>(this.auctionsCollection);

    return auctions
      .filter((auction) => auction.id !== 'current')
      .filter((auction) => !auction.id?.startsWith('current_'))
      .filter((auction) => isAdmin || !user?.uid || auction.createdBy === user.uid)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  }

  async setActiveAuction(auctionId: string): Promise<void> {
    const auction = await this.firebase.getById<AuctionSettings>(
      this.auctionsCollection,
      auctionId
    );

    if (!auction) {
      return;
    }

    const now = new Date().toISOString();

    await this.firebase.set(this.selectionPath(), 'current', {
      activeAuctionId: auctionId,
      updatedAt: now
    });

    this.activeAuction$.next({
      ...auction,
      activeAuctionId: auctionId,
      updatedAt: now
    });
  }

  async deleteAuction(auctionId: string): Promise<void> {
    const current = await this.get();

    await Promise.all([
      this.firebase.deleteCollection(this.auctionCollection(auctionId, 'teams')),
      this.firebase.deleteCollection(this.auctionCollection(auctionId, 'players')),
      this.firebase.deleteCollection(this.auctionCollection(auctionId, 'bids')),
      this.firebase.deleteCollection(this.auctionCollection(auctionId, 'categories'))
    ]);

    await this.deleteLegacyAuctionRecords(auctionId);

    await this.firebase.delete(
      this.auctionsCollection,
      auctionId
    );

    await this.firebase.delete(this.legacySettingsCollection, auctionId);

    if (current?.id === auctionId || current?.activeAuctionId === auctionId) {
      await Promise.all([
        this.firebase.delete(this.selectionPath(), 'current'),
        this.firebase.delete(this.legacySettingsCollection, 'current'),
        this.deleteCurrentUserLegacySelection()
      ]);
      this.activeAuction$.next(null);
    }

  }

  /** Read-only data used by the public tournament watch link. */
  async getPublicTournament(auctionId: string): Promise<{
    auction: AuctionSettings | null;
    teams: Team[];
    players: Player[];
    bids: AuctionBid[];
    liveState: LiveAuctionState | null;
  }> {
    const [auction, teams, players, bids, liveState] = await Promise.all([
      this.getAuctionById(auctionId),
      this.firebase.getAll<Team>(this.auctionCollection(auctionId, 'teams')),
      this.firebase.getAll<Player>(this.auctionCollection(auctionId, 'players')),
      this.firebase.getAll<AuctionBid>(this.auctionCollection(auctionId, 'bids')),
      this.firebase.getById<LiveAuctionState>(this.auctionCollection(auctionId, 'liveState'), 'current')
    ]);
    return { auction, teams, players, bids, liveState };
  }

  async saveLiveState(state: LiveAuctionState, auctionId?: string): Promise<void> {
    const id = auctionId || await this.getActiveAuctionId();
    if (!id) return;
    await this.firebase.set(this.auctionCollection(id, 'liveState'), 'current', {
      ...state,
      updatedAt: new Date().toISOString()
    });
  }

  async updateAuctionAccess(auctionId: string, teamLimit: number, playerLimit: number): Promise<void> {
    await this.firebase.update(this.auctionsCollection, auctionId, {
      teamLimit,
      playerLimit,
      updatedAt: new Date().toISOString()
    });
  }
  
  async saveBid(bid: AuctionBid): Promise<void> {

    const { id: _id, ...data } = bid;

    const auctionId = data.auctionId || await this.getActiveAuctionId();
    if (!auctionId) return;
    const payload: Omit<AuctionBid, 'id'> = {
      ...data,
      auctionId
    };

    await this.firebase.add(
      this.auctionCollection(auctionId, 'bids'),
      payload
    );

  }

  async getBids(): Promise<AuctionBid[]> {

    const activeAuctionId = await this.getActiveAuctionId();
    return activeAuctionId
      ? this.firebase.getAll<AuctionBid>(this.auctionCollection(activeAuctionId, 'bids'))
      : [];
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

  async deletePlayerBids(playerId: string): Promise<void> {
    const bids = await this.getPlayerHistory(playerId);
    const auctionId = await this.getActiveAuctionId();
    if (!auctionId) return;

    await Promise.all(
      bids
        .filter((bid) => !!bid.id)
        .map((bid) => this.firebase.delete(this.auctionCollection(auctionId, 'bids'), bid.id!))
    );
  }

  async setRegistrationLinkEnabled(auctionId: string, enabled: boolean): Promise<void> {
    await this.firebase.update(this.auctionsCollection, auctionId, {
      registrationLinkEnabled: enabled,
      updatedAt: new Date().toISOString()
    });
  }

  async setPublicLiveViewEnabled(auctionId: string, enabled: boolean): Promise<void> {
    await this.firebase.update(this.auctionsCollection, auctionId, {
      publicLiveViewEnabled: enabled,
      updatedAt: new Date().toISOString()
    });
  }

  async deleteTeamBids(teamId: string): Promise<void> {
    const bids = await this.getBids();
    const auctionId = await this.getActiveAuctionId();
    if (!auctionId) return;

    await Promise.all(
      bids
        .filter((bid) => bid.teamId === teamId && !!bid.id)
        .map((bid) => this.firebase.delete(this.auctionCollection(auctionId, 'bids'), bid.id!))
    );
  }

  async deleteBid(bidId: string): Promise<void> {
    const auctionId = await this.getActiveAuctionId();
    if (auctionId) await this.firebase.delete(this.auctionCollection(auctionId, 'bids'), bidId);
  }

  async syncPlayerBidDetails(player: Player): Promise<void> {
    if (!player.id) return;

    const bids = await this.getPlayerHistory(player.id);
    const auctionId = await this.getActiveAuctionId();
    if (!auctionId) return;
    const playerName = `${player.firstName} ${player.lastName}`.trim();

    await Promise.all(
      bids
        .filter((bid) => !!bid.id)
.map((bid) => this.firebase.update(this.auctionCollection(auctionId, 'bids'), bid.id!, {
          ...bid,
          playerName,
          mobile: player.mobile,
          jerseyNumber: player.jerseyNumber,
          tshirtSize: player.tshirtSize,
          photoUrl: player.photo
        }))
    );
  }

  async syncTeamBidDetails(teamId: string, teamName: string): Promise<void> {
    const bids = await this.getBids();
    const auctionId = await this.getActiveAuctionId();
    if (!auctionId) return;

    await Promise.all(
      bids
        .filter((bid) => bid.teamId === teamId && !!bid.id)
        .map((bid) => this.firebase.update(this.auctionCollection(auctionId, 'bids'), bid.id!, {
          ...bid,
          teamName
        }))
    );
  }

  async clearAuctionHistory(): Promise<void> {

    const bids = await this.getBids();
    const auctionId = await this.getActiveAuctionId();
    if (!auctionId) return;

    for (const bid of bids) {

      if (!bid.id) {
        continue;
      }

      await this.firebase.delete(

        this.auctionCollection(auctionId, 'bids'),

        bid.id

      );

    }

  }

  setSelectedPlayer(playerId: string, playerName: string): void {
    this.selectedPlayer$.next({ id: playerId, name: playerName });
  }

  setSelectedCategory(categoryId: string): void {
    this.selectedCategoryId$.next(categoryId);
  }

  clearSelectedPlayer(): void {
    this.selectedPlayer$.next(null);
  }

  getSelectedPlayer() {
    return this.selectedPlayer$.asObservable();
  }

  auctionCollection(auctionId: string, name: string): string {
    return `${this.auctionsCollection}/${auctionId}/${name}`;
  }

  private selectionPath(): string {
    const uid = this.authService.currentUser$.value?.uid || 'anonymous';
    return `users/${uid}/${this.selectionCollection}`;
  }

  private async getSelection(): Promise<{ activeAuctionId?: string } | null> {
    const selection = await this.firebase.getById<{ activeAuctionId?: string }>(this.selectionPath(), 'current');
    if (selection?.activeAuctionId) return selection;

    // Preserve the active auction chosen before the new layout was introduced.
    const user = await this.authService.waitForUser();
    const legacyKey = user?.uid ? `current_${user.uid}` : 'current';
    const legacy = await this.firebase.getById<AuctionSettings>(this.legacySettingsCollection, legacyKey);
    if (legacy?.activeAuctionId) {
      await this.firebase.set(this.selectionPath(), 'current', { activeAuctionId: legacy.activeAuctionId });
      return { activeAuctionId: legacy.activeAuctionId };
    }
    return null;
  }

  /** Copies the old flat collections once, without deleting any existing data. */
  private async migrateLegacyData(): Promise<void> {
    const migration = await this.firebase.getById<{ completed?: boolean }>('appSettings', 'auctionDataStructureV2');
    if (migration?.completed) return;

    const legacyAuctions = await this.firebase.getAll<AuctionSettings>(this.legacySettingsCollection);
    const auctions = legacyAuctions.filter((auction) => auction.id && auction.id !== 'current' && !auction.id.startsWith('current_'));
    for (const auction of auctions) {
      const auctionId = auction.id!;
      await this.firebase.set(this.auctionsCollection, auctionId, auction);
      await this.copyLegacyCollection('teams', auctionId, 'teams');
      await this.copyLegacyCollection('players', auctionId, 'players');
      await this.copyLegacyCollection('bids', auctionId, 'bids');
      await this.copyLegacyCollection('playerCategories', auctionId, 'categories');
    }
    await this.firebase.set('appSettings', 'auctionDataStructureV2', {
      completed: true,
      completedAt: new Date().toISOString()
    });
  }

  private async copyLegacyCollection(source: string, auctionId: string, destination: 'teams' | 'players' | 'bids' | 'categories'): Promise<void> {
    const records = await this.firebase.getAll<{ id?: string; auctionId?: string }>(source);
    await Promise.all(records
      .filter((record) => record.id && record.auctionId === auctionId)
      .map((record) => this.firebase.set(this.auctionCollection(auctionId, destination), record.id!, record)));
  }

  private async deleteLegacyAuctionRecords(auctionId: string): Promise<void> {
    await Promise.all([
      this.deleteLegacyRecordsByAuctionId('teams', auctionId),
      this.deleteLegacyRecordsByAuctionId('players', auctionId),
      this.deleteLegacyRecordsByAuctionId('bids', auctionId),
      this.deleteLegacyRecordsByAuctionId('playerCategories', auctionId)
    ]);
  }

  private async deleteLegacyRecordsByAuctionId(collectionName: string, auctionId: string): Promise<void> {
    const records = await this.firebase.getAll<{ id?: string; auctionId?: string }>(collectionName);
    await Promise.all(
      records
        .filter((record) => record.id && record.auctionId === auctionId)
        .map((record) => this.firebase.delete(collectionName, record.id!))
    );
  }

  private async deleteCurrentUserLegacySelection(): Promise<void> {
    const user = await this.authService.waitForUser();
    if (user?.uid) {
      await this.firebase.delete(this.legacySettingsCollection, `current_${user.uid}`);
    }
  }

}
