import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { AuctionService } from '../../../core/services/auction.service';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({ selector: 'app-past-auctions', standalone: true, imports: [CommonModule, PublicHeaderComponent], templateUrl: './past-auctions.component.html', styleUrl: './past-auctions.component.scss' })
export class PastAuctionsComponent {
  private auctionService = inject(AuctionService);
  auctions: AuctionSettings[] = [];

  async ngOnInit(): Promise<void> {
    try {
      this.auctions = (await this.auctionService.getAuctions())
        .filter((auction) => !auction.isActive && this.isPastAuction(auction.auctionDate));
    } catch {
      this.auctions = [];
    }
  }

  private isPastAuction(auctionDate: string): boolean {
    if (!auctionDate) return false;

    const date = new Date(`${auctionDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date < today;
  }
}
