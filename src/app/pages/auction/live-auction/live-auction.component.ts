import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService } from '../../../core/services/auction.service';
import { MessageService } from '../../../core/services/message.service';
import { PlayerService } from '../../../core/services/player.service';
import { TeamService } from '../../../core/services/team.service';

@Component({ selector: 'app-live-auction', standalone: true, imports: [CommonModule], templateUrl: './live-auction.component.html', styleUrls: ['./live-auction.component.scss'] })
export class LiveAuctionComponent implements OnInit, OnDestroy {
  @ViewChild('auctionPage') auctionPage?: ElementRef<HTMLElement>;

  auction: AuctionSettings | null = null;
  currentPlayer: Player | null = null;
  teams: Team[] = [];
  currentBid = 0;
  highestTeam: Team | null = null;
  loading = false;
  bidHistory: { team: Team; bid: number }[] = [];
  isFullscreen = false;
  showUnsoldAnimation = false;
  showSoldAnimation = false;
  soldToTeamName = '';

  constructor(
    private playerService: PlayerService,
    private teamService: TeamService,
    private auctionService: AuctionService,
    private message: MessageService
  ) {}

  async ngOnInit(): Promise<void> {
    document.addEventListener('fullscreenchange', this.syncFullscreenState);

    this.loading = true;
    try {
      this.auction = await this.auctionService.get();
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

  async loadNextPlayer(): Promise<void> {
    const availablePlayers = await this.playerService.getAvailablePlayers();
    if (availablePlayers.length > 0) {
      this.setCurrentPlayer(availablePlayers[0]);
      return;
    }

    const unsoldPlayers = (await this.playerService.getPlayers()).filter((player) => player.status === 'Unsold');
    const shouldBringBackUnsold = unsoldPlayers.length > 0
      && await this.message.confirm(
        `All available players are sold.\n\nDo you want to bring back ${unsoldPlayers.length} unsold players?`,
        'Bring Back Unsold Players',
        'Bring Back'
      );

    if (shouldBringBackUnsold) {
      await Promise.all(unsoldPlayers.map((player) => this.playerService.updatePlayer({ ...player, status: 'Available' })));
      await this.loadNextPlayer();
      return;
    }

    this.currentPlayer = null;
    this.currentBid = 0;
    this.highestTeam = null;
    this.bidHistory = [];
  }

  get nextBid(): number {
    if (!this.auction || !this.currentPlayer) return 0;

    // The opening bidder buys at the player's base price. Every later bid increases it.
    return this.highestTeam
      ? this.currentBid + Number(this.auction.bidIncreaseBy || 0)
      : this.currentBid;
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
  }

  undoLastBid(): void {
    const lastBid = this.bidHistory.pop();
    if (lastBid) {
      this.currentBid = lastBid.bid;
      this.highestTeam = lastBid.team;
      return;
    }
    this.currentBid = Number(this.currentPlayer?.baseBid || 0);
    this.highestTeam = null;
  }

  async sold(): Promise<void> {
    if (!this.currentPlayer || !this.highestTeam || !this.currentPlayer.id || !this.highestTeam.id) {
      this.message.warning('Select a team and place a bid before marking this player as sold.');
      return;
    }
    await this.auctionService.saveBid({ playerId: this.currentPlayer.id, playerName: this.playerName, teamId: this.highestTeam.id, teamName: this.highestTeam.teamName, bidAmount: this.currentBid, mobile: this.currentPlayer.mobile, tshirtSize: this.currentPlayer.tshirtSize,  sold: true, soldDate: new Date().toISOString() });
    await this.playerService.markSold(this.currentPlayer.id, this.highestTeam.id, this.currentBid);
    await this.teamService.updateTeamPoints(this.highestTeam.id, this.currentBid);
    this.updateSoldTeamOnScreen(this.highestTeam.id, this.currentBid);    
    this.soldToTeamName = this.highestTeam.teamName;
    this.showSoldAnimation = true;
    
    await this.loadTeams();
    await new Promise(resolve => setTimeout(resolve, 2500));
    this.showSoldAnimation = false;
    
    await this.loadNextPlayer();
  }

  async unsold(): Promise<void> {
    if (!this.currentPlayer?.id) return;
    this.showUnsoldAnimation = true;
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.showUnsoldAnimation = false;
    
    await this.playerService.markUnsold(this.currentPlayer.id);
    await this.loadNextPlayer();
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

  private setCurrentPlayer(player: Player): void {
    this.currentPlayer = player;
    this.currentBid = Number(player.baseBid || 0);
    this.highestTeam = null;
    this.bidHistory = [];
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
