import { CommonModule } from '@angular/common';
import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { HeaderComponent } from './layout/header/header.component';
import { MessageModalComponent } from './shared/message-modal/message-modal.component';
import { AppLoaderComponent } from './shared/app-loader/app-loader.component';
import { ImagePreviewComponent } from './shared/image-preview/image-preview.component';
import { AnalyticsService } from './core/services/analytics.service';

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
  private hiddenAt = 0;
  private readonly resumeReloadDelay = 2 * 60 * 1000;

  constructor(
    private router: Router,
    private analytics: AnalyticsService
  ) {
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.analytics.trackPageView(event.urlAfterRedirects));

    window.addEventListener('pageshow', this.onPageShow);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe();
    window.removeEventListener('pageshow', this.onPageShow);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
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
    const publicPaths = ['/', '/login', '/player-registration', '/watch', '/live-screen', '/how-it-works', '/past-auctions'];
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
