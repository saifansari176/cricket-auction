import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuctionSettings } from '../../core/models/auction-settings';
import { AuthService } from '../../core/services/auth.service';
import { AuctionService } from '../../core/services/auction.service';
import { PlayerRegistrationLinkService } from '../../core/services/player-registration-link.service';
import { MessageService } from '../../core/services/message.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit {
  currentUser$;
  menuOpen = false;
  openSection = 'main';
  currentAuction: AuctionSettings | null = null;
  registrationLinkEnabled = false;

  constructor(
    private authService: AuthService,
    public router: Router,
    private auctionService: AuctionService,
    private registrationLinkService: PlayerRegistrationLinkService,
    private message: MessageService
  ) {
    this.currentUser$ = this.authService.currentUser$;
  }

  async ngOnInit(): Promise<void> {
    const [auction, registrationSettings] = await Promise.all([
      this.auctionService.get(),
      this.registrationLinkService.getSettings()
    ]);

    this.currentAuction = auction;
    this.registrationLinkEnabled = registrationSettings.enabled;

    this.auctionService.activeAuction$.subscribe((activeAuction) => {
      this.currentAuction = activeAuction;
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/login');
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleSection(section: string): void {
    this.openSection = this.openSection === section ? '' : section;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  async toggleRegistrationLink(): Promise<void> {
    this.registrationLinkEnabled = !this.registrationLinkEnabled;
    await this.registrationLinkService.setEnabled(this.registrationLinkEnabled);
  }

  async shareRegistrationLink(): Promise<void> {
    const activeAuctionId = this.currentAuction?.activeAuctionId || this.currentAuction?.id || '';
    const query = activeAuctionId ? `?auctionId=${encodeURIComponent(activeAuctionId)}` : '';
    const link = `${window.location.origin}/player-registration${query}`;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      this.message.success('Registration link copied.');
      return;
    }

    this.message.info(`Copy registration link:\n${link}`);
  }
}
