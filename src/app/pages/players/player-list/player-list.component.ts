import { Component } from '@angular/core';
import { PlayerService } from '../../../core/services/player.service';
import { RouterLink, RouterModule } from '@angular/router';
import { Player } from '../../../core/models/player';
import * as XLSX from 'xlsx';
import { CommonModule } from '@angular/common';
import { MessageService } from '../../../core/services/message.service';
import { AuctionService } from '../../../core/services/auction.service';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [RouterLink, CommonModule, RouterModule],
  templateUrl: './player-list.component.html',
  styleUrl: './player-list.component.scss'
})
export class PlayerListComponent {
  players: Player[] = [];
  brokenPhotoUrls = new Set<string>();

  constructor(
    private playerService: PlayerService,
    private auctionService: AuctionService,
    private message: MessageService
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadPlayers();
  }

  async loadPlayers() {
    this.players = await this.playerService.getPlayers();
    const auction = await this.auctionService.get();
    const baseBid = Number(auction?.basePlayerPrice ?? auction?.minimumBid ?? 0);

    this.players = this.players.map((player) => ({ ...player, baseBid }));
  }

  async deletePlayer(id: string) {
    const confirmed = await this.message.confirm('Delete this player?', 'Delete Player', 'Delete');

    if (!confirmed) {
      return;
    }

    await this.playerService.deletePlayer(id);
    await this.loadPlayers();
  }

  exportExcel() {
    const data = this.players.map(player => ({
      'First Name': player.firstName,
      'Last Name': player.lastName,
      'Mobile': player.mobile,
      'Player Type': player.playerType,
      'T-Shirt Size': player.tshirtSize,
      'Trouser Size': player.trouserSize,
      'Base Bid': player.baseBid,
      'Photo': player.photo,
      'Note': player.note,
      'Status': player.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 60 },
      { wch: 30 },
      { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Players');

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });

    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    this.downloadFile(blob, 'Players.xlsx');
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
        if (!/^[0-9]{10}$/.test(mobile)) {
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

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

}
