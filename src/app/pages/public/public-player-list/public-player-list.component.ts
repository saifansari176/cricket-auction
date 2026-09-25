import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { AuctionService } from '../../../core/services/auction.service';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';

@Component({
  selector: 'app-public-player-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './public-player-list.component.html',
  styleUrl: './public-player-list.component.scss'
})
export class PublicPlayerListComponent implements OnInit {
  auction: AuctionSettings | null = null;
  players: Player[] = [];
  search = '';
  playerType = '';
  category = '';
  loading = true;
  notFound = false;
  brokenPhotoUrls = new Set<string>();

  constructor(
    private route: ActivatedRoute,
    private auctionService: AuctionService,
    private imagePreview: ImagePreviewService
  ) {}

  async ngOnInit(): Promise<void> {
    const publicLink = this.route.snapshot.paramMap.get('publicLink') || '';
    const publicToken = publicLink.split('--').pop() || '';
    if (!publicToken) {
      this.notFound = true;
      this.loading = false;
      return;
    }

    try {
      const data = await this.auctionService.getPublicPlayers(publicToken);
      this.auction = data.auction;
      this.notFound = !data.auction || data.auction.publicPlayerListEnabled !== true;
      this.players = this.notFound
        ? []
        : data.players.filter((player) => player.status?.toLowerCase() === 'available');
    } catch {
      this.notFound = true;
    } finally {
      this.loading = false;
    }
  }

  get playerTypes(): string[] {
    return [...new Set(this.players.map((player) => player.playerType).filter(Boolean))].sort();
  }

  get categories(): string[] {
    return [...new Set(this.players.map((player) => player.categoryName).filter((name): name is string => !!name))].sort();
  }

  get filteredPlayers(): Player[] {
    const search = this.search.trim().toLowerCase();
    return this.players.filter((player) => {
      const matchesSearch = !search || [
        player.firstName, player.lastName, player.playerType, player.categoryName, player.jerseyNumber
      ].some((value) => String(value || '').toLowerCase().includes(search));
      const matchesType = !this.playerType || player.playerType === this.playerType;
      const matchesCategory = !this.category
        || (this.category === '__regular__' && !player.categoryName)
        || player.categoryName === this.category;
      return matchesSearch && matchesType && matchesCategory;
    });
  }

  markPhotoBroken(url: string): void {
    if (url) this.brokenPhotoUrls.add(url);
  }

  openPreview(player: Player): void {
    if (player.photo && !this.brokenPhotoUrls.has(player.photo)) {
      this.imagePreview.open(player.photo, `${player.firstName} ${player.lastName}`.trim());
    }
  }
}
