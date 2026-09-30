import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PlayerFormField, PlayerFormFieldSettings } from '../../core/models/auction-settings';
import { DEFAULT_PLAYER_FORM_FIELDS, resolvePlayerFormFields } from '../../core/models/player-form-fields';
import { AuctionService } from '../../core/services/auction.service';
import { MessageService } from '../../core/services/message.service';

interface FieldOption {
  key: PlayerFormField;
  label: string;
  description: string;
  registration: boolean;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent {
  private readonly auctionService = inject(AuctionService);
  private readonly message = inject(MessageService);
  private readonly router = inject(Router);

  readonly fields: FieldOption[] = [
    { key: 'photo', label: 'Player photo', description: 'Profile photo upload and cropper.', registration: true },
    { key: 'lastName', label: 'Last name', description: 'Player family or surname.', registration: true },
    { key: 'jerseyNumber', label: 'Jersey number', description: 'Preferred jersey number.', registration: true },
    { key: 'playerType', label: 'Player type', description: 'Batsman, bowler, all-rounder, or wicket keeper.', registration: true },
    { key: 'currentTeam', label: 'Current team', description: 'Current or previous team name.', registration: true },
    { key: 'category', label: 'Category', description: 'Auction category and category pricing.', registration: true },
    { key: 'tshirtSize', label: 'T-shirt size', description: 'Player jersey/shirt size.', registration: true },
    { key: 'trouserSize', label: 'Trouser size', description: 'Player trouser size.', registration: true },
    { key: 'note', label: 'Note', description: 'Additional information about the player.', registration: true },
    { key: 'baseBid', label: 'Base bid', description: 'Read-only calculated base price on Add Player.', registration: false }
  ];

  auctionName = '';
  loading = true;
  saving = false;
  addPlayerFields = { ...DEFAULT_PLAYER_FORM_FIELDS };
  registrationFields = { ...DEFAULT_PLAYER_FORM_FIELDS };
  private auctionId = '';

  async ngOnInit(): Promise<void> {
    try {
      const auction = await this.auctionService.get();
      const user = await this.auctionService.authService.waitForUser();
      if (!auction || !this.auctionService.canManageAuction(auction, user)) {
        await this.router.navigateByUrl('/dashboard');
        return;
      }

      this.auctionId = auction.activeAuctionId || auction.id || '';
      this.auctionName = auction.auctionName;
      this.addPlayerFields = resolvePlayerFormFields(auction.playerFormFields?.addPlayer);
      this.registrationFields = resolvePlayerFormFields(auction.playerFormFields?.registration);
    } finally {
      this.loading = false;
    }
  }

  async save(): Promise<void> {
    if (this.saving || !this.auctionId) return;
    this.saving = true;
    try {
      const settings: PlayerFormFieldSettings = {
        addPlayer: { ...this.addPlayerFields },
        registration: { ...this.registrationFields }
      };
      await this.auctionService.setPlayerFormFields(this.auctionId, settings);
      this.message.success('Player form settings saved successfully.');
    } catch (error: unknown) {
      this.message.error(error instanceof Error ? error.message : 'Unable to save player form settings.');
    } finally {
      this.saving = false;
    }
  }

}
