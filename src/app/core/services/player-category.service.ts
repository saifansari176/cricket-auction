import { Injectable } from '@angular/core';
import { PlayerCategory } from '../models/player-category';
import { AuctionService } from './auction.service';
import { FirebaseService } from './firestore.service';

@Injectable({ providedIn: 'root' })
export class PlayerCategoryService {
  private readonly collection = 'playerCategories';

  constructor(private firebase: FirebaseService, private auctionService: AuctionService) {}

  async getCategories(auctionId?: string): Promise<PlayerCategory[]> {
    const resolvedAuctionId = auctionId || await this.auctionService.getActiveAuctionId();
    const categories = resolvedAuctionId
      ? await this.firebase.getAll<PlayerCategory>(this.auctionCollection(resolvedAuctionId))
      : [];
    return categories
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveCategory(category: PlayerCategory): Promise<void> {
    const auctionId = category.auctionId || await this.auctionService.getActiveAuctionId();
    if (!auctionId) return;

    const payload: PlayerCategory = {
      ...category,
      auctionId
    };

    if (category.id) {
      await this.firebase.set(this.auctionCollection(auctionId), category.id, payload);
      await this.syncCategoryPlayers(auctionId, category.id, payload.name, payload.basePrice, payload.bidIncreaseBy);
      await this.syncLegacyCategory(payload);
      return;
    }

    const { id, ...data } = payload;
    await this.firebase.add(this.auctionCollection(auctionId), data);
  }

  async deleteCategory(id: string): Promise<void> {
    const auctionId = await this.auctionService.getActiveAuctionId();
    if (!auctionId) return;

    const auction = await this.auctionService.getAuctionById(auctionId);
    const regularBasePrice = Number(auction?.basePlayerPrice ?? auction?.minimumBid ?? 0);
    const regularBidIncrease = Number(auction?.bidIncreaseBy ?? 0);
    const playerCollection = this.auctionService.auctionCollection(auctionId, 'players');
    const players = await this.firebase.getAll<{ id?: string; categoryId?: string; categoryName?: string; baseBid?: number; bidIncreaseBy?: number }>(playerCollection);

    await Promise.all(
      players
        .filter((player) => player.id && player.categoryId === id)
        .map((player) => this.firebase.update(playerCollection, player.id!, {
          ...player,
          categoryId: '',
          categoryName: '',
          baseBid: regularBasePrice,
          bidIncreaseBy: regularBidIncrease
        }))
    );

    await this.firebase.delete(this.auctionCollection(auctionId), id);
  }

  private auctionCollection(auctionId: string): string {
    return this.auctionService.auctionCollection(auctionId, 'categories');
  }

  private async syncCategoryPlayers(
    auctionId: string,
    categoryId: string,
    categoryName: string,
    basePrice: number,
    bidIncreaseBy?: number
  ): Promise<void> {
    const playerCollection = this.auctionService.auctionCollection(auctionId, 'players');
    const players = await this.firebase.getAll<{ id?: string; categoryId?: string; categoryName?: string; baseBid?: number; bidIncreaseBy?: number }>(playerCollection);

    await Promise.all(
      players
        .filter((player) => player.id && player.categoryId === categoryId)
        .map((player) => this.firebase.update(playerCollection, player.id!, {
          ...player,
          categoryName,
          baseBid: Number(basePrice || 0),
          bidIncreaseBy: Number(bidIncreaseBy || 0)
        }))
    );
  }

  private async syncLegacyCategory(category: PlayerCategory): Promise<void> {
    if (!category.id) return;

    const legacyCategory = await this.firebase.getById<PlayerCategory>(this.collection, category.id);
    if (legacyCategory) {
      await this.firebase.update(this.collection, category.id, category);
    }
  }
}
