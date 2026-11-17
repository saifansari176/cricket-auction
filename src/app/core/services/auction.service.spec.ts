import { TestBed } from '@angular/core/testing';

import { AuctionService } from './auction.service';
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
});
