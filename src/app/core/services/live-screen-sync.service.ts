import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Service to broadcast auction action events to the live screen
 * Triggers live screen refresh when sold, unsold, bid, or undo actions occur
 */
@Injectable({
  providedIn: 'root'
})
export class LiveScreenSyncService {
  private auctionActionSubject = new Subject<'sold' | 'unsold' | 'undo' | 'bid'>();
  public auctionAction$ = this.auctionActionSubject.asObservable();

  constructor() {}

  /**
   * Emit action event - triggers live screen refresh
   */
  notifyAction(action: 'sold' | 'unsold' | 'undo' | 'bid'): void {
    this.auctionActionSubject.next(action);
  }
}
