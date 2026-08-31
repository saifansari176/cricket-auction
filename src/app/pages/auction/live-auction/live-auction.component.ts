import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService, LiveScreenAction } from '../../../core/services/auction.service';
import { MessageService } from '../../../core/services/message.service';
import { LoadingService } from '../../../core/services/loading.service';
import { PlayerService } from '../../../core/services/player.service';
import { TeamService } from '../../../core/services/team.service';
import { PlayerCategoryService } from '../../../core/services/player-category.service';
import { PlayerCategory } from '../../../core/models/player-category';

type AuctionAction = {
  type: 'sold' | 'unsold';
  playerId: string;
};

@Component({ selector: 'app-live-auction', standalone: true, imports: [CommonModule], templateUrl: './live-auction.component.html', styleUrls: ['./live-auction.component.scss'] })
export class LiveAuctionComponent implements OnInit, OnDestroy {
  @ViewChild('auctionPage') auctionPage?: ElementRef<HTMLElement>;

  auction: AuctionSettings | null = null;
  currentPlayer: Player | null = null;
  teams: Team[] = [];
  categories: PlayerCategory[] = [];
  currentBid = 0;
  highestTeam: Team | null = null;
  loading = false;
  bidHistory: { team: Team; bid: number }[] = [];
  actionHistory: AuctionAction[] = [];
  isFullscreen = false;
  showUnsoldAnimation = false;
  showSoldAnimation = false;
  soldToTeamName = '';

