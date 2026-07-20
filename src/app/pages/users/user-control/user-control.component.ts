import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';

import { AppUser, UserRole } from '../../../core/models/app-user';
import { AuthService } from '../../../core/services/auth.service';
import { MessageService } from '../../../core/services/message.service';
import { AuctionService } from '../../../core/services/auction.service';
import { AuctionSettings } from '../../../core/models/auction-settings';

@Component({
  selector: 'app-user-control',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './user-control.component.html',
  styleUrl: './user-control.component.scss'
})
export class UserControlComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private message = inject(MessageService);
  private auctionService = inject(AuctionService);

  users: AppUser[] = [];
  loading = false;
  editingUser: AppUser | null = null;
  activeTab: 'users' | 'auction-access' = 'users';
  auctions: AuctionSettings[] = [];
  editingAuction: AuctionSettings | null = null;
  userFilter = '';
  auctionFilter = '';

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(6)]],
    displayName: ['', Validators.required],
    role: ['user' as UserRole, Validators.required],
    active: [true]
  });

  accessForm = this.fb.group({
    teamLimit: [2, [Validators.required, Validators.min(1)]],
    playerLimit: [10, [Validators.required, Validators.min(1)]]
  });

  async ngOnInit(): Promise<void> {
    await this.loadUsers();
    await this.loadAuctions();
  }

  async loadUsers(): Promise<void> {
    this.loading = true;
    this.users = await this.authService.getUsers();
    this.loading = false;
  }

  edit(user: AppUser): void {
    this.editingUser = user;
    this.form.patchValue({
      email: user.email,
      password: '',
      displayName: user.displayName,
      role: user.role,
      active: user.active
    });
  }

  newUser(): void {
    this.editingUser = null;
    this.form.reset({
      email: '',
      password: '',
      displayName: '',
      role: 'user',
      active: true
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;

    try {
      if (this.editingUser) {
        const user: AppUser = {
          uid: this.editingUser.uid,
          email: this.form.value.email || '',
          displayName: this.form.value.displayName || '',
          role: (this.form.value.role || 'user') as UserRole,
          active: Boolean(this.form.value.active)
        };

        await this.authService.saveUser(user);
      } else {
        const password = this.form.value.password || '';

        if (!password) {
          this.form.controls.password.setErrors({ required: true });
          this.form.controls.password.markAsTouched();
          this.loading = false;
          return;
        }

        await this.authService.createUser(
          this.form.value.email || '',
          password,
          this.form.value.displayName || '',
          (this.form.value.role || 'user') as UserRole,
          Boolean(this.form.value.active)
        );
      }

      await this.loadUsers();
      this.newUser();
    } catch (error: unknown) {
      this.message.error(error instanceof Error ? error.message : 'Unable to save user.');
    }

    this.loading = false;
  }

  async delete(user: AppUser): Promise<void> {
    const confirmed = await this.message.confirm(`Delete profile for ${user.email}?`, 'Delete User', 'Delete');

    if (!confirmed) {
      return;
    }

    this.loading = true;
    await this.authService.deleteUser(user.uid);
    await this.loadUsers();
    this.loading = false;
  }

  async loadAuctions(): Promise<void> {
    this.auctions = await this.auctionService.getAuctions();
  }

  get filteredUsers(): AppUser[] {
    const filter = this.userFilter.trim().toLowerCase();
    if (!filter) return this.users;
    return this.users.filter((user) => [user.displayName, user.email, user.role, user.active ? 'active' : 'inactive']
      .some((value) => String(value ?? '').toLowerCase().includes(filter)));
  }

  get filteredAuctions(): AuctionSettings[] {
    const filter = this.auctionFilter.trim().toLowerCase();
    if (!filter) return this.auctions;
    return this.auctions.filter((auction) => [auction.auctionName, auction.createdByEmail, auction.createdBy]
      .some((value) => String(value ?? '').toLowerCase().includes(filter)));
  }

  editAuctionAccess(auction: AuctionSettings): void {
    this.editingAuction = auction;
    this.accessForm.patchValue({
      teamLimit: auction.teamLimit ?? 2,
      playerLimit: auction.playerLimit ?? 10
    });
  }

  async saveAuctionAccess(): Promise<void> {
    if (!this.editingAuction?.id || this.accessForm.invalid) return;

    await this.auctionService.updateAuctionAccess(
      this.editingAuction.id,
      Number(this.accessForm.value.teamLimit),
      Number(this.accessForm.value.playerLimit)
    );
    await this.loadAuctions();
    this.editingAuction = null;
    this.message.success('Auction access updated successfully.');
  }
}
