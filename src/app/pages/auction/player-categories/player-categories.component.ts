import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import * as XLSX from 'xlsx';

import { AuctionService } from '../../../core/services/auction.service';
import { MessageService } from '../../../core/services/message.service';
import { PlayerCategory } from '../../../core/models/player-category';
import { PlayerCategoryService } from '../../../core/services/player-category.service';
import { PlayerService } from '../../../core/services/player.service';
import { Player } from '../../../core/models/player';

@Component({
  selector: 'app-player-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './player-categories.component.html',
  styleUrl: './player-categories.component.scss'
})
export class PlayerCategoriesComponent {
  private fb = inject(FormBuilder);
  private auctionService = inject(AuctionService);
  private categoryService = inject(PlayerCategoryService);
  private message = inject(MessageService);
  private playerService = inject(PlayerService);
  private router = inject(Router);

  categories: PlayerCategory[] = [];
  auctionName = '';
  auctionId = '';
  auctionBidIncreaseBy = 0;
  editingCategory: PlayerCategory | null = null;
  selectedCategory: PlayerCategory | null = null;
  players: Player[] = [];
  playerSearch = '';
  playerTypeFilter = '';
  playerStatusFilter = '';
  playerCategorySelections: Record<string, string> = {};
  regularBasePrice = 0;
  saving = false;

  form = this.fb.group({
    name: ['', Validators.required],
    basePrice: [0, [Validators.required, Validators.min(1)]],
    bidIncreaseBy: [0, [Validators.required, Validators.min(1)]]
  });

  async ngOnInit(): Promise<void> {
    const auction = await this.auctionService.get();
    this.auctionId = auction?.activeAuctionId || auction?.id || '';
    this.auctionName = auction?.auctionName || 'Selected Auction';
    this.regularBasePrice = Number(auction?.basePlayerPrice ?? auction?.minimumBid ?? 0);
    this.auctionBidIncreaseBy = Number(auction?.bidIncreaseBy || 0);
    await this.loadCategories();
    await this.loadPlayers();
  }

  async loadCategories(): Promise<void> {
    this.categories = await this.categoryService.getCategories(this.auctionId);
  }

  async loadPlayers(): Promise<void> {
    this.players = await this.playerService.getPlayers();
  }

  get matchingPlayers(): Player[] {
    const search = this.playerSearch.trim().toLowerCase();
    const type = this.playerTypeFilter.trim().toLowerCase();
    const status = this.playerStatusFilter.trim().toLowerCase();
    return this.players.filter((player) => {
      const matchesSearch = !search || [player.firstName, player.lastName, player.mobile, player.playerType, player.categoryName]
        .some((value) => String(value ?? '').toLowerCase().includes(search));
      const isEligibleForCategory = ['Available', 'Unsold'].includes(player.status);
      return isEligibleForCategory
        && !player.categoryId
        && matchesSearch
        && (!type || player.playerType.toLowerCase() === type)
        && (!status || player.status.toLowerCase() === status);
    });
  }

  get playerTypes(): string[] {
    return Array.from(new Set(this.players.map((player) => player.playerType).filter(Boolean))).sort();
  }

  get playerStatuses(): string[] {
    return Array.from(new Set(this.players.map((player) => player.status).filter(Boolean))).sort();
  }

  getPlayersForCategory(categoryId?: string): Player[] {
    return this.players.filter((player) => player.categoryId === categoryId);
  }

  getCategoryBidIncrease(category: PlayerCategory): number {
    return Number(category.bidIncreaseBy || this.auctionBidIncreaseBy || 0);
  }

  selectCategory(category: PlayerCategory): void {
    this.selectedCategory = category;
    this.playerSearch = '';
  }

  toggleCategory(category: PlayerCategory): void {
    this.selectedCategory = this.selectedCategory?.id === category.id ? null : category;
    this.playerSearch = '';
  }

  edit(category: PlayerCategory): void {
    this.editingCategory = category;
    this.form.patchValue({
      name: category.name,
      basePrice: category.basePrice,
      bidIncreaseBy: Number(category.bidIncreaseBy || 0)
    });
  }

