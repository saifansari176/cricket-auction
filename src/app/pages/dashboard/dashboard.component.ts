import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuctionBid } from '../../core/models/bid';
import { Player } from '../../core/models/player';
import { Team } from '../../core/models/team';
import { AuctionService } from '../../core/services/auction.service';
import { PlayerService } from '../../core/services/player.service';
import { TeamService } from '../../core/services/team.service';

type DashboardList = 'players' | 'teams' | 'available' | 'sold' | 'unsold';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  players: Player[] = [];
  teams: Team[] = [];
  soldPlayers: AuctionBid[] = [];
  availablePlayers: Player[] = [];
  unsoldPlayers: Player[] = [];
  activeList: DashboardList = 'players';
  loading = false;
  tableFilter = '';
  playerTypeFilter = '';

  constructor(
    private playerService: PlayerService,
    private teamService: TeamService,
    private auctionService: AuctionService
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;

    try {
      const [players, teams, soldPlayers] = await Promise.all([
        this.playerService.getPlayers(),
        this.teamService.getTeams(),
        this.auctionService.getSoldPlayers()
      ]);

      this.players = players;
      this.teams = teams;
      this.soldPlayers = soldPlayers;
      this.availablePlayers = players.filter((player) => this.isPlayerStatus(player, 'Available'));
      this.unsoldPlayers = players.filter((player) => player.status === 'Unsold');
    } finally {
      this.loading = false;
    }
  }

  showList(list: DashboardList): void {
    this.activeList = list;
    this.tableFilter = '';
    this.playerTypeFilter = '';
  }

  get activeTitle(): string {
    const titles: Record<DashboardList, string> = {
      players: 'All Players',
      teams: 'All Teams',
      available: 'Available Players',
      sold: 'Sold Players',
      unsold: 'Unsold Players'
    };

    return titles[this.activeList];
  }

  get filteredPlayers(): Player[] {
    const filter = this.normalizedFilter;
    const players = this.filterPlayersByType(this.players);
    if (!filter) return players;

    return players.filter((player) =>
      this.matchesFilter(filter, [
        player.firstName,
        player.lastName,
        player.playerType,
        player.status,
        player.baseBid
      ])
    );
  }

  get filteredTeams(): Team[] {
    const filter = this.normalizedFilter;
    if (!filter) return this.teams;

    return this.teams.filter((team) =>
      this.matchesFilter(filter, [
        team.teamName,
        team.ownerName,
        team.remainingPoints,
        team.playersBought
      ])
    );
  }

  get filteredSoldPlayers(): AuctionBid[] {
    const filter = this.normalizedFilter;
    const players = this.soldPlayers.filter((player) => this.matchesPlayerType(player.playerId));
    if (!filter) return players;

    return players.filter((player) =>
      this.matchesFilter(filter, [
        player.playerName,
        player.teamName,
        this.getBidPlayerType(player),
        player.bidAmount,
        player.soldDate
      ])
    );
  }

  get filteredAvailablePlayers(): Player[] {
    const filter = this.normalizedFilter;
    const players = this.filterPlayersByType(this.availablePlayers);
    if (!filter) return players;

    return players.filter((player) =>
      this.matchesFilter(filter, [
        player.firstName,
        player.lastName,
        player.playerType,
        player.baseBid
      ])
    );
  }

  get filteredUnsoldPlayers(): Player[] {
    const filter = this.normalizedFilter;
    const players = this.filterPlayersByType(this.unsoldPlayers);
    if (!filter) return players;

    return players.filter((player) =>
      this.matchesFilter(filter, [
        player.firstName,
        player.lastName,
        player.playerType,
        player.baseBid
      ])
    );
  }

  get activeFilteredCount(): number {
    const counts: Record<DashboardList, number> = {
      players: this.filteredPlayers.length,
      teams: this.filteredTeams.length,
      available: this.filteredAvailablePlayers.length,
      sold: this.filteredSoldPlayers.length,
      unsold: this.filteredUnsoldPlayers.length
    };

    return counts[this.activeList];
  }

  get playerTypes(): string[] {
    return Array.from(new Set(this.players.map((player) => player.playerType).filter(Boolean))).sort();
  }

  get showPlayerTypeFilter(): boolean {
    return this.activeList !== 'teams';
  }

  getBidPlayerType(bid: AuctionBid): string {
    return this.players.find((player) => player.id === bid.playerId)?.playerType || '-';
  }

  private get normalizedFilter(): string {
    return this.tableFilter.trim().toLowerCase();
  }

  private get normalizedPlayerTypeFilter(): string {
    return this.playerTypeFilter.trim().toLowerCase();
  }

  private matchesFilter(filter: string, values: unknown[]): boolean {
    return values.some((value) => String(value ?? '').toLowerCase().includes(filter));
  }

  private isPlayerStatus(player: Player, status: string): boolean {
    return String(player.status || '').toLowerCase() === status.toLowerCase();
  }

  private filterPlayersByType(players: Player[]): Player[] {
    const type = this.normalizedPlayerTypeFilter;
    if (!type) return players;

    return players.filter((player) => String(player.playerType || '').toLowerCase() === type);
  }

  private matchesPlayerType(playerId: string): boolean {
    const type = this.normalizedPlayerTypeFilter;
    if (!type) return true;

    return this.players.find((player) => player.id === playerId)?.playerType.toLowerCase() === type;
  }
}
