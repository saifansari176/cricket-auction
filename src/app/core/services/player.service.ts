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

    const players = await this.firebase.getAll<Player>(this.collection);

    return activeAuctionId
      ? players.filter((player) => player.auctionId === activeAuctionId)
      : players;

  }

 async getPlayerById(id: string): Promise<Player | null> {

    return await this.firebase.getById<Player>(
  this.collection,
  id
);

  }

async savePlayer(player: Player): Promise<boolean> {
    const activeAuctionId = await this.auctionService.getActiveAuctionId();

    player.auctionId = player.auctionId || activeAuctionId;

    const players = await this.getPlayers();
    const exists = players.some(
      x => x.mobile === player.mobile
    );

    if (exists) {

      return false;

    }

    const { id, ...playerData } = player;

await this.firebase.add(
  this.collection,
  playerData
);

    return true;

  }

async deletePlayer(id: string) {

    await this.firebase.delete(
      this.collection,
      id
    );

  }

 async updatePlayer(player: Player) {

    if (!player.id) return;

    player.auctionId = player.auctionId || await this.auctionService.getActiveAuctionId();

    await this.firebase.update(
      this.collection,
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

}
