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
    const categories = await this.firebase.getAll<PlayerCategory>(this.collection);
    return categories.filter((category) => category.auctionId === resolvedAuctionId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveCategory(category: PlayerCategory): Promise<void> {
    if (category.id) {
      await this.firebase.update(this.collection, category.id, category);
      return;
    }
    const { id, ...data } = category;
    await this.firebase.add(this.collection, data);
  }

  async deleteCategory(id: string): Promise<void> {
    await this.firebase.delete(this.collection, id);
  }
}
