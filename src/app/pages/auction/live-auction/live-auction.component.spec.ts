import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { Player } from '../../../core/models/player';
import { Team } from '../../../core/models/team';
import { AuctionService } from '../../../core/services/auction.service';
import { LoadingService } from '../../../core/services/loading.service';
import { MessageService } from '../../../core/services/message.service';
import { PlayerService } from '../../../core/services/player.service';
import { TeamService } from '../../../core/services/team.service';
import { PlayerCategoryService } from '../../../core/services/player-category.service';
import { LiveAuctionComponent } from './live-auction.component';

describe('LiveAuctionComponent', () => {
  let component: LiveAuctionComponent;
  let fixture: ComponentFixture<LiveAuctionComponent>;
  let auctionService: jasmine.SpyObj<AuctionService>;
  let message: jasmine.SpyObj<MessageService>;

  beforeEach(async () => {
    const playerService = jasmine.createSpyObj<PlayerService>('PlayerService', ['getAvailablePlayers']);
    const teamService = jasmine.createSpyObj<TeamService>('TeamService', ['getTeams']);
    auctionService = jasmine.createSpyObj<AuctionService>('AuctionService', ['sellPlayer']);
    message = jasmine.createSpyObj<MessageService>('MessageService', ['error', 'warning', 'info']);
    const categoryService = jasmine.createSpyObj<PlayerCategoryService>('PlayerCategoryService', ['getCategories']);
    const router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [LiveAuctionComponent],
      providers: [
        { provide: PlayerService, useValue: playerService },
        { provide: TeamService, useValue: teamService },
        { provide: AuctionService, useValue: auctionService },
        { provide: MessageService, useValue: message },
        { provide: LoadingService, useValue: new LoadingService() },
        { provide: PlayerCategoryService, useValue: categoryService },
        { provide: Router, useValue: router }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveAuctionComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not show a sold animation when the sale request fails', async () => {
    const player: Player = {
      id: 'player-1',
      firstName: 'Alex',
      lastName: 'Batter',
      mobile: '1234567890',
      jerseyNumber: '1',
      playerType: 'Batsman',
      tshirtSize: 'M',
      trouserSize: 'M',
      photo: '',
      note: '',
      baseBid: 100,
      status: 'Available'
    };
    const team: Team = {
      id: 'team-1',
      logo: '',
      teamName: 'Falcons',
      ownerName: '',
      totalPoints: 1000,
      remainingPoints: 1000,
      playerLimit: 11,
      playersBought: 0
    };
    component.currentPlayer = player;
    component.highestTeam = team;
    component.currentBid = 200;
    auctionService.sellPlayer.and.rejectWith(new Error('This player is no longer available.'));

    await component.sold();

    expect(component.showSoldAnimation).toBeFalse();
    expect(message.error).toHaveBeenCalledOnceWith('This player is no longer available.');
  });
});
