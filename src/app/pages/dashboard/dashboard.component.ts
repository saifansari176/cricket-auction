import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';
import { AuctionBid } from '../../core/models/bid';
import { Player } from '../../core/models/player';
import { Team } from '../../core/models/team';
import { AuctionService } from '../../core/services/auction.service';
import { PlayerService } from '../../core/services/player.service';
import { TeamService } from '../../core/services/team.service';
import { PlayerCategoryService } from '../../core/services/player-category.service';
import { PlayerCategory } from '../../core/models/player-category';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { MessageService } from '../../core/services/message.service';

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
  playerStatusFilter = '';
  categoryFilter = '';
  categories: PlayerCategory[] = [];
  playerFilter = '';
  teamFilter = '';

  constructor(
    private playerService: PlayerService,
    private teamService: TeamService,
    private auctionService: AuctionService,
private router: Router,
    private categoryService: PlayerCategoryService,
    private imagePreview: ImagePreviewService,
    private message: MessageService
  ) { }

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
      this.categories = await this.categoryService.getCategories();
    } finally {
      this.loading = false;
    }
  }

  showList(list: DashboardList): void {
    this.activeList = list;
    this.tableFilter = '';
    this.playerTypeFilter = '';
    this.playerStatusFilter = '';
    this.categoryFilter = '';
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
    const search = this.playerFilter.trim().toLowerCase();
    const players = this.filterPlayers(this.players);

    if (!filter && !search) {
      return players;
    }

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        [
          player.firstName,
          player.lastName,
          player.playerType,
          player.status,
          player.baseBid,
        ].some((value) =>
          String(value ?? '').toLowerCase().includes(search)
        );

      const matchesFilter =
        !filter ||
        this.matchesFilter(filter, [
          player.firstName,
          player.lastName,
          player.playerType,
          player.status,
          player.baseBid,
        ]);

      return matchesSearch && matchesFilter;
    });
  }
  get filteredTeams(): Team[] {
    const filter = this.teamFilter.trim().toLowerCase();
    if (!filter) return this.teams;

    return this.teams.filter((team) => [
      team.teamName, team.ownerName, team.totalPoints, team.remainingPoints, team.playersBought
    ].some((value) => String(value ?? '').toLowerCase().includes(filter)));
  }

  get filteredSoldPlayers(): AuctionBid[] {
    const filter = this.normalizedFilter;
    const search = this.playerFilter.trim().toLowerCase();
    const players = this.soldPlayers.filter((player) =>
      this.matchesPlayerType(player.playerId)
    );

    if (!filter && !search) {
      return players;
    }

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        [
          player.playerName,
          player.teamName,
          this.getBidPlayerType(player),
          player.bidAmount,
          player.soldDate,
        ].some((value) =>
          String(value ?? '').toLowerCase().includes(search)
        );

      const matchesFilter =
        !filter ||
        this.matchesFilter(filter, [
          player.playerName,
          player.teamName,
          this.getBidPlayerType(player),
          player.bidAmount,
          player.soldDate,
        ]);

      return matchesSearch && matchesFilter;
    });
  }

  get filteredAvailablePlayers(): Player[] {
    const filter = this.normalizedFilter;
    const search = this.playerFilter.trim().toLowerCase();

    const players = this.filterPlayers(this.availablePlayers).filter(
      (player) =>
        !this.categoryFilter ||
        (this.categoryFilter === '__regular__'
          ? !player.categoryId
          : player.categoryId === this.categoryFilter)
    );

    if (!filter && !search) {
      return players;
    }

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        [
          player.firstName,
          player.lastName,
          player.playerType,
          player.baseBid,
        ].some((value) =>
          String(value ?? '').toLowerCase().includes(search)
        );

      const matchesFilter =
        !filter ||
        this.matchesFilter(filter, [
          player.firstName,
          player.lastName,
          player.playerType,
          player.baseBid,
        ]);

      return matchesSearch && matchesFilter;
    });
  }

  get filteredUnsoldPlayers(): Player[] {
    const filter = this.normalizedFilter;
    const search = this.playerFilter.trim().toLowerCase();
    const players = this.filterPlayersByType(this.unsoldPlayers);

    if (!filter && !search) {
      return players;
    }

    return players.filter((player) => {
      const matchesSearch =
        !search ||
        [
          player.firstName,
          player.lastName,
          player.playerType,
          player.baseBid,
        ].some((value) =>
          String(value ?? '').toLowerCase().includes(search)
        );

      const matchesFilter =
        !filter ||
        this.matchesFilter(filter, [
          player.firstName,
          player.lastName,
          player.playerType,
          player.baseBid,
        ]);

      return matchesSearch && matchesFilter;
    });
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

  get playerStatuses(): string[] {
    return Array.from(new Set(this.players.map((player) => player.status).filter(Boolean))).sort();
  }

  get showPlayerTypeFilter(): boolean {
    return this.activeList !== 'teams';
  }

  get mobilePlayerRows(): any[] {
    if (this.activeList === 'players') return this.filteredPlayers;
    if (this.activeList === 'available') return this.filteredAvailablePlayers;
    if (this.activeList === 'unsold') return this.filteredUnsoldPlayers;
    return this.filteredSoldPlayers;
  }

  getBidPlayerType(bid: AuctionBid): string {
    return this.players.find((player) => player.id === bid.playerId)?.playerType || '-';
  }

  getBidPlayerPhoto(bid: AuctionBid): string {
    return this.players.find((player) => player.id === bid.playerId)?.photo || '';
  }

  openPreview(url: string, name = ''): void {
    if (url) {
      this.imagePreview.open(url, name);
    }
  }

  async changeSoldPlayerStatus(bid: AuctionBid, event: Event): Promise<void> {
    const status = (event.target as HTMLSelectElement)?.value;
    if (!status) return;
    if (!bid.playerId || !bid.id) {
      this.message.warning('This player or bid record is missing required data.');
      return;
    }

    const confirmed = await this.message.confirm(
      `Mark "${bid.playerName}" as ${status}? This will remove the player from the sold list and delete the old bid record.`,
      'Change Player Status',
      `Mark ${status}`
    );

    if (!confirmed) {
      return;
    }

    try {
      if (status === 'Available') {
        await this.playerService.markAvailable(bid.playerId);
      } else {
        await this.playerService.markUnsold(bid.playerId);
      }

      await this.auctionService.deleteBid(bid.id);

      const team = this.teams.find((t) => t.id === bid.teamId);
      if (team?.id) {
        await this.teamService.updateTeam({
          ...team,
          remainingPoints: Number(team.remainingPoints || 0) + Number(bid.bidAmount || 0),
          playersBought: Math.max(0, Number(team.playersBought || 0) - 1)
        });
      }

      await this.refreshData(false);

      this.message.success(`${bid.playerName} is now ${status}. Bid record and team allocation updated.`);
    } catch {
      this.message.error('Could not update the player status. Please try again.');
    }
  }

  private async refreshData(showLoader = true): Promise<void> {
    if (showLoader) this.loading = true;
    try {
      const [players, soldPlayers] = await Promise.all([
        this.playerService.getPlayers(),
        this.auctionService.getSoldPlayers()
      ]);
      this.players = players;
      this.soldPlayers = soldPlayers;
      this.availablePlayers = players.filter((player) => this.isPlayerStatus(player, 'Available'));
      this.unsoldPlayers = players.filter((player) => player.status === 'Unsold');
    } finally {
      this.loading = false;
    }
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

  private filterPlayers(players: Player[]): Player[] {
    const status = this.playerStatusFilter.trim().toLowerCase();
    return this.filterPlayersByType(players).filter((player) => !status || player.status.toLowerCase() === status);
  }

  private matchesPlayerType(playerId: string): boolean {
    const type = this.normalizedPlayerTypeFilter;
    if (!type) return true;

    return this.players.find((player) => player.id === playerId)?.playerType.toLowerCase() === type;
  }

  startAuction(player: Player): void {
    if (!player.id) return;

    const playerName = `${player.firstName} ${player.lastName}`;
    this.auctionService.setSelectedCategory(player.categoryId || '');
    this.auctionService.setSelectedPlayer(player.id, playerName);
    this.router.navigate(['/auction']);
  }

  downloadAvailablePlayersExcel(): void {
    const data = this.filteredAvailablePlayers.map((player) => ({
      'Sr No': this.filteredAvailablePlayers.indexOf(player) + 1,
      'First Name': player.firstName,
      'Last Name': player.lastName,
      'Player Type': player.playerType,
      // 'Mobile Number': player.mobile,
      // 'T-Shirt Size': player.tshirtSize,
      // Photo: player.photo
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 60 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Available Players');
    XLSX.writeFile(workbook, 'Available-Players.xlsx');
  }
}