  cancel(): void {
    this.editingCategory = null;
    this.form.reset({ name: '', basePrice: 0, bidIncreaseBy: 0 });
  }

  clearDefaultZero(controlName: 'basePrice' | 'bidIncreaseBy'): void {
    const control = this.form.get(controlName);

    if (Number(control?.value || 0) === 0) {
      control?.setValue(null);
    }
  }

  async save(): Promise<void> {
    if (this.saving) return;
    if (!this.auctionId || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    try {
      await this.categoryService.saveCategory({
        id: this.editingCategory?.id,
        auctionId: this.auctionId,
        name: this.form.value.name || '',
        basePrice: Number(this.form.value.basePrice || 0),
        bidIncreaseBy: Number(this.form.value.bidIncreaseBy || 0)
      });
      this.message.success(this.editingCategory ? 'Category updated successfully.' : 'Category added successfully.');
      this.cancel();
      await this.loadCategories();
      await this.loadPlayers();
    } finally {
      this.saving = false;
    }
  }

  async delete(category: PlayerCategory): Promise<void> {
    if (!category.id) return;
    const confirmed = await this.message.confirm(`Delete category "${category.name}"?`, 'Delete Category', 'Delete');
    if (!confirmed) return;
    await this.categoryService.deleteCategory(category.id);
    if (this.selectedCategory?.id === category.id) this.selectedCategory = null;
    await this.loadCategories();
  }

  async movePlayer(player: Player): Promise<void> {
    if (!player.id) return;
    const categoryId = this.getSelectedMoveCategory(player);
    const category = this.categories.find((item) => item.id === categoryId);
    if (!category) return;
    await this.playerService.updatePlayer({
      ...player,
      categoryId: category.id,
      categoryName: category.name,
      baseBid: category.basePrice,
      bidIncreaseBy: this.getCategoryBidIncrease(category)
    });
    await this.loadPlayers();
    this.playerCategorySelections[player.id] = '';
  }

  getSelectedMoveCategory(player: Player): string {
    return player.id ? this.playerCategorySelections[player.id] || '' : '';
  }

  setSelectedMoveCategory(player: Player, event: Event): void {
    if (!player.id) return;
    this.playerCategorySelections[player.id] = (event.target as HTMLSelectElement).value;
  }

  async removePlayer(player: Player): Promise<void> {
    if (!player.id) return;
    await this.playerService.updatePlayer({
      ...player,
      categoryId: '',
      categoryName: '',
      baseBid: this.regularBasePrice,
      bidIncreaseBy: this.auctionBidIncreaseBy
    });
    await this.loadPlayers();
  }

  async startCategoryAuction(): Promise<void> {
    if (!this.selectedCategory?.id) return;
    this.auctionService.clearSelectedPlayer();
    this.auctionService.setSelectedCategory(this.selectedCategory.id);
    await this.router.navigate(['/auction']);
  }

  async startIndividualAuction(player: Player, category: PlayerCategory): Promise<void> {
    if (!player.id || !category.id || !['Available', 'Unsold'].includes(player.status)) return;
    this.auctionService.setSelectedCategory(category.id);
    this.auctionService.setSelectedPlayer(player.id, `${player.firstName} ${player.lastName}`.trim());
    await this.router.navigate(['/auction']);
  }

  downloadCategoryPlayers(): void {
    if (!this.selectedCategory) return;
    const data = this.getPlayersForCategory(this.selectedCategory.id).map((player, index) => ({
      '#': index + 1,
      'Player Name': `${player.firstName} ${player.lastName}`.trim(),
      Mobile: player.mobile,
      'Player Type': player.playerType,
      Status: player.status,
      'Base Price': player.baseBid,
      'Bid Increase By': this.selectedCategory?.bidIncreaseBy || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, this.selectedCategory.name.slice(0, 31));
    XLSX.writeFile(workbook, `${this.selectedCategory.name}-Players.xlsx`);
  }
}
