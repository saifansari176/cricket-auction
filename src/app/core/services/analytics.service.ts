import { Injectable } from '@angular/core';
import type { Analytics } from 'firebase/analytics';
import { app } from '../../../firebase.config';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly analytics = this.createAnalytics();

  trackPageView(path: string): void {
    void this.analytics.then((instance) => {
      if (!instance || typeof window === 'undefined') return;
      void this.log(instance, 'page_view', {
          page_location: window.location.href,
          page_path: path,
          page_title: document.title
        });
    });
  }

  trackEvent(name: string, parameters: Record<string, string> = {}): void {
    void this.analytics.then((instance) => {
      if (instance) void this.log(instance, name, parameters);
    });
  }

  private async createAnalytics(): Promise<Analytics | null> {
    if (typeof window === 'undefined') return null;

    const { initializeAnalytics, isSupported } = await import('firebase/analytics');
    if (!(await isSupported())) return null;

    return initializeAnalytics(app, { config: { send_page_view: false } });
  }

  private async log(
    analytics: Analytics,
    name: string,
    parameters: Record<string, string>
  ): Promise<void> {
    const { logEvent } = await import('firebase/analytics');
    logEvent(analytics, name, parameters);
  }
}
