import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, Inject, OnDestroy, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, distinctUntilChanged, filter, map } from 'rxjs';
import { HeaderComponent } from './layout/header/header.component';
import { MessageModalComponent } from './shared/message-modal/message-modal.component';
import { AppLoaderComponent } from './shared/app-loader/app-loader.component';
import { ImagePreviewComponent } from './shared/image-preview/image-preview.component';
import { AnalyticsService } from './core/services/analytics.service';
import { SeoService } from './core/services/seo.service';
import { AuthService } from './core/services/auth.service';
import { AuctionService } from './core/services/auction.service';
import { PlayerService } from './core/services/player.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule,
 RouterOutlet,
 HeaderComponent,
 MessageModalComponent,
 AppLoaderComponent,
 ImagePreviewComponent
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnDestroy {
  title = 'cricket-auction';
  private readonly navigationSubscription: Subscription;
  private readonly dataPreloadSubscriptions = new Subscription();
  private hiddenAt = 0;
  private readonly resumeReloadDelay = 2 * 60 * 1000;

  constructor(
    private router: Router,
    private analytics: AnalyticsService,
    private seo: SeoService,
    private authService: AuthService,
    private auctionService: AuctionService,
    private playerService: PlayerService,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.seo.updateForUrl(event.urlAfterRedirects);
        this.analytics.trackPageView(event.urlAfterRedirects);
      });

    if (isPlatformBrowser(this.platformId)) {
      this.startPlayerPreload();
      window.addEventListener('pageshow', this.onPageShow);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe();
    this.dataPreloadSubscriptions.unsubscribe();
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('pageshow', this.onPageShow);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  /**
   * Warm the shared player cache after authentication and whenever the user
   * selects a different auction. Route components then reuse the same result.
   */
  private startPlayerPreload(): void {
    this.dataPreloadSubscriptions.add(
      this.authService.currentUser$
        .pipe(
          map((user) => user?.uid || ''),
          distinctUntilChanged(),
          filter(Boolean)
        )
        .subscribe(() => this.preloadPlayers())
    );

    this.dataPreloadSubscriptions.add(
      this.auctionService.activeAuction$
        .pipe(
          map((auction) => auction?.activeAuctionId || auction?.id || ''),
          distinctUntilChanged(),
          filter(Boolean)
        )
        .subscribe(() => {
          if (this.authService.currentUser$.value) this.preloadPlayers();
        })
    );
  }

  private preloadPlayers(): void {
    void this.playerService.getPlayers().catch((error: unknown) => {
      // Preloading is an optimization; the destination page can retry normally.
      console.warn('Unable to preload players.', error);
    });
  }

  private onPageShow = (event: PageTransitionEvent): void => {
    // Mobile browsers can restore a frozen page from BFCache without restoring
    // Firebase's live connections. A fresh app boot reconnects those services.
    if (event.persisted) {
      window.location.reload();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
      return;
    }

    if (this.hiddenAt && Date.now() - this.hiddenAt >= this.resumeReloadDelay) {
      window.location.reload();
    }
    this.hiddenAt = 0;
  };

  get showShell(): boolean {
    const publicPaths = ['/', '/login', '/player-registration', '/player-list', '/watch', '/live-screen', '/how-it-works', '/past-auctions'];
    return !publicPaths.some((path) => path === '/' ? this.router.url === '/' : this.router.url.startsWith(path));
  }

  get showPublicContact(): boolean {
    const path = this.router.url.split('?')[0];
    return ['/', '/home', '/login', '/auction-settings', '/how-it-works'].includes(path);
  }

  trackWhatsAppContact(): void {
    this.analytics.trackEvent('whatsapp_contact', { source: this.router.url || '/' });
  }
}
