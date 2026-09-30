import { Component, OnDestroy } from '@angular/core';
import { PlayerService } from '../../../core/services/player.service';
import { RouterLink, RouterModule } from '@angular/router';
import { Player } from '../../../core/models/player';
import * as XLSX from 'xlsx';
import { createPlayerExcel } from '../../../shared/player-excel';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from '../../../core/services/message.service';
import { AuctionService } from '../../../core/services/auction.service';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { createPlayerPdf } from '../../../shared/player-pdf';
import { PaymentService } from '../../../core/services/payment.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [RouterLink, CommonModule, RouterModule, FormsModule],
  templateUrl: './player-list.component.html',
  styleUrl: './player-list.component.scss'
})
export class PlayerListComponent implements OnDestroy {
  players: Player[] = [];
  brokenPhotoUrls = new Set<string>();
  playerFilter = '';
  playerTypeFilter = '';
  playerStatusFilter = '';
  categoryFilter = '';
  publicPlayerListEnabled = false;
  updatingPublicPlayerList = false;
  activeAuctionId = '';
  publicPlayerListToken = '';
  publicPlayerListSlug = '';
  auctionName = 'Cricbids';
  preparingCatalogue = false;
  pdfDownloadUrl = '';
  exportingExcel = false;
  excelDownloadUrl = '';
  excelExportError = '';
  private destroyed = false;
  paymentEnabled = false;
  private activeAuctionSubscription?: Subscription;

  constructor(
    private playerService: PlayerService,
    private auctionService: AuctionService,
    private message: MessageService,
    private imagePreview: ImagePreviewService,
    private paymentService: PaymentService
  ) {}

  async ngOnInit(): Promise<void> {
    this.activeAuctionSubscription = this.auctionService.activeAuction$.subscribe((auction) => {
      this.paymentEnabled = auction?.registrationPaymentEnabled === true;
    });
    await this.loadPlayers();
    await this.loadPublicPlayerListSetting();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.activeAuctionSubscription?.unsubscribe();
    if (this.excelDownloadUrl) URL.revokeObjectURL(this.excelDownloadUrl);
    if (this.pdfDownloadUrl) URL.revokeObjectURL(this.pdfDownloadUrl);
  }

  async downloadCatalogue(): Promise<void> {
    if (this.preparingCatalogue || !this.filteredPlayers.length) return;
    if (this.pdfDownloadUrl) {
      this.downloadPreparedFile(this.pdfDownloadUrl, 'Players.pdf');
      return;
    }
    this.preparingCatalogue = true;
    if (this.pdfDownloadUrl) URL.revokeObjectURL(this.pdfDownloadUrl);
    this.pdfDownloadUrl = '';
    try {
      const { bytes } = await createPlayerPdf(this.auctionName, [...this.filteredPlayers]);
      if (this.destroyed) return;
      this.pdfDownloadUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    } catch {
      this.message.error('Unable to prepare the catalogue. Please try again.');
    } finally {
      this.preparingCatalogue = false;
    }
  }

  async loadPlayers() {
    const [players, auction] = await Promise.all([
      this.playerService.getPlayers(),
      this.auctionService.get()
    ]);
    this.paymentEnabled = auction?.registrationPaymentEnabled === true;
    const auctionId = auction?.activeAuctionId || auction?.id || '';
    this.players = await Promise.all(players.map(async (player) => {
      if (player.paymentStatus !== 'Verified' || !player.paymentId || Number(player.paymentAmount || 0) > 0 || !auctionId) {
        return player;
      }
      try {
        const paymentAmount = await this.paymentService.getVerifiedPaymentAmount(auctionId, player.paymentId);
        const updatedPlayer = { ...player, auctionId, paymentAmount };
        await this.playerService.updatePlayer(updatedPlayer);
        return updatedPlayer;
      } catch (error) {
        console.error(`Unable to sync payment ${player.paymentId}:`, error);
        return player;
      }
    }));
  }

  paymentAmountLabel(player: Player): string {
    if (player.paymentStatus !== 'Verified') return '-';
    const amount = Number(player.paymentAmount || 0);
    return amount > 0 ? `₹${amount}` : 'Paid — syncing amount';
  }

  get paidPlayersCount(): number {
    return this.players.filter((player) => player.paymentStatus === 'Verified' && !!player.paymentId).length;
  }

