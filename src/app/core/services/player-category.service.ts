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
    if (category.id) {
      await this.firebase.update(this.auctionCollection(category.auctionId), category.id, category);
      return;
    }
    const { id, ...data } = category;
    await this.firebase.add(this.auctionCollection(category.auctionId), data);
  }

  async deleteCategory(id: string): Promise<void> {
    const auctionId = await this.auctionService.getActiveAuctionId();
    if (auctionId) await this.firebase.delete(this.auctionCollection(auctionId), id);
  }

  private auctionCollection(auctionId: string): string {
    return this.auctionService.auctionCollection(auctionId, 'categories');
  }
}
