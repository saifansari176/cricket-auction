import { Routes } from '@angular/router';
import { adminGuard, auctionSelectionGuard, authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },

  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/login/login.component').then((m) => m.LoginComponent),
  },

  {
    path: 'player-registration',
    loadComponent: () =>
      import('./pages/public/player-registration/player-registration.component').then((m) => m.PlayerRegistrationComponent),
  },

  {
    path: 'dashboard',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },

  {
    path: 'players',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/players/player-list/player-list.component').then(
        (m) => m.PlayerListComponent
      ),
  },

  {
    path: 'players/add',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/players/player-form/player-form.component').then(
        (m) => m.PlayerFormComponent
      ),
  },

 {
  path: 'players/edit/:id',
  canActivate: [authGuard, auctionSelectionGuard],
  loadComponent: () =>
    import('./pages/players/player-form/player-form.component')
      .then(m => m.PlayerFormComponent),
},

  {
    path: 'teams',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/teams/team-list/team-list.component').then(
        (m) => m.TeamListComponent
      ),
  },

  {
    path: 'teams/add',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/teams/team-form/team-form.component').then(
        (m) => m.TeamFormComponent
      ),
  },

  {
    path: 'teams/edit/:id',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/teams/team-form/team-form.component').then(
        (m) => m.TeamFormComponent
      ),
  },

  {
    path: 'auction/categories',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/auction/player-categories/player-categories.component').then((m) => m.PlayerCategoriesComponent),
  },

  {
    path: 'auction',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/auction/live-auction/live-auction.component').then(
        (m) => m.LiveAuctionComponent
      ),
  },

  {
    path: 'reports',
    canActivate: [authGuard, auctionSelectionGuard],
    loadComponent: () =>
      import('./pages/reports/reports.component').then((m) => m.ReportsComponent),
  },

  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'watch/:auctionId',
    loadComponent: () =>
      import('./pages/public/tournament-watch/tournament-watch.component').then((m) => m.TournamentWatchComponent),
  },

  {
    path: 'about-us',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/about-us/about-us.component').then((m) => m.AboutUsComponent),
  },

  {
  path: 'auction-settings',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./pages/auction/auction-settings/auction-settings.component').then(m => m.AuctionSettingsComponent),
},

  {
    path: 'users',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/users/user-control/user-control.component').then(m => m.UserControlComponent),
  },

  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