  get totalPaidAmount(): number {
    return this.players
      .filter((player) => player.paymentStatus === 'Verified' && !!player.paymentId)
      .reduce((total, player) => total + Number(player.paymentAmount || 0), 0);
  }

  get pendingPaymentPlayersCount(): number {
    return this.players.filter((player) => player.paymentRequired && player.paymentStatus !== 'Verified').length;
  }

  async deletePlayer(id: string) {
    const confirmed = await this.message.confirm('Delete this player?', 'Delete Player', 'Delete');

    if (!confirmed) {
      return;
    }

    await this.playerService.deletePlayer(id);
    await this.loadPlayers();
  }

  get playerTypes(): string[] {
    return Array.from(new Set(this.players.map((player) => player.playerType).filter(Boolean))).sort();
  }

  get playerStatuses(): string[] {
    return Array.from(new Set(this.players.map((player) => player.status).filter(Boolean))).sort();
  }

get categories(): string[] {
  return Array.from(new Set(this.players.map(player => player.categoryName).filter((name): name is string => !!name))).sort();
}

  get filteredPlayers(): Player[] {
    const search = this.playerFilter.trim().toLowerCase();
    const type = this.playerTypeFilter.trim().toLowerCase();
    const status = this.playerStatusFilter.trim().toLowerCase();
    const category = this.categoryFilter.trim().toLowerCase();

    return this.players.filter((player) => {
      const matchesType = !type || String(player.playerType || '').toLowerCase() === type;
      const matchesStatus = !status || player.status.toLowerCase() === status;
      const matchesCategory = !category
        || (category === '__regular__' && !player.categoryName)
        || player.categoryName?.toLowerCase() === category;
      const matchesSearch = !search || [
        player.firstName, player.lastName, player.mobile, player.jerseyNumber,
        player.playerType, player.status, player.baseBid
      ].some((value) => String(value ?? '').toLowerCase().includes(search));
      return matchesType && matchesStatus && matchesSearch && matchesCategory;
    });
  }

  clearFilters(): void {
    this.playerFilter = '';
    this.playerTypeFilter = '';
    this.playerStatusFilter = '';
    this.categoryFilter = '';
  }

  async togglePublicPlayerList(): Promise<void> {
    if (!this.activeAuctionId || this.updatingPublicPlayerList) return;

    this.updatingPublicPlayerList = true;
    const enabled = !this.publicPlayerListEnabled;
    try {
      const access = await this.auctionService.setPublicPlayerListEnabled(this.activeAuctionId, enabled);
      this.publicPlayerListToken = access.token;
      this.publicPlayerListSlug = access.slug;
      this.publicPlayerListEnabled = enabled;
      this.message.success(enabled ? 'Public player list is now enabled.' : 'Public player list is now disabled.');
    } finally {
      this.updatingPublicPlayerList = false;
    }
  }