  constructor(
    private playerService: PlayerService,
    private teamService: TeamService,
    private auctionService: AuctionService,
    private message: MessageService,
    private loadingService: LoadingService,
    private categoryService: PlayerCategoryService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    document.addEventListener('fullscreenchange', this.syncFullscreenState);

    this.loading = true;
    try {
      this.auction = await this.auctionService.get();
      this.categories = await this.categoryService.getCategories(this.auction?.activeAuctionId || this.auction?.id);
      await this.loadTeams();
      const selectedPlayer = this.auctionService.selectedPlayer$.value;
      if (selectedPlayer?.id) {
        const player = await this.playerService.getPlayerById(selectedPlayer.id);
        if (player) {
          this.setCurrentPlayer(player);
          this.auctionService.clearSelectedPlayer();
        } else {
          await this.loadNextPlayer();
        }
      } else {
        await this.loadNextPlayer();
      }
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('fullscreenchange', this.syncFullscreenState);
  }

  async loadTeams(): Promise<void> {
    this.teams = await this.teamService.getTeams();
  }

  async loadNextPlayer(action: LiveScreenAction = 'load'): Promise<void> {
    const categoryId = this.auctionService.selectedCategoryId$.value;
    const availablePlayers = (await this.playerService.getAvailablePlayers())
      .filter((player) => categoryId ? player.categoryId === categoryId : !player.categoryId);
    if (availablePlayers.length > 0) {
      this.setCurrentPlayer(availablePlayers[0], action);
      return;
    }

    const unsoldPlayers = (await this.playerService.getPlayers()).filter((player) =>
      player.status === 'Unsold' && (categoryId ? player.categoryId === categoryId : !player.categoryId)
    );
    const shouldBringBackUnsold = unsoldPlayers.length > 0
      && await this.message.confirm(
        `All available players are sold.\n\nDo you want to bring back ${unsoldPlayers.length} unsold players?`,
        'Bring Back Unsold Players',
        'Bring Back'
      );

    if (shouldBringBackUnsold) {
      await Promise.all(unsoldPlayers.map((player) => this.playerService.updatePlayer({ ...player, status: 'Available' })));
      await this.loadNextPlayer(action);
      return;
    }

    this.currentPlayer = null;
    this.currentBid = 0;
    this.highestTeam = null;
    this.bidHistory = [];
    this.publishLiveState(action);
  }

  get nextBid(): number {
    if (!this.auction || !this.currentPlayer) return 0;

    // The opening bidder buys at the player's base price. Every later bid increases it.
    return this.highestTeam
      ? this.currentBid + this.currentPlayerBidIncrease
      : this.currentBid;
  }

  get currentPlayerBidIncrease(): number {
    const playerIncrement = Number(this.currentPlayer?.bidIncreaseBy ?? 0);
    if (playerIncrement > 0) return playerIncrement;

    const categoryIncrement = Number(this.categories.find((category) => category.id === this.currentPlayer?.categoryId)?.bidIncreaseBy ?? 0);
    return categoryIncrement > 0 ? categoryIncrement : Number(this.auction?.bidIncreaseBy ?? 0);
  }

  canBid(team: Team): boolean {
    if (!this.auction || !this.currentPlayer || !team.id) return false;
    if (Number(team.playersBought || 0) >= Number(this.auction.playersPerTeam || 0)) return false;

    return this.nextBid <= this.getMaxAllowedBid(team);
  }

  bid(team: Team): void {
    if (!this.canBid(team)) return;
    if (this.highestTeam) this.bidHistory.push({ team: this.highestTeam, bid: this.currentBid });
    this.currentBid = this.nextBid;
    this.highestTeam = team;
    this.publishLiveState('bid');
    console.log(1234);
    
  }

  async undoLastBid(): Promise<void> {
    const lastBid = this.bidHistory.pop();
    if (lastBid) {
      this.currentBid = lastBid.bid;
      this.highestTeam = lastBid.team;
      return;
    }

    if (this.highestTeam) {
      this.currentBid = Number(this.currentPlayer?.baseBid || 0);
      this.highestTeam = null;
      return;
    }

    const lastAction = this.actionHistory[this.actionHistory.length - 1];

    if (lastAction?.type === 'unsold') {
      const restoredPlayer = await this.playerService.markAvailable(lastAction.playerId);

      if (!restoredPlayer) {
        this.message.error('The unsold player could not be returned to the auction.');
        return;
      }

      this.actionHistory.pop();
      this.setCurrentPlayer(restoredPlayer, 'undo');
      this.message.success(`${this.playerName} has been returned to the auction.`, 'Unsold Undone');
      return;
    }

    const lastSoldBid = lastAction?.type === 'sold'
      ? (await this.auctionService.getSoldPlayers())
          .filter((bid) => bid.playerId === lastAction.playerId)
          .sort((a, b) => Date.parse(b.soldDate) - Date.parse(a.soldDate))[0]
      : (await this.auctionService.getSoldPlayers())
          .sort((a, b) => Date.parse(b.soldDate) - Date.parse(a.soldDate))[0];

    if (!lastSoldBid?.id) {
      this.message.info('There is no completed sale to undo.');
      return;
    }

    const confirmed = await this.message.confirm(
      `Undo the sale of ${lastSoldBid.playerName}? The player will be returned to the auction.`,
      'Undo Last Sale',
      'Undo Sale'
    );

    if (!confirmed) {
      return;
    }

    await this.auctionService.deleteBid(lastSoldBid.id);
    const restoredPlayer = await this.playerService.markAvailable(lastSoldBid.playerId);

    if (!restoredPlayer) {
      this.message.error('The sale was removed, but the player could not be restored.');
      return;
    }

    await this.teamService.reconcileTeams(
      Number(this.auction?.pointsPerTeam || 0),
      Number(this.auction?.playersPerTeam || 0)
    );
    await this.loadTeams();
    if (lastAction?.type === 'sold') {
      this.actionHistory.pop();
    }
    this.setCurrentPlayer(restoredPlayer, 'undo');
    this.message.success(`${this.playerName} has been returned to the auction.`, 'Sale Undone');
  }

  async sold(): Promise<void> {
    if (!this.currentPlayer || !this.highestTeam || !this.currentPlayer.id || !this.highestTeam.id) {
      this.message.warning('Select a team and place a bid before marking this player as sold.');
      return;
    }
    this.soldToTeamName = this.highestTeam.teamName;
    this.showSoldAnimation = true;
    const soldPlayerId = this.currentPlayer.id;

    try {
      await this.loadingService.withoutLoader(async () => {
await this.auctionService.saveBid({ playerId: this.currentPlayer!.id!, playerName: this.playerName, teamId: this.highestTeam!.id!, teamName: this.highestTeam!.teamName, bidAmount: this.currentBid, mobile: this.currentPlayer!.mobile, jerseyNumber: this.currentPlayer!.jerseyNumber, tshirtSize: this.currentPlayer!.tshirtSize, photoUrl: this.currentPlayer!.photo, sold: true, soldDate: new Date().toISOString() });
        await this.playerService.markSold(this.currentPlayer!.id!, this.highestTeam!.id!, this.currentBid);
        await this.teamService.updateTeamPoints(this.highestTeam!.id!, this.currentBid);
        this.updateSoldTeamOnScreen(this.highestTeam!.id!, this.currentBid);
        this.actionHistory.push({ type: 'sold', playerId: soldPlayerId });
        await this.loadTeams();
        await this.loadNextPlayer('sold');

        const shouldReturnToDashboard = this.auctionService.shouldReturnToDashboardAfterSale();
        this.auctionService.clearReturnToDashboardAfterSale();

        if (shouldReturnToDashboard) {
          this.router.navigate(['/dashboard'], { queryParams: { list: 'available' } });
        }
      });
    } finally {
      this.showSoldAnimation = false;
    }
  }

  async unsold(): Promise<void> {
    if (!this.currentPlayer?.id) return;
    this.showUnsoldAnimation = true;
    const unsoldPlayerId = this.currentPlayer.id;

    try {
      await this.loadingService.withoutLoader(async () => {
        await this.playerService.markUnsold(this.currentPlayer!.id!);
        this.actionHistory.push({ type: 'unsold', playerId: unsoldPlayerId });
        await this.loadNextPlayer('unsold');
      });
    } finally {
      this.showUnsoldAnimation = false;
    }
  }

  async nextPlayer(): Promise<void> { await this.loadNextPlayer(); }
  isHighestBidder(team: Team): boolean { return this.highestTeam?.id === team.id; }
  get playerName(): string { return this.currentPlayer ? `${this.currentPlayer.firstName} ${this.currentPlayer.lastName}` : ''; }
  trackByTeam(_index: number, team: Team): string | undefined { return team.id; }

  async toggleFullscreen(): Promise<void> {
    const page = this.auctionPage?.nativeElement;

    try {
      if (!document.fullscreenElement && page?.requestFullscreen) {
        await page.requestFullscreen();
        this.isFullscreen = true;
        return;
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
        this.isFullscreen = false;
        return;
      }
    } catch {
      // Fall back to a fixed full-window auction view if the browser blocks fullscreen.
    }

    this.isFullscreen = !this.isFullscreen;
  }

  private setCurrentPlayer(player: Player, action: LiveScreenAction = 'load'): void {
    this.currentPlayer = player;
    this.currentBid = Number(player.baseBid || 0);
    this.highestTeam = null;
    this.bidHistory = [];
    this.publishLiveState(action);
  }

  private publishLiveState(action: LiveScreenAction = 'load'): void {
    if (!this.auction?.activeAuctionId && !this.auction?.id) return;
    void this.auctionService.saveLiveState({
      currentPlayerId: this.currentPlayer?.id || '',
      currentBid: this.currentBid,
      highestTeamId: this.highestTeam?.id || '',
      status: this.currentPlayer ? 'live' : 'completed',
      lastAction: action
    }, this.auction.activeAuctionId || this.auction.id);
  }

  private getMaxAllowedBid(team: Team): number {
    const playersPerTeam = Number(this.auction?.playersPerTeam || 0);
    const playersBought = Number(team.playersBought || 0);
    const remainingPoints = Number(team.remainingPoints || 0);
    const reservePrice = Number(this.auction?.basePlayerPrice || this.auction?.minimumBid || 0);
    const remainingSlotsAfterThisPlayer = Math.max(0, playersPerTeam - (playersBought + 1));
    const reserveAmount = remainingSlotsAfterThisPlayer * reservePrice;

    return remainingPoints - reserveAmount;
  }

  private updateSoldTeamOnScreen(teamId: string, bidAmount: number): void {
    this.teams = this.teams.map((team) => {
      if (team.id !== teamId) return team;

      return {
        ...team,
        remainingPoints: Number(team.remainingPoints || 0) - bidAmount,
        playersBought: Number(team.playersBought || 0) + 1
      };
    });
  }

  private syncFullscreenState = (): void => {
    this.isFullscreen = document.fullscreenElement === this.auctionPage?.nativeElement;
  };
}
