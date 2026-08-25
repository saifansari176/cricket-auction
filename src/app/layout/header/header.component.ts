import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuctionSettings } from '../../core/models/auction-settings';
import { AuthService } from '../../core/services/auth.service';
import { AuctionService } from '../../core/services/auction.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent implements OnInit {
  currentUser$;
  menuOpen = false;
  profileOpen = false;
  openSection = 'main';
  currentAuction: AuctionSettings | null = null;

  constructor(
    private authService: AuthService,
    public router: Router,
    private auctionService: AuctionService
  ) {
    this.currentUser$ = this.authService.currentUser$;

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.closeMenu();
        this.openSection = 'main';
      }
    });
  }

  async ngOnInit(): Promise<void> {
    const auction = await this.auctionService.get();

    this.currentAuction = auction;

    this.auctionService.activeAuction$.subscribe((activeAuction) => {
      this.currentAuction = activeAuction;
    });
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigateByUrl('/login');
  }

  startNormalAuction(): void {
    this.auctionService.clearSelectedPlayer();
    this.auctionService.setSelectedCategory('');
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  toggleSection(section: string): void {
    this.openSection = this.openSection === section ? '' : section;
  }

  closeSectionOnFocusOut(event: FocusEvent, section: string): void {
    const nextFocusedElement = event.relatedTarget as Node | null;
    const accordion = event.currentTarget as HTMLElement;

    if (this.openSection === section && !accordion.contains(nextFocusedElement)) {
      this.openSection = '';
    }
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  toggleProfile(): void {
    this.profileOpen = !this.profileOpen;
  }

  closeProfile(): void {
    this.profileOpen = false;
  }

  closeProfileOnFocusOut(event: FocusEvent): void {
    const nextFocusedElement = event.relatedTarget as Node | null;
    const profile = event.currentTarget as HTMLElement;

    if (!profile.contains(nextFocusedElement)) {
      this.closeProfile();
    }
  }

}
