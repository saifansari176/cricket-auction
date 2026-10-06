import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService, LiveAuctionResultEvent, LiveAuctionState } from '../../../core/services/auction.service';
import { Unsubscribe } from 'firebase/firestore';

@Component({
  selector: 'app-youtube-live',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './youtube-live.component.html',
  styleUrl: './youtube-live.component.scss'
})
export class YoutubeLiveComponent implements OnInit, OnDestroy {
  auction: AuctionSettings | null = null;
  players: Player[] = [];
  teams: Team[] = [];
  liveState: LiveAuctionState | null = null;
  resultEvent: LiveAuctionResultEvent | null = null;
  resultVisible = false;
  loading = true;
  notFound = false;
  private auctionId = '';
  private subscription?: Unsubscribe;
  private lastResultEventId = '';
  private resultTimer?: ReturnType<typeof setTimeout>;
  private teamRotationTimer?: ReturnType<typeof setInterval>;
  teamPageStart = 0;

  constructor(
    private route: ActivatedRoute,
    private auctionService: AuctionService
  ) {}

  ngOnInit(): void {
    this.auctionId = this.route.snapshot.paramMap.get('auctionId') || '';
    void this.load();
  }

  ngOnDestroy(): void {
    this.subscription?.();
    if (this.resultTimer) clearTimeout(this.resultTimer);
    if (this.teamRotationTimer) clearInterval(this.teamRotationTimer);
  }

  get currentPlayer(): Player | undefined {
    return this.players.find((player) => player.id === this.liveState?.currentPlayerId);
  }

  get currentBid(): number {
    return Number(this.liveState?.currentBid || this.currentPlayer?.baseBid || 0);
  }

  formatBidAmount(amount: number): string {
    if (amount >= 100_000) return `${(amount / 100_000).toFixed(2)} LAKH`;
    return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
  }

  get highestTeam(): Team | undefined {
    return this.teams.find((team) => team.id === this.liveState?.highestTeamId);
  }

  get visibleTeams(): Team[] {
    if (this.teams.length <= 4) return this.teams;
    return Array.from({ length: 4 }, (_, index) => this.teams[(this.teamPageStart + index) % this.teams.length]);
  }

  private async load(): Promise<void> {
    if (!this.auctionId) {
      this.notFound = true;
      this.loading = false;
      return;
    }
    try {
      const data = await this.auctionService.getPublicTournament(this.auctionId);
      this.auction = data.auction;
      this.players = data.players;
      this.teams = data.teams;
      this.startTeamRotation();
      this.liveState = data.liveState;
      this.lastResultEventId = data.liveState?.resultEvent?.id || '';
      this.notFound = !data.auction;
      if (data.auction?.publicLiveViewEnabled !== false) {
        this.subscription = this.auctionService.watchLiveState(this.auctionId, (state) => {
          if (!state) return;
          this.liveState = state;
          this.showResultEvent(state.resultEvent);
          if (state.lastAction === 'sold' || state.lastAction === 'unsold' || state.lastAction === 'undo') {
            void this.refreshTeamsAndPlayers();
          }
        });
      }
    } catch {
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  private async refreshTeamsAndPlayers(): Promise<void> {
    try {
      const data = await this.auctionService.getPublicTournament(this.auctionId, true);
      this.players = data.players;
      this.teams = data.teams;
      if (this.teamPageStart >= this.teams.length) this.teamPageStart = 0;
      this.startTeamRotation();
      if (data.liveState) this.liveState = data.liveState;
    } catch {
      // Keep the last displayed auction state when a background refresh fails.
    }
  }

  private startTeamRotation(): void {
    if (this.teamRotationTimer) return;
    this.teamRotationTimer = setInterval(() => {
      if (this.teams.length > 4) {
        this.teamPageStart = (this.teamPageStart + 4) % this.teams.length;
      } else {
        this.teamPageStart = 0;
      }
    }, 7000);
  }

  private showResultEvent(event?: LiveAuctionResultEvent): void {
    if (!event?.id || event.id === this.lastResultEventId) return;
    this.lastResultEventId = event.id;
    this.resultEvent = event;
    this.resultVisible = true;
    if (this.resultTimer) clearTimeout(this.resultTimer);
    this.resultTimer = setTimeout(() => {
      this.resultVisible = false;
      this.resultTimer = undefined;
    }, 4300);
  }
}
