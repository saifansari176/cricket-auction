import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

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

  close(confirmed = false): void {
    this.messageService.close(confirmed);
  }
}
