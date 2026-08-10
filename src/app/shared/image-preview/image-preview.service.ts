import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ImagePreviewData {
  url: string;
  name?: string;
}

@Injectable({ providedIn: 'root' })
export class ImagePreviewService {
  private state$ = new BehaviorSubject<ImagePreviewData | null>(null);
  readonly state = this.state$.asObservable();

  open(url: string, name = ''): void {
    this.state$.next({ url, name });
  }

  close(): void {
    this.state$.next(null);
  }
}

