import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import * as XLSX from 'xlsx';

import { Team } from '../../../core/models/team';
import { TeamService } from '../../../core/services/team.service';
import { MessageService } from '../../../core/services/message.service';

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
    private message: MessageService
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

  private downloadFile(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

}
