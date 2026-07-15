import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  ActivatedRoute,
  Router
} from '@angular/router';

import { PlayerService } from '../../../core/services/player.service';
import { TeamService } from '../../../core/services/team.service';
import { AuctionService } from '../../../core/services/auction.service';
import { StorageService } from '../../../core/services/storage.service';
import { Player } from '../../../core/models/player';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { MessageService } from '../../../core/services/message.service';

@Component({
  selector: 'app-player-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './player-form.component.html',
  styleUrl: './player-form.component.scss'
})
export class PlayerFormComponent {

  fb = inject(FormBuilder);
  router = inject(Router);
  route = inject(ActivatedRoute);

  playerService = inject(PlayerService);
  teamService = inject(TeamService);
  auctionService = inject(AuctionService);
  storageService = inject(StorageService);
  message = inject(MessageService);

  auction: AuctionSettings | null = null;

  isEdit = false;

  playerId = '';

  existingPlayer: Player | null = null;

  form = this.fb.group({

    firstName: ['', [Validators.required, Validators.minLength(2)]],

    lastName: ['', Validators.required],

    mobile: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9]{10}$/)
      ]
    ],

    playerType: ['', Validators.required],

    tshirtSize: ['', Validators.required],

    trouserSize: [''],

    baseBid: [0],

    note: [''],

    photo: ['', Validators.required],

    status: ['Available']

  });

  // =========================================

  async ngOnInit() {

    this.auction = await this.auctionService.get();

    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {

      return;

    }

    this.playerId = id;

    this.isEdit = true;

    const player = await this.playerService.getPlayerById(id);

    if (!player) {

      return;

    }

    this.existingPlayer = player;

    this.form.patchValue({

      firstName: player.firstName,

      lastName: player.lastName,

      mobile: player.mobile,

      playerType: player.playerType,

      tshirtSize: player.tshirtSize,

      trouserSize: player.trouserSize,

      baseBid: player.baseBid,

      note: player.note,

      photo: player.photo,

      status: player.status

    });

  }

  // =========================================

  async save() {

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;

    }

    const player: Player = {

      id: this.isEdit ? this.playerId : undefined,

      firstName: this.form.value.firstName!,

      lastName: this.form.value.lastName!,

      mobile: this.form.value.mobile!,

      playerType: this.form.value.playerType!,

      tshirtSize: this.form.value.tshirtSize!,

      trouserSize: this.form.value.trouserSize!,

      baseBid: Number(this.form.value.baseBid),

      note: this.form.value.note || '',

      photo: this.form.value.photo || '',

      status: this.form.value.status || 'Available',

      auctionId: this.existingPlayer?.auctionId || this.auction?.activeAuctionId || ''

    };

    if (this.isEdit) {

      await this.playerService.updatePlayer(player);

      if (this.existingPlayer?.status === 'Sold' && player.status !== 'Sold') {
        await this.auctionService.deletePlayerBids(this.playerId);
        await this.teamService.reconcileTeams(
          Number(this.auction?.pointsPerTeam || 0),
          Number(this.auction?.playersPerTeam || 0)
        );
      } else {
        await this.auctionService.syncPlayerBidDetails(player);
      }

      this.message.success('Player updated successfully.');

    }
    else {

      const saved = await this.playerService.savePlayer(player);

      if (!saved) {

        this.message.warning('Player with this mobile number already exists.');

        return;

      }

      this.message.success('Player saved successfully.');

    }

    this.router.navigate(['/players']);

  }

  // =========================================

  async onPhotoChange(event: Event) {

    const input = event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) {

      return;

    }

    try {
      const uploadedUrl = await this.storageService.uploadPlayerImage(file);
      this.form.patchValue({
        photo: uploadedUrl
      });
    } catch (error: unknown) {
      console.error('Player image upload failed', error);
      const message = error instanceof Error ? error.message : 'Please try again.';
      this.message.error('Image upload failed: ' + message);
    }

  }

  // =========================================

  allowOnlyNumbers(event: KeyboardEvent) {

    const code = event.which || event.keyCode;

    if (code < 48 || code > 57) {

      event.preventDefault();

    }

  }

  // =========================================

  cancel(): void {
    this.router.navigate(['/players']);
  }

}
