import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import * as XLSX from 'xlsx';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { Player } from '../../../core/models/player';
import { AuctionService } from '../../../core/services/auction.service';
import { MessageService } from '../../../core/services/message.service';
import { PaymentService } from '../../../core/services/payment.service';
import { PlayerService } from '../../../core/services/player.service';
import { ImagePreviewService } from '../../../shared/image-preview/image-preview.service';
import { PlayerListComponent } from './player-list.component';

describe('PlayerListComponent', () => {
  let component: PlayerListComponent;
  let fixture: ComponentFixture<PlayerListComponent>;
  let playerService: jasmine.SpyObj<PlayerService>;
  let auctionService: jasmine.SpyObj<AuctionService>;
  let message: jasmine.SpyObj<MessageService>;
  let paymentService: jasmine.SpyObj<PaymentService>;

  beforeEach(async () => {
    playerService = jasmine.createSpyObj<PlayerService>(
      'PlayerService',
      ['getPlayers', 'updatePlayer', 'savePlayer']
    );
    playerService.getPlayers.and.resolveTo([]);
    playerService.updatePlayer.and.resolveTo();
    playerService.savePlayer.and.resolveTo(true);

    auctionService = jasmine.createSpyObj<AuctionService>('AuctionService', ['get']);
    auctionService.get.and.resolveTo(null);
    Object.defineProperty(auctionService, 'activeAuction$', {
      value: new BehaviorSubject<AuctionSettings | null>(null)
    });

    message = jasmine.createSpyObj<MessageService>(
      'MessageService',
      ['success', 'error', 'warning', 'info']
    );
    paymentService = jasmine.createSpyObj<PaymentService>('PaymentService', ['getVerifiedPaymentAmount']);

    await TestBed.configureTestingModule({
      imports: [PlayerListComponent],
      providers: [
        provideRouter([]),
        { provide: PlayerService, useValue: playerService },
        { provide: AuctionService, useValue: auctionService },
        { provide: MessageService, useValue: message },
        { provide: PaymentService, useValue: paymentService },
        { provide: ImagePreviewService, useValue: jasmine.createSpyObj<ImagePreviewService>('ImagePreviewService', ['open']) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlayerListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the player list available when saving a synced payment amount fails', async () => {
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
      paymentId: 'payment-1',
      paymentStatus: 'Verified',
      paymentAmount: 0,
      baseBid: 100,
      status: 'Available'
    };
    playerService.getPlayers.and.resolveTo([player]);
    playerService.updatePlayer.and.rejectWith(new Error('Write failed'));
    paymentService.getVerifiedPaymentAmount.and.resolveTo(500);
    auctionService.get.and.resolveTo({
      id: 'auction-1',
      activeAuctionId: 'auction-1',
      auctionName: 'Test Auction',
      auctionDate: '',
      logo: '',
      pointsPerTeam: 0,
      playersPerTeam: 0,
      basePlayerPrice: 0,
      bidIncrement: 0,
      minimumBid: 0,
      bidIncreaseBy: 0,
      registrationPaymentEnabled: true
    });

    await component.loadPlayers();

    expect(component.players).toHaveSize(1);
    expect(component.players[0].id).toBe('player-1');
    expect(component.paymentAmountLabel(component.players[0])).toBe('Payment amount unavailable');
  });

  it('reports Excel read failures and resets the file input', async () => {
    const file = {
      arrayBuffer: () => Promise.reject(new Error('Read failed'))
    } as unknown as File;
    const input = { files: [file], value: 'players.xlsx' } as unknown as HTMLInputElement;

    await component.importExcel({ target: input } as unknown as Event);

    expect(message.error).toHaveBeenCalledOnceWith(
      'Unable to complete Excel import. Some rows may have been saved; refresh the list before retrying.'
    );
    expect(input.value).toBe('');
  });

  it('reports failed Excel rows after completing the rest of the import', async () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { 'First Name': 'Alex', Mobile: '1234567890', 'Jersey Number': '1' }
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Players');
    const file = new File([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], 'players.xlsx');
    const input = { files: [file], value: 'players.xlsx' } as unknown as HTMLInputElement;
    playerService.savePlayer.and.rejectWith(new Error('Save failed'));

    await component.importExcel({ target: input } as unknown as Event);

    expect(message.error).toHaveBeenCalledOnceWith(
      'Imported: 0\nSkipped: 0\nFailed: 1',
      'Import Completed with Errors'
    );
    expect(input.value).toBe('');
  });
});
