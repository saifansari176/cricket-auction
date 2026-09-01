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

  constructor(
    private router: Router,
    private analytics: AnalyticsService
  ) {
    this.navigationSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.analytics.trackPageView(event.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.navigationSubscription.unsubscribe();
  }

  get showShell(): boolean {
    const publicPaths = ['/', '/login', '/player-registration', '/watch', '/live-screen', '/how-it-works', '/past-auctions'];
    return !publicPaths.some((path) => path === '/' ? this.router.url === '/' : this.router.url.startsWith(path));
  }

  get showPublicContact(): boolean {
    return !this.showShell
      && !this.router.url.startsWith('/live-screen')
      && !this.router.url.startsWith('/watch');
  }

  trackWhatsAppContact(): void {
    this.analytics.trackEvent('whatsapp_contact', { source: this.router.url || '/' });
  }
}
