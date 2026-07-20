import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { AuctionBid } from '../../core/models/bid';
import { Player } from '../../core/models/player';
import { Team } from '../../core/models/team';
import { AuctionService } from '../../core/services/auction.service';
import { PlayerService } from '../../core/services/player.service';
import { TeamService } from '../../core/services/team.service';

@Component({
  selector: 'app-reports',
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss'
})
export class ReportsComponent implements OnInit {
  teams: Team[] = [];
  players: Player[] = [];
  soldPlayers: AuctionBid[] = [];
  selectedTeam: Team | null = null;
  selectedTeamPlayers: AuctionBid[] = [];
  playerFilter = '';
  playerTypeFilter = '';
  loading = false;

  constructor(
    private teamService: TeamService,
    private auctionService: AuctionService,
    private playerService: PlayerService
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;

    try {
      const [teams, soldPlayers, players] = await Promise.all([
        this.teamService.getTeams(),
        this.auctionService.getSoldPlayers(),
        this.playerService.getPlayers()
      ]);

      this.teams = teams;
      this.soldPlayers = soldPlayers;
      this.players = players;
      this.selectTeam(teams[0] || null);
    } finally {
      this.loading = false;
    }
  }

  selectTeam(team: Team | null): void {
    this.selectedTeam = team;
    this.selectedTeamPlayers = team?.id
      ? this.soldPlayers.filter((player) => player.teamId === team.id)
      : [];
    this.playerFilter = '';
    this.playerTypeFilter = '';
  }

  getTeamSpent(team: Team): number {
    return this.soldPlayers
      .filter((player) => player.teamId === team.id)
      .reduce((total, player) => total + Number(player.bidAmount || 0), 0);
  }

  get filteredSelectedTeamPlayers(): AuctionBid[] {
    const filter = this.playerFilter.trim().toLowerCase();
    const players = this.selectedTeamPlayers.filter((player) => this.matchesPlayerType(player.playerId));
    if (!filter) return players;

    return players.filter((player) =>
      [
        player.playerName,
        player.teamName,
        this.getBidPlayerType(player),
        player.bidAmount,
        this.getBidPlayerMobile(player),
        this.getBidPlayerTshirtSize(player),
        player.soldDate
      ].some((value) => String(value ?? '').toLowerCase().includes(filter))
    );
  }

  get playerTypes(): string[] {
    return Array.from(new Set(this.players.map((player) => player.playerType).filter(Boolean))).sort();
  }

  getBidPlayerType(bid: AuctionBid): string {
    return this.players.find((player) => player.id === bid.playerId)?.playerType || '-';
  }

  getBidPlayerMobile(bid: AuctionBid): string {
    return bid.mobile || this.players.find((player) => player.id === bid.playerId)?.mobile || '-';
  }

  getBidPlayerJerseyNumber(bid: AuctionBid): string {
    return bid.jerseyNumber || this.players.find((player) => player.id === bid.playerId)?.jerseyNumber || '-';
  }

  getBidPlayerPhoto(bid: AuctionBid): string {
    return this.players.find((player) => player.id === bid.playerId)?.photo || '';
  }

  getBidPlayerTshirtSize(bid: AuctionBid): string {
    return bid.tshirtSize || this.players.find((player) => player.id === bid.playerId)?.tshirtSize || '-';
  }

  private matchesPlayerType(playerId: string): boolean {
    const type = this.playerTypeFilter.trim().toLowerCase();
    if (!type) return true;

    return this.players.find((player) => player.id === playerId)?.playerType.toLowerCase() === type;
  }

  downloadTableData(): void {
    if (!this.selectedTeam || this.selectedTeamPlayers.length === 0) {
      return;
    }

    const data = this.selectedTeamPlayers.map((player, index) => ({
      '#': index + 1,
      'Player Name': player.playerName,
      'Type': this.getBidPlayerType(player),
      'Mobile Number': this.getBidPlayerMobile(player),
      'Jersey Number': this.getBidPlayerJerseyNumber(player),
      'T-Shirt Size': this.getBidPlayerTshirtSize(player),
      'Sold Amount': player.bidAmount
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);

    worksheet['!cols'] = [
      { wch: 5 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, this.selectedTeam.teamName);

    const excelBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array'
    });

    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    this.downloadFile(blob, `${this.selectedTeam.teamName}_Purchased_Players.xlsx`);
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
