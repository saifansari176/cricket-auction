import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import * as XLSX from 'xlsx';

import { Team } from '../../../core/models/team';
import { TeamService } from '../../../core/services/team.service';
import { MessageService } from '../../../core/services/message.service';
import { AuctionService } from '../../../core/services/auction.service';

@Component({
  selector: 'app-team-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule
  ],
  templateUrl: './team-list.component.html',
  styleUrl: './team-list.component.scss'
})
export class TeamListComponent {

  teams: Team[] = [];

  loading = false;
  teamFilter = '';

  constructor(
    private teamService: TeamService,
    private message: MessageService,
    private auctionService: AuctionService
  ) { }

  async ngOnInit() {

    await this.loadTeams();

  }

  // ==============================
  // Load Teams
  // ==============================

  async loadTeams() {

    this.loading = true;

    this.teams = await this.teamService.getTeams();

    this.loading = false;

  }

  get filteredTeams(): Team[] {
    const filter = this.teamFilter.trim().toLowerCase();
    if (!filter) return this.teams;

    return this.teams.filter((team) => [
      team.teamName, team.ownerName, team.totalPoints, team.remainingPoints, team.playersBought
    ].some((value) => String(value ?? '').toLowerCase().includes(filter)));
  }

  // ==============================
  // Delete Team
  // ==============================

  async deleteTeam(id: string) {

    const confirmed = await this.message.confirm('Delete this team?', 'Delete Team', 'Delete');

    if (!confirmed) {

      return;

    }

    await this.teamService.deleteTeam(id);

    await this.loadTeams();

  }

  // ==============================
  // Export Excel
  // ==============================

  exportExcel() {

    const data = this.teams.map(team => ({

      'Team Name': team.teamName,

      'Owner Name': team.ownerName,

      'Total Points': team.totalPoints,

      'Remaining Points': team.remainingPoints,

      'Players Bought': team.playersBought,

      'Player Limit': team.playerLimit,

      'Logo': team.logo

    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    worksheet['!cols'] = [

      { wch: 25 },

      { wch: 25 },

      { wch: 18 },

      { wch: 18 },

      { wch: 18 },

      { wch: 18 },

      { wch: 60 }

    ];

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(

      workbook,

      worksheet,

      'Teams'

    );

    const excelBuffer = XLSX.write(

      workbook,

      {

        bookType: 'xlsx',

        type: 'array'

      }

    );

    const blob = new Blob(

      [excelBuffer],

      {

        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      }

    );

    this.downloadFile(blob, 'Teams.xlsx');
  }

  async importExcel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        this.message.warning('The Excel file does not contain a worksheet.');
        return;
      }

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]);
      await this.importExcelRows(rows);
    } catch (error) {
      console.error('Team Excel import failed', error);
      this.message.error('Unable to import Excel. Please check the file and try again.');
    } finally {
      input.value = '';
    }
  }

  private async importExcelRows(rows: Record<string, unknown>[]): Promise<void> {
    const settings = await this.auctionService.get();
    if (!settings) {
      this.message.warning('Auction Settings not found');
      return;
    }

    const defaultPoints = Number(settings.pointsPerTeam || 0);
    const defaultPlayerLimit = Number(settings.playersPerTeam || 0);
    const auctionId = settings.activeAuctionId || settings.id || '';
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const teamName = this.getCellValue(row, 'Team Name');
      if (!teamName) {
        skipped++;
        continue;
      }

      const totalPoints = this.getNumberCellValue(row['Total Points'], defaultPoints);
      const team: Team = {
        auctionId,
        teamName,
        ownerName: this.getCellValue(row, 'Owner Name'),
        logo: this.getCellValue(row, 'Logo'),
        totalPoints,
        remainingPoints: this.getNumberCellValue(row['Remaining Points'], totalPoints),
        playerLimit: this.getNumberCellValue(row['Player Limit'], defaultPlayerLimit),
        playersBought: this.getNumberCellValue(row['Players Bought'], 0)
      };

      try {
        if (await this.teamService.saveTeam(team)) {
          imported++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`Unable to import team "${teamName}":`, error);
        failed++;
      }
    }

    await this.loadTeams();
    const summary = `Imported: ${imported}\nSkipped: ${skipped}${failed ? `\nFailed: ${failed}` : ''}`;
    if (failed) {
      this.message.error(summary, 'Import Completed with Errors');
    } else {
      this.message.success(summary, 'Import Completed');
    }
  }

  private getCellValue(row: Record<string, unknown>, key: string): string {
    return String(row[key] ?? '').trim();
  }

  private getNumberCellValue(value: unknown, fallback: number): number {
    if (value === undefined || value === null || String(value).trim() === '') return fallback;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
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