  async copyPublicPlayerListLink(): Promise<void> {
    if (!this.publicPlayerListToken) return;
    const link = `${window.location.origin}/player-list/${encodeURIComponent(this.publicPlayerListSlug)}--${encodeURIComponent(this.publicPlayerListToken)}`;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      this.message.success('Public player-list link copied.');
      return;
    }
    this.message.info(`Copy public player-list link:\n${link}`);
  }

  private async loadPublicPlayerListSetting(): Promise<void> {
    const auction = await this.auctionService.get();
    this.auctionName = auction?.auctionName || 'Cricbids';
    this.activeAuctionId = auction?.activeAuctionId || auction?.id || '';
    this.publicPlayerListToken = auction?.publicPlayerListToken || '';
    this.publicPlayerListSlug = auction?.publicPlayerListSlug || '';
    this.publicPlayerListEnabled = auction?.publicPlayerListEnabled === true && !!this.publicPlayerListToken;
  }

  async exportExcel(): Promise<void> {
    if (this.exportingExcel || !this.players.length) return;
    if (this.excelDownloadUrl) {
      this.downloadPreparedFile(this.excelDownloadUrl, 'Players.xlsx');
      return;
    }
    this.exportingExcel = true;
    this.excelExportError = '';
    if (this.excelDownloadUrl) URL.revokeObjectURL(this.excelDownloadUrl);
    this.excelDownloadUrl = '';
    try {
      const { bytes } = await createPlayerExcel([...this.players]);
      if (this.destroyed) return;
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      this.excelDownloadUrl = URL.createObjectURL(blob);
    } catch (error: unknown) {
      console.error('Player Excel export failed', error);
      this.excelExportError = 'Unable to export Excel. Please refresh the page and try again.';
      this.message.error(this.excelExportError);
    } finally {
      this.exportingExcel = false;
    }
  }
  private downloadPreparedFile(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  private getExportData() {
    return this.players.map(player => ({
      'First Name': player.firstName,
      'Last Name': player.lastName,
      'Mobile': player.mobile,
      'Jersey Number': player.jerseyNumber,
      'Player Type': player.playerType,
      'T-Shirt Size': player.tshirtSize,
      'Trouser Size': player.trouserSize,
      'Base Bid': player.baseBid,
      'Photo': player.photo,
      'Note': player.note,
      'Status': player.status,
      'Payment Status': player.paymentStatus || 'Not paid',
      'Payment Amount': player.paymentStatus === 'Verified' ? Number(player.paymentAmount || 0) : 0
    }));
  }

  exportCsv(): void {
    const rows = this.getExportData();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet) + [
      '',
      'Payment Summary,Value',
      `Total Players,${this.players.length}`,
      `Paid Players,${this.paidPlayersCount}`,
      `Pending Payments,${this.pendingPaymentPlayersCount}`,
      `Total Collected,${this.totalPaidAmount}`
    ].join('\n');
    this.downloadFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'Players.csv');
  }

  importExcel(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (loadEvent: ProgressEvent<FileReader>) => {
      const result = loadEvent.target?.result;
      if (typeof result !== 'string') return;

      const workbook = XLSX.read(result, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const excelData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);
      const [existingPlayers, auction] = await Promise.all([
        this.playerService.getPlayers(),
        this.auctionService.get()
      ]);
      const baseBid = Number(auction?.basePlayerPrice ?? auction?.minimumBid ?? 0);

      let imported = 0;
      let skipped = 0;

      for (const row of excelData) {
        const mobile = this.getCellValue(row, 'Mobile').replace('.0', '').trim();
        const jerseyNumber = this.getCellValue(row, 'Jersey Number');
        if (!/^[0-9]{10}$/.test(mobile) || !/^[0-9]{1,3}$/.test(jerseyNumber)) {
          skipped++;
          continue;
        }

        const exists = existingPlayers.some(p => p.mobile === mobile);
        if (exists) {
          skipped++;
          continue;
        }

        const player: Player = {
          firstName: this.getCellValue(row, 'First Name'),
          lastName: this.getCellValue(row, 'Last Name'),
          mobile,
          jerseyNumber,
          playerType: this.getCellValue(row, 'Player Type'),
          tshirtSize: this.getCellValue(row, 'T-Shirt Size'),
          trouserSize: this.getCellValue(row, 'Trouser Size'),
          baseBid,
          note: this.getCellValue(row, 'Note'),
          photo: this.normalizePhotoUrl(row['Photo']),
          status: 'Available'
        };

        const saved = await this.playerService.savePlayer(player);
        if (saved) {
          imported++;
        } else {
          skipped++;
        }
      }

      await this.loadPlayers();
      this.message.success(`Imported: ${imported}\nSkipped: ${skipped}`, 'Import Completed');
      input.value = '';
    };

    reader.readAsBinaryString(file);
  }

  private getCellValue(row: Record<string, unknown>, key: string): string {
    return String(row[key] ?? '').trim();
  }

  private normalizePhotoUrl(value: unknown): string {
    const url = String(value || '').trim();
    if (!url) return '';

    const driveFileId = this.getGoogleDriveFileId(url);
    if (driveFileId) {
      return `https://drive.google.com/uc?export=view&id=${driveFileId}`;
    }

    return url;
  }

  private getGoogleDriveFileId(url: string): string {
    const openMatch = url.match(/[?&]id=([^&]+)/);
    if (openMatch?.[1]) return openMatch[1];

    const fileMatch = url.match(/\/file\/d\/([^/]+)/);
    if (fileMatch?.[1]) return fileMatch[1];

    return '';
  }

  isPhotoBroken(url: string): boolean {
    return this.brokenPhotoUrls.has(url);
  }

markPhotoBroken(url: string): void {
    if (url) {
      this.brokenPhotoUrls.add(url);
    }
  }

  openPreview(url: string, name = ''): void {
    if (url) {
      this.imagePreview.open(url, name);
    }
  }

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

}
