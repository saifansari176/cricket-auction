import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { AuctionBid } from '../../../core/models/bid';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService, LiveAuctionState, LiveScreenAction } from '../../../core/services/auction.service';
import { LoadingService } from '../../../core/services/loading.service';
import { Unsubscribe } from 'firebase/firestore';

@Component({
  selector: 'app-live-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './live-screen.component.html',
  styleUrl: './live-screen.component.scss'
})
export class LiveScreenComponent implements OnInit, OnDestroy {
  auction: AuctionSettings | null = null;
  players: Player[] = [];
  teams: Team[] = [];
  bids: AuctionBid[] = [];
  liveState: LiveAuctionState | null = null;
  loading = true;
  notFound = false;
  updating = false;
  resultAnimation: 'sold' | 'unsold' | null = null;
  screenScale = 1;
  private auctionId = '';
  private liveStateSubscription?: Unsubscribe;
  private updateAnimationTimer?: ReturnType<typeof setTimeout>;
  private resultAnimationTimer?: ReturnType<typeof setTimeout>;
  private lastLiveStateUpdatedAt = '';

  constructor(
    private route: ActivatedRoute,
    private auctionService: AuctionService,
    private loadingService: LoadingService
  ) {}

  ngOnInit(): void {
    this.updateScreenScale();
    window.addEventListener('resize', this.updateScreenScale);
    this.auctionId = this.route.snapshot.paramMap.get('auctionId') || '';
    void this.load();
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.updateScreenScale);
    this.stopLiveUpdates();
    if (this.updateAnimationTimer) clearTimeout(this.updateAnimationTimer);
    if (this.resultAnimationTimer) clearTimeout(this.resultAnimationTimer);
  }

  async load(showLoader = true, resultAction?: LiveScreenAction): Promise<void> {
    if (!this.auctionId) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    if (showLoader) this.loading = true;

    try {
      const request = () => this.auctionService.getPublicTournament(this.auctionId);
      const data = showLoader
        ? await request()
        : await this.loadingService.withoutLoader(request);
      this.auction = data.auction;
      this.players = data.players;
      this.teams = data.teams;
      this.bids = data.bids.filter((bid) => bid.sold);
      this.liveState = data.liveState;
      this.lastLiveStateUpdatedAt = data.liveState?.updatedAt || this.lastLiveStateUpdatedAt;
      this.notFound = !data.auction;

      if (this.publicLiveViewEnabled) {
        this.startLiveUpdates();
        if (!showLoader) {
          this.playUpdateAnimation();
          if (resultAction === 'sold' || resultAction === 'unsold') this.playResultAnimation(resultAction);
        }
      } else {
        this.stopLiveUpdates();
      }
    } catch {
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  get publicLiveViewEnabled(): boolean {
    return this.auction?.publicLiveViewEnabled !== false;
  }

  get currentPlayer(): Player | undefined {
    return this.players.find((player) => player.id === this.liveState?.currentPlayerId);
  }

  get highestTeam(): Team | undefined {
    return this.teams.find((team) => team.id === this.liveState?.highestTeamId);
  }

  get currentBid(): number {
    return Number(this.liveState?.currentBid || this.currentPlayer?.baseBid || 0);
  }

  get latestActivity(): AuctionBid[] {
    return [...this.bids]
      .sort((first, second) => (second.soldDate || '').localeCompare(first.soldDate || ''))
      .slice(0, 6);
  }

  get currentBidderName(): string {
    return this.highestTeam?.teamName || 'Waiting for a bid';
  }

  get activityAge(): string {
    return 'Just now';
  }

  private startLiveUpdates(): void {
    if (this.liveStateSubscription || !this.auctionId) return;

    this.liveStateSubscription = this.auctionService.watchLiveState(this.auctionId, (state) => {
      if (!state?.updatedAt || state.updatedAt === this.lastLiveStateUpdatedAt) return;
      this.lastLiveStateUpdatedAt = state.updatedAt;
      void this.load(false, state.lastAction);
    });
  }

  private stopLiveUpdates(): void {
    this.liveStateSubscription?.();
    this.liveStateSubscription = undefined;
  }

  private playUpdateAnimation(): void {
    this.updating = false;
    requestAnimationFrame(() => {
      this.updating = true;
      if (this.updateAnimationTimer) clearTimeout(this.updateAnimationTimer);
      this.updateAnimationTimer = setTimeout(() => this.updating = false, 650);
    });
  }

  private playResultAnimation(action: 'sold' | 'unsold'): void {
    this.resultAnimation = null;
    requestAnimationFrame(() => {
      this.resultAnimation = action;
      if (this.resultAnimationTimer) clearTimeout(this.resultAnimationTimer);
      this.resultAnimationTimer = setTimeout(() => this.resultAnimation = null, 2200);
    });
  }

  private updateScreenScale = (): void => {
    this.screenScale = Math.min(window.innerWidth / 1536, window.innerHeight / 1024);
  };
}
