import { TestBed } from '@angular/core/testing';

import { AuctionImageCleanupResult, AuctionService } from './auction.service';
import { AuctionSettings } from '../models/auction-settings';

describe('AuctionService', () => {
  let service: AuctionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuctionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads public report data without requesting live state when live view is disabled', async () => {
    const auction = { id: 'auction-1', publicLiveViewEnabled: false } as AuctionSettings;
    const getById = spyOn(service.firebase, 'getById').and.callFake(async <T>(collection: string, id: string) => {
      return collection === 'auctions' && id === 'auction-1' ? auction as T : null;
    });
    spyOn(service.firebase, 'getAll').and.callFake(async <T>() => []);

    const result = await service.getPublicTournament('auction-1');

    expect(result.auction).toEqual(auction);
    expect(result.liveState).toBeNull();
    expect(service.firebase.getAll).toHaveBeenCalledTimes(3);
    expect(getById).toHaveBeenCalledOnceWith('auctions', 'auction-1');
  });

  it('invalidates cached player, team, and bid data after changing a sold player status', async () => {
    spyOn(service, 'get').and.resolveTo({ id: 'auction-1', activeAuctionId: 'auction-1' } as AuctionSettings);
    spyOn(service.firebase, 'post').and.resolveTo(undefined);
    const clearReadCache = spyOn(service.firebase, 'clearReadCache');

    await service.changeSoldBidStatus('bid-1', 'Unsold');

    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/players');
    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/teams');
    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/bids');
  });

  it('cleans images for the requested auction and invalidates its cached records', async () => {
    const result: AuctionImageCleanupResult = {
      removedPlayerImages: 2,
      removedTeamLogos: 1,
      sharedImagesSkipped: 0,
      failedImages: 0
    };
    const post = spyOn(service.firebase, 'post').and.callFake(async <T>() => result as T);
    const clearReadCache = spyOn(service.firebase, 'clearReadCache');

    const cleanupResult = await service.cleanupAuctionImages('auction-1');

    expect(post).toHaveBeenCalledOnceWith('/api/auctions/auction-1/cleanup-images', {});
    expect(cleanupResult).toEqual(result);
    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/players');
    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/teams');
    expect(clearReadCache).toHaveBeenCalledWith('auctions/auction-1/bids');
  });
});
