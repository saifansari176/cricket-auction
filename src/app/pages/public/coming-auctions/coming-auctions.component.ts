import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy } from '@angular/core';
import { AuctionService, type PublicAuctionSummary } from '../../../core/services/auction.service';
import { PublicHeaderComponent } from '../../../shared/public-header/public-header.component';

@Component({
  selector: 'app-coming-auctions',
  standalone: true,
  imports: [CommonModule, PublicHeaderComponent],
  templateUrl: './coming-auctions.component.html',
  styleUrl: './coming-auctions.component.scss'
})
export class ComingAuctionsComponent implements OnDestroy {
  private readonly auctionService = inject(AuctionService);

  auctions: PublicAuctionSummary[] = [];
  loading = true;
  errorMessage = '';
  copiedAuctionId = '';
  copyFeedbackAuctionId = '';
  copyFeedbackMessage = '';
  copyFeedbackError = false;
  private copyFeedbackTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
  }

  async ngOnInit(): Promise<void> {
    try {
      this.auctions = (await this.auctionService.getPublicAuctions())
        .filter((auction) => auction.registrationLinkEnabled && !auction.isActive && this.isUpcomingAuction(auction.auctionDate))
        .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
    } catch (error) {
      console.error('Unable to load upcoming auctions.', error);
      this.errorMessage = 'Unable to load upcoming auctions. Please try again later.';
    } finally {
      this.loading = false;
    }
  }

  async copyRegistrationLink(auction: PublicAuctionSummary): Promise<void> {
    const link = `${window.location.origin}${this.registrationLink(auction)}`;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        this.copiedAuctionId = auction.id;
        this.showCopyFeedback(auction.id, 'Player registration link copied.');
      } else {
        this.copiedAuctionId = '';
        this.showCopyFeedback(auction.id, 'Copy is unavailable in this browser.', true);
      }
    } catch (error) {
      console.error('Unable to copy the player registration link.', error);
      this.copiedAuctionId = '';
      this.showCopyFeedback(auction.id, 'Could not copy. Please try again.', true);
    }
  }

  private showCopyFeedback(auctionId: string, message: string, isError = false): void {
    if (this.copyFeedbackTimer) clearTimeout(this.copyFeedbackTimer);
    this.copyFeedbackAuctionId = auctionId;
    this.copyFeedbackMessage = message;
    this.copyFeedbackError = isError;
    this.copyFeedbackTimer = setTimeout(() => {
      this.copyFeedbackAuctionId = '';
      this.copyFeedbackMessage = '';
      this.copiedAuctionId = '';
    }, 2500);
  }

  registrationLink(auction: PublicAuctionSummary): string {
    return `/player-registration?auctionId=${encodeURIComponent(auction.id)}`;
  }

  phoneLink(contact: string): string {
    return contact.replace(/[^\d+]/g, '');
  }

  hideBrokenLogo(event: Event): void {
    if (event.target instanceof HTMLImageElement) {
      event.target.remove();
    }
  }

  private isUpcomingAuction(auctionDate: string): boolean {
    if (!auctionDate) return false;

    const date = new Date(`${auctionDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date >= today;
  }
}
