import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { AuctionService } from '../../../core/services/auction.service';
import { PlayerService } from '../../../core/services/player.service';
import { TeamService } from '../../../core/services/team.service';
import { StorageService } from '../../../core/services/storage.service';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { MessageService } from '../../../core/services/message.service';
import { AuthService } from '../../../core/services/auth.service';
import { AppUser } from '../../../core/models/app-user';

@Component({
  selector: 'app-auction-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  ],
  templateUrl: './auction-settings.component.html',
  styleUrls: ['./auction-settings.component.scss']
})
export class AuctionSettingsComponent {

  private fb = inject(FormBuilder);

  private auctionService = inject(AuctionService);
  private playerService = inject(PlayerService);
  private teamService = inject(TeamService);

  private storageService = inject(StorageService);
  private message = inject(MessageService);
  private authService = inject(AuthService);

  loading = false;

  uploading = false;

  logoPreview = '';

  auctions: AuctionSettings[] = [];

  activeAuction: AuctionSettings | null = null;
  currentUser: AppUser | null = null;
  isAdmin = false;

  selectedAuctionId = '';

  showForm = false;

  form = this.fb.group({

    logo: [''],

    auctionName: ['', Validators.required],

    auctionDate: ['', Validators.required],

    pointsPerTeam: [0, [Validators.required, Validators.min(1)]],

    minimumBid: [0, [Validators.required, Validators.min(1)]],

    bidIncreaseBy: [0, [Validators.required, Validators.min(1)]],

    playersPerTeam: [0, [Validators.required, Validators.min(1)]],

    teamLimit: [2, [Validators.required, Validators.min(1)]],

    playerLimit: [10, [Validators.required, Validators.min(1)]],

    basePlayerPrice: [0]

  });

  // =====================================

  async ngOnInit() {

    this.loading = true;

    try {

      await this.loadAuctions();
      this.currentUser = await this.authService.waitForUser();
      this.isAdmin = this.authService.isAdmin(this.currentUser);

      const data = await this.auctionService.get();

      if (data) {

        const auctionId = data.activeAuctionId || '';
        this.activeAuction = this.auctions.find((auction) => auction.id === auctionId) || data;
        this.selectedAuctionId = data.activeAuctionId || this.activeAuction.id || '';

      }

      if (!this.selectedAuctionId && this.auctions.length === 0 && !this.isAdmin) {
        this.createNewAuction();
      }

    }
    catch (error) {

      console.error(error);

      this.message.error('Unable to load Auction Settings.');

    }

    this.loading = false;

  }

  // =====================================

  async loadAuctions(): Promise<void> {

    this.auctions = await this.auctionService.getAuctions();

  }

  // =====================================

  selectAuction(auction: AuctionSettings): void {

    this.activeAuction = auction;

    this.selectedAuctionId = auction.id || '';

    this.form.patchValue({

      logo: auction.logo,

      auctionName: auction.auctionName,

      auctionDate: auction.auctionDate,

      pointsPerTeam: Number(auction.pointsPerTeam),

      minimumBid: Number(auction.minimumBid),

      bidIncreaseBy: Number(auction.bidIncreaseBy),

      playersPerTeam: Number(auction.playersPerTeam),

      teamLimit: Number(auction.teamLimit ?? 2),

      playerLimit: Number(auction.playerLimit ?? 10),

      basePlayerPrice: Number(auction.basePlayerPrice)

    });

    this.logoPreview = auction.logo || '';

  }

  // =====================================

  async activateAuction(auction: AuctionSettings): Promise<void> {

    if (!auction.id) {

      return;

    }

    this.loading = true;

    try {

      await this.auctionService.setActiveAuction(auction.id);

      this.selectAuction(auction);

      this.showForm = false;

      this.message.success(`"${auction.auctionName}" selected successfully.`, 'Auction Selected');

    }
    catch (error) {

      console.error(error);

      this.message.error('Unable to select auction.');

    }

    this.loading = false;

  }

  // =====================================

  editAuction(auction: AuctionSettings): void {

    this.selectAuction(auction);

    this.showForm = true;

  }

  // =====================================

  createNewAuction(): void {

    this.showForm = true;

    this.activeAuction = null;

    this.selectedAuctionId = '';

    this.logoPreview = '';

    this.form.reset({

      logo: '',

      auctionName: '',

      auctionDate: '',

      pointsPerTeam: 0,

      minimumBid: 0,

      bidIncreaseBy: 0,

      playersPerTeam: 0,

      teamLimit: 2,

      playerLimit: 10,

      basePlayerPrice: 0

    });

  }

  // =====================================

  cancelForm(): void {

    this.showForm = false;

    this.logoPreview = '';

    this.form.reset();

    if (!this.selectedAuctionId && this.auctions.length === 0 && !this.isAdmin) {

      this.createNewAuction();

    }

  }

  // =====================================

  async deleteAuction(auction: AuctionSettings): Promise<void> {

    if (!auction.id) {

      return;

    }

    const confirmed = await this.message.confirm(`Delete "${auction.auctionName}"?`, 'Delete Auction', 'Delete');

    if (!confirmed) {

      return;

    }

    try {

      this.loading = true;

      await this.auctionService.deleteAuction(auction.id);

      await this.loadAuctions();

      if (this.selectedAuctionId === auction.id) {

        this.cancelForm();

        this.activeAuction = null;

        this.selectedAuctionId = '';

      }

      this.message.success('Auction deleted successfully.');

    } catch (error) {

      console.error(error);

      this.message.error('Unable to delete auction.');

    }

    this.loading = false;

  }

  // =====================================

  async onLogoChange(event: Event) {

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

    this.uploading = true;

    try {

      const imageUrl = await this.storageService.uploadAuctionLogo(file);

      this.form.patchValue({

        logo: imageUrl

      });

      this.logoPreview = imageUrl;

    }
    catch (error) {

      console.error(error);

      this.message.error('Logo upload failed.');

    }

    this.uploading = false;

  }

  // =====================================

  async save() {

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;

    }

    const settings: AuctionSettings = {

      logo: this.form.value.logo || '',

      auctionName: this.form.value.auctionName || '',

      auctionDate: this.form.value.auctionDate || '',

      pointsPerTeam: Number(this.form.value.pointsPerTeam),

      minimumBid: Number(this.form.value.minimumBid),

      bidIncrement: Number(this.form.value.bidIncreaseBy),

      bidIncreaseBy: Number(this.form.value.bidIncreaseBy),

      playersPerTeam: Number(this.form.value.playersPerTeam),

      teamLimit: Number(this.form.value.teamLimit),

      playerLimit: Number(this.form.value.playerLimit),

      basePlayerPrice: Number(this.form.value.basePlayerPrice)

    };
    try {

      this.loading = true;

      const savedAuctionId = await this.auctionService.save(settings, this.selectedAuctionId || undefined);

      await this.playerService.updateBaseBidForAuction(
        savedAuctionId,
        settings.basePlayerPrice
      );

      await this.teamService.reconcileTeams(
        settings.pointsPerTeam,
        settings.playersPerTeam
      );

      await this.loadAuctions();

      const savedAuction = this.auctions.find((auction) => auction.id === savedAuctionId);

      if (savedAuction) {

        this.selectAuction(savedAuction);

      }

      this.showForm = false;

      this.message.success('Auction settings saved successfully.');

    }
    catch (error) {

      console.error(error);

      this.message.error('Unable to save Auction Settings.');

    }

    this.loading = false;

  }

}
