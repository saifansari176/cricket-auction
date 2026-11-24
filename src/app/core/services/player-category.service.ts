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
      await this.firebase.post(
        `/api/auctions/${encodeURIComponent(auctionId)}/categories/${encodeURIComponent(category.id)}/apply`,
        {
          categoryName: payload.name,
          basePrice: payload.basePrice,
          bidIncreaseBy: payload.bidIncreaseBy
        }
      );
      await this.syncLegacyCategory(payload);
      return;
    }

    const { id, ...data } = payload;
    await this.firebase.add(this.auctionCollection(auctionId), data);
  }

  async deleteCategory(id: string): Promise<void> {
    const auctionId = await this.auctionService.getActiveAuctionId();
    if (!auctionId) return;
    await this.firebase.post(
      `/api/auctions/${encodeURIComponent(auctionId)}/categories/${encodeURIComponent(id)}/delete`,
      {}
    );
  }

  private auctionCollection(auctionId: string): string {
    return this.auctionService.auctionCollection(auctionId, 'categories');
  }

  private async syncLegacyCategory(category: PlayerCategory): Promise<void> {
    if (!category.id) return;

    const legacyCategory = await this.firebase.getById<PlayerCategory>(this.collection, category.id);
    if (legacyCategory) {
      await this.firebase.update(this.collection, category.id, category);
    }
  }
}
