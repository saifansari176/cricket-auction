import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuctionBid } from '../../../core/models/bid';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService, LiveAuctionState } from '../../../core/services/auction.service';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { Unsubscribe } from 'firebase/firestore';

@Component({
  selector: 'app-tournament-watch',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tournament-watch.component.html',
  styleUrl: './tournament-watch.component.scss'
})
export class TournamentWatchComponent implements OnInit, OnDestroy {
  auction: AuctionSettings | null = null;
  teams: Team[] = [];
  players: Player[] = [];
  bids: AuctionBid[] = [];
  latestSales: AuctionBid[] = [];
  liveState: LiveAuctionState | null = null;
  loading = true;
  notFound = false;
  resultAnimation: 'sold' | 'unsold' | null = null;
  private auctionId = '';
  private liveStateSubscription?: Unsubscribe;
  private resultAnimationTimer?: ReturnType<typeof setTimeout>;
  private lastLiveStateUpdatedAt = '';
  private readonly soldBidsByTeam = new Map<string, AuctionBid[]>();
  private readonly spentByTeamId = new Map<string, number>();
  private readonly playerPhotoById = new Map<string, string>();

  constructor(
    private route: ActivatedRoute,
    private auctionService: AuctionService,
    private imagePreview: ImagePreviewService,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.auctionId = this.route.snapshot.paramMap.get('auctionId') || '';
    void this.load();
  }

  ngOnDestroy(): void {
    this.stopLiveUpdates();
    if (this.resultAnimationTimer) clearTimeout(this.resultAnimationTimer);
  }

  async load(showLoader = true): Promise<void> {
    if (!this.auctionId) { this.notFound = true; this.loading = false; return; }
    if (showLoader) this.loading = true;
    try {
      const data = await this.auctionService.getPublicTournament(this.auctionId);
      this.auction = data.auction;
      this.teams = data.teams;
      this.players = data.players;
      this.bids = data.bids.filter((bid) => bid.sold);
      this.refreshBidSummaries();
      this.liveState = data.liveState;
      this.lastLiveStateUpdatedAt = data.liveState?.updatedAt || this.lastLiveStateUpdatedAt;
      this.notFound = !data.auction;
      if (this.publicLiveViewEnabled) {
        this.startLiveUpdates();
      } else {
        this.stopLiveUpdates();
      }
    } catch {
      this.notFound = true;
    } finally { this.loading = false; }
  }

  get publicLiveViewEnabled(): boolean {
    return this.auction?.publicLiveViewEnabled !== false;
  }

  private startLiveUpdates(): void {
    if (this.liveStateSubscription || !this.auctionId) return;
    this.liveStateSubscription = this.auctionService.watchLiveState(this.auctionId, (state) => {
      this.zone.run(() => {
        if (!state?.updatedAt || state.updatedAt === this.lastLiveStateUpdatedAt) return;
        this.lastLiveStateUpdatedAt = state.updatedAt;
        if (state.lastAction === 'sold' || state.lastAction === 'unsold') this.playResultAnimation(state.lastAction);
        void this.applyLiveStateUpdate(state);
      });
    });
  }

  private async applyLiveStateUpdate(state: LiveAuctionState): Promise<void> {
    const needsPlayerRefresh = !!state.currentPlayerId
      && !this.players.some((player) => player.id === state.currentPlayerId);
    const needsTeamRefresh = !!state.highestTeamId
      && !this.teams.some((team) => team.id === state.highestTeamId);
    const needsBidRefresh = state.lastAction === 'sold' || state.lastAction === 'undo';

    if (needsPlayerRefresh || needsTeamRefresh || needsBidRefresh) {
      await this.load(false);
      return;
    }

    this.liveState = state;
  }

  private stopLiveUpdates(): void {
    this.liveStateSubscription?.();
    this.liveStateSubscription = undefined;
  }

  private playResultAnimation(action: 'sold' | 'unsold'): void {
    this.resultAnimation = null;
    requestAnimationFrame(() => {
      this.resultAnimation = action;
      if (this.resultAnimationTimer) clearTimeout(this.resultAnimationTimer);
      this.resultAnimationTimer = setTimeout(() => this.resultAnimation = null, 2200);
    });
  }

  get currentPlayer(): Player | undefined { return this.players.find((p) => p.id === this.liveState?.currentPlayerId); }
  get highestTeam(): Team | undefined { return this.teams.find((t) => t.id === this.liveState?.highestTeamId); }
  get totalSpent(): number { return this.bids.reduce((sum, bid) => sum + Number(bid.bidAmount || 0), 0); }
  soldForTeam(team: Team): AuctionBid[] { return this.soldBidsByTeam.get(team.id || '') || []; }
  spentByTeam(team: Team): number { return this.spentByTeamId.get(team.id || '') || 0; }
  getBidPhoto(bid: AuctionBid): string {
    return bid.photoUrl || this.playerPhotoById.get(bid.playerId || '') || '/cricbids-logo.png';
  }

  trackById(_index: number, item: { id?: string }): string | number {
    return item.id || _index;
  }

  private refreshBidSummaries(): void {
    this.soldBidsByTeam.clear();
    this.spentByTeamId.clear();
    this.playerPhotoById.clear();

    for (const player of this.players) {
      if (player.id && player.photo) this.playerPhotoById.set(player.id, player.photo);
    }

    for (const bid of this.bids) {
      const teamId = bid.teamId || '';
      const teamBids = this.soldBidsByTeam.get(teamId) || [];
      teamBids.push(bid);
      this.soldBidsByTeam.set(teamId, teamBids);
      this.spentByTeamId.set(teamId, (this.spentByTeamId.get(teamId) || 0) + Number(bid.bidAmount || 0));
    }

    this.latestSales = [...this.bids]
      .sort((first, second) => (second.soldDate || '').localeCompare(first.soldDate || ''))
      .slice(0, 8);
  }

  openPreview(url: string, name = ''): void {
    this.imagePreview.open(url, name);
  }
}
