import { Injectable } from '@angular/core';
import { Player } from '../models/player';
import { AuctionService } from './auction.service';
import { FirebaseService } from './firestore.service';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  private collection = 'players';
  constructor(private firebase: FirebaseService, private auctionService: AuctionService) { }

  async getPlayers(): Promise<Player[]> {

    const activeAuctionId = await this.auctionService.getActiveAuctionId();

    return activeAuctionId
      ? this.firebase.getAll<Player>(this.auctionCollection(activeAuctionId))
      : [];

  }

  async updateAuctionDefaultsForPlayers(
    auctionId: string,
    baseBid: number,
    bidIncreaseBy: number
  ): Promise<void> {
    if (!auctionId) {
      return;
    }

    const players = await this.firebase.getAll<Player>(this.auctionCollection(auctionId));
    const price = Number(baseBid || 0);
    const increment = Number(bidIncreaseBy || 0);

    await Promise.all(
      players
        .filter((player) => !player.categoryId && player.id)
        .map((player) => this.firebase.update(this.auctionCollection(auctionId), player.id!, {
          ...player,
          baseBid: price,
          bidIncreaseBy: increment
        }))
    );
  }

 async getPlayerById(id: string): Promise<Player | null> {

    const auctionId = await this.auctionService.getActiveAuctionId();
    return auctionId ? this.firebase.getById<Player>(this.auctionCollection(auctionId), id) : null;

  }

async savePlayer(player: Player): Promise<boolean> {
    const activeAuctionId = await this.auctionService.getActiveAuctionId();

    player.auctionId = player.auctionId || activeAuctionId;

    const players = await this.firebase.getAll<Player>(this.auctionCollection(player.auctionId));
    const exists = players.some(
      x => x.mobile === player.mobile
    );

    if (exists) {

      return false;

    }

    if (!await this.canAddPlayer(player.auctionId)) return false;

    const { id, ...playerData } = player;

await this.firebase.add(
  this.auctionCollection(player.auctionId),
  playerData
);

    return true;

  }

  async canAddPlayer(auctionId?: string): Promise<boolean> {
    const user = await this.auctionService.authService.waitForUser();
    if (this.auctionService.authService.isAdmin(user)) return true;

    const selectedAuction = auctionId ? null : await this.auctionService.get();
    const resolvedAuctionId = auctionId || selectedAuction?.activeAuctionId || selectedAuction?.id;
    const auction = resolvedAuctionId
      ? await this.auctionService.getAuctionById(resolvedAuctionId)
      : selectedAuction;
    const players = resolvedAuctionId
      ? await this.firebase.getAll<Player>(this.auctionCollection(resolvedAuctionId))
      : [];
    const playerLimit = Number(auction?.playerLimit ?? 10);

    return players.length < playerLimit;
  }

async deletePlayer(id: string) {

    const auctionId = await this.auctionService.getActiveAuctionId();
    if (!auctionId) return;

    await this.auctionService.deletePlayerBids(id);
    await this.firebase.delete(this.auctionCollection(auctionId), id);

  }

 async updatePlayer(player: Player) {

    if (!player.id) return;

    player.auctionId = player.auctionId || await this.auctionService.getActiveAuctionId();

    await this.firebase.update(
      this.auctionCollection(player.auctionId),
      player.id,
      player
    );

  }

 async markSold(
    playerId: string,
    teamId: string,
    bid: number
  ) {

    const player = await this.getPlayerById(playerId);

    if (!player) return;

    player.status = 'Sold';

    player.soldToTeamId = teamId;

    player.soldPrice = bid;

    await this.updatePlayer(player);

  }

 async markUnsold(
    playerId: string
  ) {

    const player = await this.getPlayerById(playerId);

    if (!player) return;

    player.status = 'Unsold';

    await this.updatePlayer(player);

  }

  async markAvailable(playerId: string): Promise<Player | null> {
    const player = await this.getPlayerById(playerId);

    if (!player) {
      return null;
    }

    const updatedPlayer: Player = {
      ...player,
      status: 'Available',
      soldToTeamId: '',
      soldPrice: 0
    };

    await this.updatePlayer(updatedPlayer);

    return updatedPlayer;
  }

 async getAvailablePlayers(): Promise<Player[]> {

    const players = await this.getPlayers();
    const availablePlayers = players.filter(
      p => p.status === 'Available'
    );
    
    return this.shuffleArray(availablePlayers);

  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private auctionCollection(auctionId: string): string {
    return this.auctionService.auctionCollection(auctionId, this.collection);
  }

}
