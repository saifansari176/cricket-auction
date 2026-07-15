import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private activeRequests = 0;
  readonly loading$ = new BehaviorSubject(false);

  async track<T>(request: () => Promise<T>): Promise<T> {
    this.activeRequests += 1;
    this.loading$.next(true);

    try {
      return await request();
    } finally {
      this.activeRequests = Math.max(0, this.activeRequests - 1);
      this.loading$.next(this.activeRequests > 0);
    }
  }
}
