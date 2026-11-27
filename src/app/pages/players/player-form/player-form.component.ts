import { nonBlank } from '../../../shared/validation/validators';
import { FieldErrorComponent } from '../../../shared/validation/field-error.component';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
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
import { PlayerFormField } from '../../../core/models/auction-settings';
import { isPlayerFormFieldVisible } from '../../../core/models/player-form-fields';
import { MessageService } from '../../../core/services/message.service';
import { PlayerCategory } from '../../../core/models/player-category';
import { PlayerCategoryService } from '../../../core/services/player-category.service';
import { ImageCropperComponent } from '../../../shared/image-cropper/image-cropper.component';

@Component({
  selector: 'app-player-form',
  standalone: true,
  imports: [FieldErrorComponent,
    CommonModule,
    ReactiveFormsModule, ImageCropperComponent
  ],
  templateUrl: './player-form.component.html',
  styleUrl: './player-form.component.scss'
})
export class PlayerFormComponent implements OnDestroy {

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
  saving = false;
  uploadingPhoto = false;
  cropFile: File | null = null;
  photoPreview = '';
  private pendingPhotoFile: File | null = null;
  private localPreviewUrl = '';

  ngOnDestroy(): void {
    this.clearLocalPreview();
  }

  form = this.fb.group({

    firstName: ['', [Validators.required, nonBlank, Validators.minLength(2)]],

    lastName: ['', [Validators.required, nonBlank]],

    mobile: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[0-9]{10}$/)
      ]
    ],

    jerseyNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{1,3}$/)]],

    playerType: ['', Validators.required],

    currentTeam: [''],

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
    this.configureFieldValidators();
    this.categories = this.isFieldVisible('category')
      ? await this.categoryService.getCategories(this.auction?.activeAuctionId || this.auction?.id)
      : [];
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
    this.photoPreview = player.photo || '';

    this.form.patchValue({

      firstName: player.firstName,

      lastName: player.lastName,

      mobile: player.mobile,

      jerseyNumber: player.jerseyNumber || '',

      playerType: player.playerType,

      currentTeam: player.currentTeam || '',

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

  async save(): Promise<void> {

    if (this.cropFile) {
      this.message.warning('Please finish or cancel photo cropping before saving.');
      return;
    }

    if (this.saving || this.uploadingPhoto) {
      return;
    }

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;

    }

    this.saving = true;
    let uploadedPhotoUrl = '';

    try {
    const player: Player = {

      id: this.isEdit ? this.playerId : undefined,

      firstName: this.form.value.firstName!,

      lastName: this.form.value.lastName!,

      mobile: this.form.value.mobile!,

      jerseyNumber: this.form.value.jerseyNumber || '',

      playerType: this.form.value.playerType!,

      currentTeam: this.form.value.currentTeam || '',

      categoryId: this.form.value.categoryId || '',

      categoryName: this.getSelectedCategory()?.name || '',

      tshirtSize: this.form.value.tshirtSize!,

      trouserSize: this.form.value.trouserSize!,

      baseBid: Number(this.getSelectedCategory()?.basePrice ?? this.getAuctionBaseBid()),

      bidIncreaseBy: Number(this.getSelectedCategory()?.bidIncreaseBy ?? this.auction?.bidIncreaseBy ?? 0),

      note: this.form.value.note || '',

      photo: this.pendingPhotoFile ? '' : (this.form.value.photo === 'pending-upload' ? '' : (this.form.value.photo || '')),

      status: this.form.value.status || 'Available',

      auctionId: this.existingPlayer?.auctionId || this.auction?.activeAuctionId || ''

    };

    if (this.isEdit) {

      if (this.pendingPhotoFile) {
        this.uploadingPhoto = true;
        try {
          uploadedPhotoUrl = await this.storageService.uploadPlayerImage(this.pendingPhotoFile);
          player.photo = uploadedPhotoUrl;
        } finally {
          this.uploadingPhoto = false;
        }
      }
      if (this.isFieldVisible('photo') && !player.photo) {
        this.form.controls.photo.markAsTouched();
        this.message.warning('Please select a player photo before saving.');
        return;
      }
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

      if (await this.playerService.isMobileRegistered(player.auctionId, player.mobile)) {
        this.message.warning('This mobile number is already registered for this auction. Please use a different mobile number.');
        return;
      }

      if (this.pendingPhotoFile) {
        this.uploadingPhoto = true;
        try {
          uploadedPhotoUrl = await this.storageService.uploadPlayerImage(this.pendingPhotoFile);
          player.photo = uploadedPhotoUrl;
        } finally {
          this.uploadingPhoto = false;
        }
      }

      if (this.isFieldVisible('photo') && !player.photo) {
        this.form.controls.photo.markAsTouched();
        this.message.warning('Please select a player photo before saving.');
        return;
      }

      const saved = await this.playerService.savePlayer(player);

      if (!saved) {
        if (uploadedPhotoUrl) await this.deleteUploadedPhoto(uploadedPhotoUrl);
        this.message.warning('Player with this mobile number already exists.');
        return;
      }

      this.message.success('Player saved successfully.');

    }

    this.pendingPhotoFile = null;
    this.clearLocalPreview();
    await this.router.navigate(['/players']);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to save player. Please try again.';
      this.message.error(errorMessage);
    } finally {
      this.saving = false;
    }

  }

  // =========================================

  onPhotoChange(event: Event): void {

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

    this.cropFile = file;
    input.value = '';
  }

  async uploadCroppedPhoto(file: File): Promise<void> {
    this.cropFile = null;
    this.pendingPhotoFile = file;
    this.form.patchValue({ photo: 'pending-upload' });
    this.clearLocalPreview();
    this.localPreviewUrl = URL.createObjectURL(file);
    this.photoPreview = this.localPreviewUrl;

  }

  private async deleteUploadedPhoto(url: string): Promise<void> {
    try {
      await this.storageService.deleteUploadedFile(url);
    } catch (cleanupError) {
      console.warn('Unable to clean up uploaded player photo:', cleanupError);
    }
  }

  private clearLocalPreview(): void {
    if (this.localPreviewUrl) {
      URL.revokeObjectURL(this.localPreviewUrl);
      this.localPreviewUrl = '';
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

  isFieldVisible(field: PlayerFormField): boolean {
    return isPlayerFormFieldVisible(this.auction, 'addPlayer', field);
  }

  private configureFieldValidators(): void {
    const validators = {
      photo: [Validators.required],
      lastName: [Validators.required, nonBlank],
      jerseyNumber: [Validators.required, Validators.pattern(/^[0-9]{1,3}$/)],
      playerType: [Validators.required],
      tshirtSize: [Validators.required]
    } as const;

    for (const field of Object.keys(validators) as Array<keyof typeof validators>) {
      const control = this.form.controls[field];
      control.setValidators(this.isFieldVisible(field) ? [...validators[field]] : []);
      control.updateValueAndValidity({ emitEvent: false });
    }
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
