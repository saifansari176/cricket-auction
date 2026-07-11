import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type MessageType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AppMessage {
  type: MessageType;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  showCancel: boolean;
}

type MessageResolver = (confirmed: boolean) => void;

interface ActiveMessage extends AppMessage {
  resolve?: MessageResolver;
}

@Injectable({
  providedIn: 'root'
})
export class MessageService {
  private activeMessage$ = new BehaviorSubject<ActiveMessage | null>(null);

  readonly message$ = this.activeMessage$.asObservable();

  success(message: string, title = 'Success'): void {
    this.open({
      type: 'success',
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    });
  }

  error(message: string, title = 'Error'): void {
    this.open({
      type: 'error',
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    });
  }

  warning(message: string, title = 'Warning'): void {
    this.open({
      type: 'warning',
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    });
  }

  info(message: string, title = 'Information'): void {
    this.open({
      type: 'info',
      title,
      message,
      confirmText: 'OK',
      showCancel: false
    });
  }

  confirm(
    message: string,
    title = 'Please Confirm',
    confirmText = 'Yes',
    cancelText = 'Cancel'
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.open({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        showCancel: true,
        resolve
      });
    });
  }

  close(confirmed = false): void {
    const activeMessage = this.activeMessage$.value;
    activeMessage?.resolve?.(confirmed);
    this.activeMessage$.next(null);
  }

  private open(message: ActiveMessage): void {
    this.activeMessage$.value?.resolve?.(false);
    this.activeMessage$.next(message);
  }
}
