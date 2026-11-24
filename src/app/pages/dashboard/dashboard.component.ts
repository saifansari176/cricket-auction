import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
import { AuctionSettings } from '../../core/models/auction-settings';
import { PaymentService } from '../../core/services/payment.service';

type DashboardList = 'players' | 'teams' | 'available' | 'sold' | 'unsold' | 'categoryPlayers';

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
  categoryPlayers: Player[] = [];
  categoryActionSelections: Record<string, string> = {};
  activeList: DashboardList = 'players';
  loading = false;
  tableFilter = '';
  playerTypeFilter = '';
  playerStatusFilter = '';
  categoryFilter = '';
  categories: PlayerCategory[] = [];
  playerFilter = '';
  teamFilter = '';
  activeAuction: AuctionSettings | null = null;
  paymentSummaryLoading = false;

  constructor(
    private playerService: PlayerService,
    private teamService: TeamService,
    private auctionService: AuctionService,
    private router: Router,
    private route: ActivatedRoute,
    private categoryService: PlayerCategoryService,
    private imagePreview: ImagePreviewService,
    private message: MessageService,
    private paymentService: PaymentService
  ) { }

  async ngOnInit(): Promise<void> {
    const listFromRoute = this.route.snapshot.queryParamMap.get('list');
    if (listFromRoute === 'available' || listFromRoute === 'players' || listFromRoute === 'teams' || listFromRoute === 'sold' || listFromRoute === 'unsold' || listFromRoute === 'categoryPlayers') {
      this.activeList = listFromRoute as DashboardList;
    }

    this.loading = true;

    try {
      const [players, teams, soldPlayers, auction] = await Promise.all([
        this.playerService.getPlayers(),
        this.teamService.getTeams(),
        this.auctionService.getSoldPlayers(),
        this.auctionService.get()
      ]);

      this.activeAuction = auction;
      this.players = await this.syncPaymentAmounts(players, auction?.activeAuctionId || auction?.id || '');
      this.teams = teams;
      this.soldPlayers = soldPlayers;
      this.availablePlayers = players.filter((player) => this.isPlayerStatus(player, 'Available'));
      this.unsoldPlayers = players.filter((player) => this.isPlayerStatus(player, 'Unsold'));
      this.categories = await this.categoryService.getCategories();
      this.categoryPlayers = players.filter((player) => this.isCategoryPlayer(player));
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

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { list },
      queryParamsHandling: 'merge'
    });
  }

  get activeTitle(): string {
    const titles: Record<DashboardList, string> = {
      players: 'All Players',
      teams: 'All Teams',
      available: 'Available Players',
      sold: 'Sold Players',
      unsold: 'Unsold Players',
      categoryPlayers: 'Category Players'
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
      (player) => this.matchesCategoryFilter(player)
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

  get filteredCategoryPlayers(): Player[] {
    const filter = this.normalizedFilter;
    const search = this.playerFilter.trim().toLowerCase();
    const players = this.filterPlayers(this.categoryPlayers)
      .filter((player) => this.matchesCategoryFilter(player));

    if (!filter && !search) {
      return players;
    }

    return players.filter((player) => {
      const categoryName = this.getPlayerCategoryName(player);
      const values = [
        player.firstName,
        player.lastName,
        player.mobile,
        player.playerType,
        categoryName
      ];
      const matchesSearch = !search || values.some((value) =>
        String(value ?? '').toLowerCase().includes(search)
      );
      const matchesFilter = !filter || this.matchesFilter(filter, values);

      return matchesSearch && matchesFilter;
    });
  }

  get displayedAvailablePlayers(): Player[] {
    return this.activeList === 'categoryPlayers'
      ? this.filteredCategoryPlayers
      : this.filteredAvailablePlayers;
  }

  getPlayerCategoryName(player: Player): string {
    const savedCategoryName = player.categoryName?.trim();
    if (savedCategoryName) return savedCategoryName;
    if (!player.categoryId) return 'Regular';
    return this.categories.find((category) => category.id === player.categoryId)?.name
      || 'Unknown category';
  }

  private isCategoryPlayer(player: Player): boolean {
    if (player.categoryId) return true;
    const playerCategoryName = player.categoryName?.trim().toLowerCase();
    return !!playerCategoryName
      && this.categories.some((category) => category.name.trim().toLowerCase() === playerCategoryName);
  }

  private matchesCategoryFilter(player: Player): boolean {
    if (!this.categoryFilter) return true;
    if (this.categoryFilter === '__regular__') return !this.isCategoryPlayer(player);

    const selectedCategory = this.categories.find((category) => category.id === this.categoryFilter);
    return player.categoryId === this.categoryFilter
      || (!!selectedCategory?.name
        && player.categoryName?.trim().toLowerCase() === selectedCategory.name.trim().toLowerCase());
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
      unsold: this.filteredUnsoldPlayers.length,
      categoryPlayers: this.filteredCategoryPlayers.length
    };

    return counts[this.activeList];
  }

  get playerTypes(): string[] {
    return Array.from(new Set(this.players.map((player) => player.playerType).filter(Boolean))).sort();
  }

  get playerStatuses(): string[] {
    const statuses = new Map<string, string>();
    this.getStatusFilterPlayers().forEach((player) => {
      const status = String(player.status || '').trim();
      if (status) statuses.set(status.toLowerCase(), status);
    });
    return Array.from(statuses.values()).sort((a, b) => a.localeCompare(b));
  }

  private getStatusFilterPlayers(): Player[] {
    let players: Player[];
    switch (this.activeList) {
      case 'available':
        players = this.availablePlayers;
        break;
      case 'categoryPlayers':
        players = this.categoryPlayers;
        break;
      case 'sold':
        players = this.players.filter((player) => this.isPlayerStatus(player, 'Sold'));
        break;
      case 'unsold':
        players = this.unsoldPlayers;
        break;
      case 'teams':
        return [];
      default:
        players = this.players;
    }
    return this.filterPlayersByType(players).filter((player) => this.matchesCategoryFilter(player));
  }

  get categoryFilterOptions(): PlayerCategory[] {
    const status = this.playerStatusFilter.trim().toLowerCase();
    const players = this.activeList === 'categoryPlayers' ? this.categoryPlayers : this.availablePlayers;
    const filteredPlayers = this.filterPlayersByType(players).filter((player) =>
      !status || String(player.status || '').trim().toLowerCase() === status
    );

    return this.categories.filter((category) => !!category.id && filteredPlayers.some((player) =>
      player.categoryId === category.id
      || player.categoryName?.trim().toLowerCase() === category.name.trim().toLowerCase()
    ));
  }

  get hasRegularAvailablePlayers(): boolean {
    if (this.activeList !== 'available') return false;
    const status = this.playerStatusFilter.trim().toLowerCase();
    return this.filterPlayersByType(this.availablePlayers).some((player) =>
      (!status || String(player.status || '').trim().toLowerCase() === status)
      && !this.isCategoryPlayer(player)
    );
  }

  setCategoryFilter(categoryId: string): void {
    this.categoryFilter = categoryId;
    const status = this.playerStatusFilter.trim().toLowerCase();
    if (status && !this.getStatusFilterPlayers().some((player) =>
      String(player.status || '').trim().toLowerCase() === status
    )) {
      this.playerStatusFilter = '';
    }
  }
  get showPlayerTypeFilter(): boolean {
    return this.activeList !== 'teams';
  }

  get mobilePlayerRows(): any[] {
    if (this.activeList === 'players') return this.filteredPlayers;
    if (this.activeList === 'available') return this.filteredAvailablePlayers;
    if (this.activeList === 'categoryPlayers') return this.filteredCategoryPlayers;
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
    if (status !== 'Available' && status !== 'Unsold') return;
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
      await this.auctionService.changeSoldBidStatus(bid.id, status);

      await this.refreshData(false);

      this.message.success(`${bid.playerName} is now ${status}. Bid record and team allocation updated.`);
    } catch {
      this.message.error('Could not update the player status. Please try again.');
    }
  }

  getSelectedCategoryAction(player: Player): string {
    return player.id ? this.categoryActionSelections[player.id] || '' : '';
  }

  setSelectedCategoryAction(player: Player, event: Event): void {
    if (!player.id) return;
    this.categoryActionSelections[player.id] = (event.target as HTMLSelectElement).value;
  }

  async applyCategoryPlayerAction(player: Player): Promise<void> {
    if (!player.id) return;
    const action = this.getSelectedCategoryAction(player);
    if (action === 'remove') {
      await this.removePlayerFromCategory(player);
      return;
    }

    const categoryId = action.startsWith('move:') ? action.slice(5) : '';
    const category = this.categories.find((item) => item.id === categoryId);
    if (!category?.id) {
      this.message.warning('Select a category action first.');
      return;
    }

    try {
      await this.playerService.updatePlayer({
        ...player,
        categoryId: category.id,
        categoryName: category.name,
        baseBid: Number(category.basePrice || 0),
        bidIncreaseBy: Number(category.bidIncreaseBy || this.activeAuction?.bidIncreaseBy || 0)
      });
      delete this.categoryActionSelections[player.id];
      await this.refreshData(false);
      this.message.success(`${player.firstName} ${player.lastName} moved to ${category.name}.`);
    } catch (error) {
      console.error('Unable to move the player to a category.', error);
      this.message.error('Could not move the player to the selected category.');
    }
  }

  async removePlayerFromCategory(player: Player): Promise<void> {
    if (!player.id) return;

    try {
      await this.playerService.updatePlayer({
        ...player,
        categoryId: '',
        categoryName: '',
        baseBid: Number(this.activeAuction?.basePlayerPrice ?? this.activeAuction?.minimumBid ?? 0),
        bidIncreaseBy: Number(this.activeAuction?.bidIncreaseBy || 0)
      });
      delete this.categoryActionSelections[player.id];
      await this.refreshData(false);
      this.message.success(`${player.firstName} ${player.lastName} removed from the category.`);
    } catch (error) {
      console.error('Unable to remove the player from its category.', error);
      this.message.error('Could not remove the player from its category.');
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
      this.unsoldPlayers = players.filter((player) => this.isPlayerStatus(player, 'Unsold'));
      this.categoryPlayers = players.filter((player) => this.isCategoryPlayer(player));
    } finally {
      this.loading = false;
    }
  }

  private async syncPaymentAmounts(players: Player[], auctionId: string): Promise<Player[]> {
    if (!auctionId) return players;
    this.paymentSummaryLoading = true;
    try {
      const pending = players.filter((player) =>
        player.paymentStatus === 'Verified'
        && !!player.paymentId
        && Number(player.paymentAmount || 0) <= 0
      );
      const updatedAmounts = new Map<string, number>();
      for (let index = 0; index < pending.length; index += 4) {
        const batch = pending.slice(index, index + 4);
        await Promise.all(batch.map(async (player) => {
          try {
            const paymentAmount = await this.paymentService.getVerifiedPaymentAmount(auctionId, player.paymentId!);
            updatedAmounts.set(player.id || player.mobile, paymentAmount);
          } catch (error) {
            console.error(`Unable to sync payment ${player.paymentId}:`, error);
          }
        }));
      }
      const updated = await Promise.all(players.map(async (player) => {
        const key = player.id || player.mobile;
        if (!updatedAmounts.has(key)) return player;
        const updatedPlayer = { ...player, auctionId, paymentAmount: updatedAmounts.get(key)! };
        await this.playerService.updatePlayer(updatedPlayer);
        return updatedPlayer;
      }));
      return updated;
    } finally {
      this.paymentSummaryLoading = false;
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
    return String(player.status || '').trim().toLowerCase() === status.toLowerCase();
  }

  private filterPlayersByType(players: Player[]): Player[] {
    const type = this.normalizedPlayerTypeFilter;
    if (!type) return players;

    return players.filter((player) => String(player.playerType || '').toLowerCase() === type);
  }

  private filterPlayers(players: Player[]): Player[] {
    const status = this.playerStatusFilter.trim().toLowerCase();
    return this.filterPlayersByType(players).filter((player) =>
      !status || String(player.status || '').trim().toLowerCase() === status
    );
  }

  private matchesPlayerType(playerId: string): boolean {
    const type = this.normalizedPlayerTypeFilter;
    if (!type) return true;

    return String(this.players.find((player) => player.id === playerId)?.playerType || '').toLowerCase() === type;
  }

  async startAuction(player: Player): Promise<void> {
    if (!player.id) return;

    if (player.status === 'Unsold') {
      try {
        const availablePlayer = await this.playerService.markAvailable(player.id);
        if (!availablePlayer) {
          this.message.error('Could not return this unsold player to the auction. Please refresh and try again.');
          return;
        }
      } catch (error) {
        console.error('Unable to return the unsold player to the auction.', error);
        this.message.error('Could not return this unsold player to the auction. Please try again.');
        return;
      }
    }

    const playerName = `${player.firstName} ${player.lastName}`;
    this.auctionService.startCategoryAuction(player.categoryId || '');
    this.auctionService.setSelectedPlayer(player.id, playerName);
    this.auctionService.setReturnToDashboardAfterSale(true);
    this.router.navigate(['/auction']);
  }

  trackByPlayer(_index: number, player: Player): string { return player.id || player.mobile || String(_index); }
  trackByTeam(_index: number, team: Team): string { return team.id || team.teamName || String(_index); }
  trackByBid(_index: number, bid: AuctionBid): string { return bid.id || bid.playerId || String(_index); }

  async downloadAvailablePlayersExcel(): Promise<void> {
    const data = this.filteredAvailablePlayers.map((player) => ({
      'Sr No': this.filteredAvailablePlayers.indexOf(player) + 1,
      'First Name': player.firstName,
      'Last Name': player.lastName,
      'Player Type': player.playerType,
      'UID': player.mobile,
      'T-Shirt Size': player.tshirtSize,
      'Trouser Size': player.trouserSize,
      Photo: player.photo
    }));

    const XLSX = await import('xlsx');
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
