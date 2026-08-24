import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { AuctionService } from '../../../core/services/auction.service';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({ selector: 'app-past-auctions', standalone: true, imports: [CommonModule, PublicHeaderComponent], templateUrl: './past-auctions.component.html', styleUrl: './past-auctions.component.scss' })
export class PastAuctionsComponent {
  private auctionService = inject(AuctionService);
  auctions: AuctionSettings[] = [];
  async ngOnInit(): Promise<void> { try { this.auctions = (await this.auctionService.getAuctions()).filter(a => !a.isActive); } catch { this.auctions = []; } }
}
