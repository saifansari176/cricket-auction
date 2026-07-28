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
import { PlayerCategory } from '../../../core/models/player-category';
import { PlayerCategoryService } from '../../../core/services/player-category.service';

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
  categoryService = inject(PlayerCategoryService);

  auction: AuctionSettings | null = null;

  isEdit = false;

  playerId = '';

  existingPlayer: Player | null = null;
  categories: PlayerCategory[] = [];

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

    jerseyNumber: ['', [Validators.pattern(/^[0-9]{1,3}$/)]],

    playerType: ['', Validators.required],

    categoryId: [''],

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
    this.categories = await this.categoryService.getCategories(this.auction?.activeAuctionId || this.auction?.id);
    this.form.patchValue({ baseBid: this.getAuctionBaseBid() });

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

      jerseyNumber: player.jerseyNumber || '',

      playerType: player.playerType,

      categoryId: player.categoryId || '',

      tshirtSize: player.tshirtSize,

      trouserSize: player.trouserSize,

      baseBid: player.baseBid || this.getAuctionBaseBid(),

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

      jerseyNumber: this.form.value.jerseyNumber || '',

      playerType: this.form.value.playerType!,

      categoryId: this.form.value.categoryId || '',

      categoryName: this.getSelectedCategory()?.name || '',

      tshirtSize: this.form.value.tshirtSize!,

      trouserSize: this.form.value.trouserSize!,

      baseBid: Number(this.getSelectedCategory()?.basePrice ?? this.getAuctionBaseBid()),

      bidIncreaseBy: Number(this.getSelectedCategory()?.bidIncreaseBy ?? this.auction?.bidIncreaseBy ?? 0),

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

      if (!await this.playerService.canAddPlayer()) {
        this.message.warning('Player limit reached. To buy more teams and get unlimited players, contact Saif Ansari: 9823300308 / 9320006789, Saad Ansari: 9699760242, Noor Ansari: 9689950988, Arif Ansari: 8793669939, Raj Ansari: 9175982907.');
        return;
      }

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

    if (!file.type.startsWith('image/')) {
      this.message.warning('Please select an image file.');
      input.value = '';
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

  onCategoryChange(): void {
    const category = this.getSelectedCategory();
    this.form.patchValue({ baseBid: category ? category.basePrice : this.getAuctionBaseBid() });
  }

  private getSelectedCategory(): PlayerCategory | undefined {
    return this.categories.find((category) => category.id === this.form.value.categoryId);
  }

  private getAuctionBaseBid(): number {
    return Number(this.auction?.basePlayerPrice ?? this.auction?.minimumBid ?? 0);
  }

  // =========================================

  cancel(): void {
    this.router.navigate(['/players']);
  }

}
