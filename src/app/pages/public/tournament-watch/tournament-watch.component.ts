import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuctionBid } from '../../../core/models/bid';
import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService, LiveAuctionState } from '../../../core/services/auction.service';

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
  liveState: LiveAuctionState | null = null;
  loading = true;
  notFound = false;
  private auctionId = '';
  private refreshTimer?: ReturnType<typeof setInterval>;

  constructor(private route: ActivatedRoute, private auctionService: AuctionService) {}

  ngOnInit(): void {
    this.auctionId = this.route.snapshot.paramMap.get('auctionId') || '';
    void this.load();
    this.refreshTimer = setInterval(() => void this.load(false), 8000);
  }

  ngOnDestroy(): void { if (this.refreshTimer) clearInterval(this.refreshTimer); }

  async load(showLoader = true): Promise<void> {
    if (!this.auctionId) { this.notFound = true; this.loading = false; return; }
    if (showLoader) this.loading = true;
    try {
      const data = await this.auctionService.getPublicTournament(this.auctionId);
      this.auction = data.auction;
      this.teams = data.teams;
      this.players = data.players;
      this.bids = data.bids.filter((bid) => bid.sold);
      this.liveState = data.liveState;
      this.notFound = !data.auction;
    } catch {
      this.notFound = true;
    } finally { this.loading = false; }
  }

  get currentPlayer(): Player | undefined { return this.players.find((p) => p.id === this.liveState?.currentPlayerId); }
  get highestTeam(): Team | undefined { return this.teams.find((t) => t.id === this.liveState?.highestTeamId); }
  get totalSpent(): number { return this.bids.reduce((sum, bid) => sum + Number(bid.bidAmount || 0), 0); }
  get latestSales(): AuctionBid[] { return [...this.bids].sort((a, b) => (b.soldDate || '').localeCompare(a.soldDate || '')).slice(0, 8); }
  soldForTeam(team: Team): AuctionBid[] { return this.bids.filter((bid) => bid.teamId === team.id); }
  spentByTeam(team: Team): number { return this.soldForTeam(team).reduce((sum, bid) => sum + Number(bid.bidAmount || 0), 0); }
}
