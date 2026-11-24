import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import { AuctionService } from '../../core/services/auction.service';
import { ImagePreviewService } from '../../shared/image-preview/image-preview.service';
import { MessageService } from '../../core/services/message.service';
import { PaymentService } from '../../core/services/payment.service';
import { PlayerService } from '../../core/services/player.service';
import { PlayerCategoryService } from '../../core/services/player-category.service';
import { TeamService } from '../../core/services/team.service';
import { Player } from '../../core/models/player';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let auctionService: jasmine.SpyObj<AuctionService>;
  let router: jasmine.SpyObj<Router>;
  let message: jasmine.SpyObj<MessageService>;

  beforeEach(async () => {
    playerService = jasmine.createSpyObj<PlayerService>('PlayerService', ['getPlayers', 'markAvailable']);
    playerService.getPlayers.and.resolveTo([]);

    auctionService = jasmine.createSpyObj<AuctionService>(
      'AuctionService',
      ['getSoldPlayers', 'get', 'startCategoryAuction', 'setSelectedPlayer', 'setReturnToDashboardAfterSale']
    );
    auctionService.getSoldPlayers.and.resolveTo([]);
    auctionService.get.and.resolveTo(null);

    const teamService = jasmine.createSpyObj<TeamService>('TeamService', ['getTeams']);
    teamService.getTeams.and.resolveTo([]);
    const categoryService = jasmine.createSpyObj<PlayerCategoryService>('PlayerCategoryService', ['getCategories']);
    categoryService.getCategories.and.resolveTo([]);
    const imagePreview = jasmine.createSpyObj<ImagePreviewService>('ImagePreviewService', ['open']);
    message = jasmine.createSpyObj<MessageService>('MessageService', ['error']);
    const paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', ['getVerifiedPaymentAmount']);
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    router.navigate.and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: PlayerService, useValue: playerService },
        { provide: AuctionService, useValue: auctionService },
        { provide: TeamService, useValue: teamService },
        { provide: PlayerCategoryService, useValue: categoryService },
        { provide: ImagePreviewService, useValue: imagePreview },
        { provide: MessageService, useValue: message },
        { provide: PaymentService, useValue: paymentService },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: () => null } } }
        },
        { provide: Router, useValue: router }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('marks an unsold player available before opening the auction', async () => {
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
      status: 'Unsold',
      categoryId: 'category-1'
    };
    playerService.markAvailable.and.resolveTo({ ...player, status: 'Available' });

    await component.startAuction(player);

    expect(playerService.markAvailable).toHaveBeenCalledOnceWith('player-1');
    expect(auctionService.setSelectedPlayer).toHaveBeenCalledOnceWith('player-1', 'Alex Batter');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/auction']);
  });

  it('does not open the auction when an unsold player cannot be returned', async () => {
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
      status: 'Unsold'
    };
    playerService.markAvailable.and.resolveTo(null);

    await component.startAuction(player);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledOnceWith(
      'Could not return this unsold player to the auction. Please refresh and try again.'
    );
  });
});
