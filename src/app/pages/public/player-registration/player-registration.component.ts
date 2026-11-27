import { nonBlank } from '../../../shared/validation/validators';
import { FieldErrorComponent } from '../../../shared/validation/field-error.component';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { PlayerFormField } from '../../../core/models/auction-settings';
import { isPlayerFormFieldVisible } from '../../../core/models/player-form-fields';
import { Player } from '../../../core/models/player';
import { AuctionService } from '../../../core/services/auction.service';
import { PlayerService } from '../../../core/services/player.service';
import { StorageService } from '../../../core/services/storage.service';
import { MessageService } from '../../../core/services/message.service';
import { PlayerCategory } from '../../../core/models/player-category';
import { PlayerCategoryService } from '../../../core/services/player-category.service';
import { ImageCropperComponent } from '../../../shared/image-cropper/image-cropper.component';
import { PaymentService } from '../../../core/services/payment.service';

@Component({
  selector: 'app-player-registration',
  standalone: true,
  imports: [FieldErrorComponent, CommonModule, ReactiveFormsModule, ImageCropperComponent],
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
  private paymentService = inject(PaymentService);

  auction: AuctionSettings | null = null;
  registrationEnabled = false;
  loading = true;
  saving = false;
  submitted = false;
  photoPreview = '';
  uploadingPhoto = false;
  cropFile: File | null = null;
  private pendingPhotoFile: File | null = null;
  checkingMobile = false;
  paying = false;
  verifiedPaymentAmount = 0;
  categories: PlayerCategory[] = [];
  private localPreviewUrl = '';

  form = this.fb.group({
    firstName: ['', [Validators.required, nonBlank, Validators.minLength(2)]],
    lastName: ['', [Validators.required, nonBlank]],
    mobile: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
    jerseyNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{1,3}$/)]],
    playerType: ['', Validators.required],
    currentTeam: [''],
    categoryId: [''],
    tshirtSize: ['', Validators.required],
    trouserSize: [''],
    note: [''],
    photo: ['', Validators.required],
    paymentOrderId: [''],
    paymentId: [''],
    paymentVerified: [false]
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
      this.configureFieldValidators();
      this.categories = this.isFieldVisible('category')
        ? await this.categoryService.getCategories(auction?.activeAuctionId || auction?.id)
        : [];
      this.registrationEnabled = auction?.registrationLinkEnabled === true;
    } finally {
      this.loading = false;
    }
  }

  async submit(): Promise<void> {
    if (this.saving || this.uploadingPhoto || this.paying) {
      return;
    }

    if (this.form.invalid || !this.registrationEnabled) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.paymentRequired && !this.form.value.paymentVerified) {
      this.message.warning('Please complete the registration payment first.');
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
      photo: '',
      paymentRequired: this.paymentRequired,
      paymentOrderId: this.form.value.paymentOrderId || '',
      paymentId: this.form.value.paymentId || '',
      paymentAmount: this.paymentRequired ? this.verifiedPaymentAmount : 0,
      paymentPaidAt: this.paymentRequired ? new Date().toISOString() : '',
      paymentStatus: this.paymentRequired ? 'Verified' : 'Not required',
      status: 'Available',
      auctionId: this.auction?.activeAuctionId || this.auction?.id || ''
    };

    this.saving = true;

    try {
      if (!await this.playerService.canAddPlayer(this.auction?.id || this.auction?.activeAuctionId)) {
        this.message.warning('Player limit reached. To buy more teams and get unlimited players, contact Saif Ansari: 9823300308 / 9320006789, Saad Ansari: 9699760242, Noor Ansari: 9689950988, Arif Ansari: 8793669939, Raj Ansari: 9175982907.');
        return;
      }

      if (await this.playerService.isMobileRegistered(player.auctionId, player.mobile)) {
        this.message.warning('This mobile number is already registered for this auction. Please use a different mobile number.');
        return;
      }

      let uploadedPhotoUrl = '';
      if (this.pendingPhotoFile) {
        this.uploadingPhoto = true;
        try {
          uploadedPhotoUrl = await this.storageService.uploadPlayerImage(this.pendingPhotoFile);
          player.photo = uploadedPhotoUrl;
        } finally {
          this.uploadingPhoto = false;
        }
      } else {
        player.photo = this.form.value.photo || '';
      }

      if (this.isFieldVisible('photo') && !player.photo) {
        this.form.controls.photo.markAsTouched();
        this.message.warning('Please select a player photo before submitting.');
        return;
      }

      const saved = await this.playerService.savePlayer(player);

      if (!saved) {
        if (uploadedPhotoUrl) {
          await this.deleteUploadedPhoto(uploadedPhotoUrl);
        }
        this.message.warning('Player with this mobile number already exists.');
        return;
      }

      this.submitted = true;
      this.form.reset();
      this.verifiedPaymentAmount = 0;
      this.photoPreview = '';
      this.pendingPhotoFile = null;
      this.clearLocalPreview();
    } catch (error: unknown) {
      if (typeof player !== 'undefined' && player.photo && player.photo.startsWith('https://firebasestorage.googleapis.com/')) {
        await this.deleteUploadedPhoto(player.photo);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unable to submit registration. Please try again.';
      if (/already exists|already registered|duplicate/i.test(errorMessage)) {
        const mobileControl = this.form.controls.mobile;
        mobileControl.setErrors({ ...(mobileControl.errors || {}), duplicate: true });
        mobileControl.markAsTouched();
        this.message.warning('This mobile number is already registered for this auction. Please use a different mobile number.');
      } else {
        this.message.error(errorMessage || 'Unable to submit registration. Please try again.');
      }
    } finally {
      this.saving = false;
    }
  }

  onPhotoChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

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
    this.setLocalPreview(file);
  }

  get paymentRequired(): boolean {
    return this.auction?.registrationPaymentEnabled === true;
  }

  get registrationPaymentAmount(): number {
    return Number(this.auction?.registrationPaymentAmount || 0);
  }

  isFieldVisible(field: PlayerFormField): boolean {
    return isPlayerFormFieldVisible(this.auction, 'registration', field);
  }

  async payNow(): Promise<void> {
    if (this.paying || this.checkingMobile || this.form.value.paymentVerified) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.message.warning('Please complete all required registration details before payment.');
      return;
    }

    const auctionId = this.auction?.activeAuctionId || this.auction?.id || '';
    if (!auctionId || this.registrationPaymentAmount < 1) {
      this.message.warning('Registration payment is not configured. Please contact the organiser.');
      return;
    }

    this.checkingMobile = true;
    try {
      if (await this.playerService.isMobileRegistered(auctionId, this.form.value.mobile || '')) {
        this.message.warning('Player with this mobile number is already registered for this auction.');
        return;
      }
    } finally {
      this.checkingMobile = false;
    }

    this.paying = true;
    try {
      const payment = await this.paymentService.payForRegistration(
        auctionId,
        this.auction?.auctionName || 'Cricket Auction',
        this.registrationPaymentAmount
      );
      this.form.patchValue({
        paymentOrderId: payment.orderId,
        paymentId: payment.paymentId,
        paymentVerified: true
      });
      this.verifiedPaymentAmount = payment.amount;
      this.paying = false;
      await this.submit();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Please try again.';
      this.message.error(message);
    } finally {
      this.paying = false;
    }
  }

  private setLocalPreview(file: File): void {
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

  allowOnlyNumbers(event: KeyboardEvent): void {
    const code = event.which || event.keyCode;

    if (code < 48 || code > 57) {
      event.preventDefault();
    }
  }

  private getSelectedCategory(): PlayerCategory | undefined {
    return this.categories.find((category) => category.id === this.form.value.categoryId);
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
}
