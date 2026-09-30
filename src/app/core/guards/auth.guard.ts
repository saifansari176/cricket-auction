import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';
import { AuctionService } from '../services/auction.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = await authService.waitForUser();

  if (!user || !user.active) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  return true;
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const user = await authService.waitForUser();

  if (!user || !user.active) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url }
    });
  }

  if (!authService.isAdmin(user)) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};

export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const auctionService = inject(AuctionService);
  const router = inject(Router);
  const user = await authService.waitForUser();

  if (!user?.active) return true;

  const activeAuctionId = await auctionService.getActiveAuctionId();
  return router.createUrlTree([activeAuctionId ? '/dashboard' : '/auction-settings']);
};

/** Send a restored signed-in session to its selected auction dashboard. */
export const landingGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const auctionService = inject(AuctionService);
  const router = inject(Router);
  const user = await authService.waitForUser();

  if (!user?.active) return true;

  const activeAuctionId = await auctionService.getActiveAuctionId();
  return router.createUrlTree([activeAuctionId ? '/dashboard' : '/auction-settings']);
};

export const auctionSelectionGuard: CanActivateFn = async () => {
  const auctionService = inject(AuctionService);
  const router = inject(Router);
  const activeAuctionId = await auctionService.getActiveAuctionId();

  return activeAuctionId ? true : router.createUrlTree(['/auction-settings'], {
    queryParams: { selection: 'required' }
  });
};

export const auctionOwnerGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const auctionService = inject(AuctionService);
  const router = inject(Router);
  const user = await authService.waitForUser();
  const auction = await auctionService.get();

  return auctionService.canManageAuction(auction, user)
    ? true
    : router.createUrlTree(['/dashboard']);
};
