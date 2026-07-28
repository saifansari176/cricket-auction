import { CommonModule } from '@angular/common';
import { Component, HostListener, inject } from '@angular/core';

import { MessageService } from '../../core/services/message.service';

@Component({
  selector: 'app-message-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-modal.component.html',
  styleUrl: './message-modal.component.scss'
})
export class MessageModalComponent {
  private messageService = inject(MessageService);

  message$ = this.messageService.message$;

  @HostListener('document:keydown.enter', ['$event'])
  confirmWithEnter(event: Event): void {
    if (!this.messageService.hasActiveMessage()) {
      return;
    }

    event.preventDefault();
    this.close(true);
  }

  close(confirmed = false): void {
    this.messageService.close(confirmed);
  }
}
