import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { AuctionService } from '../../../core/services/auction.service';
import { PlayerService } from '../../../core/services/player.service';
import { StorageService } from '../../../core/services/storage.service';
import { MessageService } from '../../../core/services/message.service';
import { PlayerCategory } from '../../../core/models/player-category';
import { PlayerCategoryService } from '../../../core/services/player-category.service';

@Component({
  selector: 'app-player-registration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './player-registration.component.html',
  styleUrl: './player-registration.component.scss'
})
export class PlayerRegistrationComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private auctionService = inject(AuctionService);
  private playerService = inject(PlayerService);
  private storageService = inject(StorageService);
  private message = inject(MessageService);
  private route = inject(ActivatedRoute);
  private categoryService = inject(PlayerCategoryService);

  auction: AuctionSettings | null = null;
  registrationEnabled = false;
  loading = true;
  saving = false;
  submitted = false;
  photoPreview = '';
  uploadingPhoto = false;
  categories: PlayerCategory[] = [];
  private localPreviewUrl = '';
  private photoUploadVersion = 0;

  form = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', Validators.required],
    mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    jerseyNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{1,3}$/)]],
    playerType: ['', Validators.required],
    currentTeam: [''],
    categoryId: [''],
    tshirtSize: ['', Validators.required],
    trouserSize: [''],
    note: [''],
    photo: ['', Validators.required]
  });

  ngOnDestroy(): void {
    this.clearLocalPreview();
  }

  async ngOnInit(): Promise<void> {
    try {
      const auctionId = this.route.snapshot.queryParamMap.get('auctionId') || '';
      const auction = auctionId
        ? await this.auctionService.getAuctionById(auctionId)
        : await this.auctionService.get();

      this.auction = auction;
      this.categories = await this.categoryService.getCategories(auction?.activeAuctionId || auction?.id);
      this.registrationEnabled = auction?.registrationLinkEnabled === true;
    } finally {
      this.loading = false;
    }
  }

  async submit(): Promise<void> {
    if (this.saving || this.uploadingPhoto) {
      return;
    }

    if (this.form.invalid || !this.registrationEnabled) {
      this.form.markAllAsTouched();
      return;
    }

    const player: Player = {
      firstName: this.form.value.firstName || '',
      lastName: this.form.value.lastName || '',
      mobile: this.form.value.mobile || '',
      jerseyNumber: this.form.value.jerseyNumber || '',
      playerType: this.form.value.playerType || '',
      currentTeam: this.form.value.currentTeam || '',
      categoryId: this.form.value.categoryId || '',
      categoryName: this.getSelectedCategory()?.name || '',
      tshirtSize: this.form.value.tshirtSize || '',
      trouserSize: this.form.value.trouserSize || '',
      baseBid: Number(this.getSelectedCategory()?.basePrice ?? this.auction?.basePlayerPrice ?? this.auction?.minimumBid ?? 0),
      bidIncreaseBy: Number(this.getSelectedCategory()?.bidIncreaseBy ?? this.auction?.bidIncreaseBy ?? 0),
      note: this.form.value.note || '',
      photo: this.form.value.photo || '',
      status: 'Available',
      auctionId: this.auction?.activeAuctionId || this.auction?.id || ''
    };

    this.saving = true;

    try {
      if (!await this.playerService.canAddPlayer(this.auction?.id || this.auction?.activeAuctionId)) {
        this.message.warning('Player limit reached. To buy more teams and get unlimited players, contact Saif Ansari: 9823300308 / 9320006789, Saad Ansari: 9699760242, Noor Ansari: 9689950988, Arif Ansari: 8793669939, Raj Ansari: 9175982907.');
        return;
      }

      const saved = await this.playerService.savePlayer(player);

      if (!saved) {
        this.message.warning('Player with this mobile number already exists.');
        return;
      }

      this.submitted = true;
      this.form.reset();
      this.photoPreview = '';
      this.clearLocalPreview();
    } finally {
      this.saving = false;
    }
  }

  async onPhotoChange(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.message.warning('Please select an image file.');
      input.value = '';
      return;
    }

    const uploadVersion = ++this.photoUploadVersion;
    this.form.patchValue({ photo: '' });
    this.setLocalPreview(file);
    this.uploadingPhoto = true;

    try {
      const uploadedUrl = await this.storageService.uploadPlayerImage(file);
      if (uploadVersion === this.photoUploadVersion) {
        this.form.patchValue({ photo: uploadedUrl });
        this.photoPreview = uploadedUrl;
        this.clearLocalPreview();
      }
    } catch (error: unknown) {
      if (uploadVersion === this.photoUploadVersion) {
        const message = error instanceof Error ? error.message : 'Please try again.';
        this.message.error('Image upload failed: ' + message);
      }
    } finally {
      if (uploadVersion === this.photoUploadVersion) {
        this.uploadingPhoto = false;
      }
    }
  }

  private setLocalPreview(file: File): void {
    this.clearLocalPreview();
    this.localPreviewUrl = URL.createObjectURL(file);
    this.photoPreview = this.localPreviewUrl;
  }

  private clearLocalPreview(): void {
    if (this.localPreviewUrl) {
      URL.revokeObjectURL(this.localPreviewUrl);
      this.localPreviewUrl = '';
    }
  }

  allowOnlyNumbers(event: KeyboardEvent): void {
    const code = event.which || event.keyCode;

    if (code < 48 || code > 57) {
      event.preventDefault();
    }
  }

  private getSelectedCategory(): PlayerCategory | undefined {
    return this.categories.find((category) => category.id === this.form.value.categoryId);
  }
}
