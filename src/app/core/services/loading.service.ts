import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  private suppressedLoaders = 0;
  readonly loading$ = new BehaviorSubject(false);

  async track<T>(request: () => Promise<T>): Promise<T> {
    this.activeRequests += 1;
    this.updateVisibility();

    try {
      return await request();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.updateVisibility();
    }
  }

  async withoutLoader<T>(request: () => Promise<T>): Promise<T> {
    this.suppressedLoaders += 1;
    this.updateVisibility();

    try {
      return await request();
    } finally {
      this.suppressedLoaders = Math.max(0, this.suppressedLoaders - 1);
      this.updateVisibility();
    }
  }

  private updateVisibility(): void {
    this.loading$.next(this.activeRequests > 0 && this.suppressedLoaders === 0);
  }
}
