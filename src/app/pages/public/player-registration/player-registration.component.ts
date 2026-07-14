import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { AuctionService } from '../../../core/services/auction.service';
import { PlayerRegistrationLinkService } from '../../../core/services/player-registration-link.service';
import { PlayerService } from '../../../core/services/player.service';
import { StorageService } from '../../../core/services/storage.service';
import { MessageService } from '../../../core/services/message.service';

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
  private registrationLinkService = inject(PlayerRegistrationLinkService);
  private storageService = inject(StorageService);
  private message = inject(MessageService);
  private route = inject(ActivatedRoute);

  auction: AuctionSettings | null = null;
  registrationEnabled = false;
  loading = true;
  saving = false;
  submitted = false;
  photoPreview = '';
  uploadingPhoto = false;
  private localPreviewUrl = '';

  form = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', Validators.required],
    mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    playerType: ['', Validators.required],
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
      const [auction, registrationSettings] = await Promise.all([
        auctionId ? this.auctionService.getAuctionById(auctionId) : this.auctionService.get(),
        this.registrationLinkService.getSettings()
      ]);

      this.auction = auction;
      this.registrationEnabled = registrationSettings.enabled;
    } finally {
      this.loading = false;
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || !this.registrationEnabled) {
      this.form.markAllAsTouched();
      return;
    }

    const player: Player = {
      firstName: this.form.value.firstName || '',
      lastName: this.form.value.lastName || '',
      mobile: this.form.value.mobile || '',
      playerType: this.form.value.playerType || '',
      tshirtSize: this.form.value.tshirtSize || '',
      trouserSize: this.form.value.trouserSize || '',
      baseBid: Number(this.auction?.basePlayerPrice || this.auction?.minimumBid || 0),
      note: this.form.value.note || '',
      photo: this.form.value.photo || '',
      status: 'Available',
      auctionId: this.auction?.activeAuctionId || this.auction?.id || ''
    };

    this.saving = true;

    try {
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

    this.setLocalPreview(file);
    this.uploadingPhoto = true;

    try {
      const uploadedUrl = await this.storageService.uploadPlayerImage(file);
      this.form.patchValue({ photo: uploadedUrl });
      this.photoPreview = uploadedUrl;
      this.clearLocalPreview();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      this.message.error('Image upload failed: ' + message);
    } finally {
      this.uploadingPhoto = false;
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
}
