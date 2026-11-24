import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import * as XLSX from 'xlsx';

import { AuctionSettings } from '../../../core/models/auction-settings';
import { AuctionService } from '../../../core/services/auction.service';
import { MessageService } from '../../../core/services/message.service';
import { TeamService } from '../../../core/services/team.service';
import { TeamListComponent } from './team-list.component';

describe('TeamListComponent', () => {
  let component: TeamListComponent;
  let fixture: ComponentFixture<TeamListComponent>;
  let teamService: jasmine.SpyObj<TeamService>;
  let auctionService: jasmine.SpyObj<AuctionService>;
  let message: jasmine.SpyObj<MessageService>;

  beforeEach(async () => {
    teamService = jasmine.createSpyObj<TeamService>('TeamService', ['getTeams', 'saveTeam']);
    teamService.getTeams.and.resolveTo([]);
    teamService.saveTeam.and.resolveTo(true);

    auctionService = jasmine.createSpyObj<AuctionService>('AuctionService', ['get']);
    auctionService.get.and.resolveTo({
      id: 'auction-1',
      activeAuctionId: 'auction-1',
      auctionName: 'Test Auction',
      auctionDate: '',
      logo: '',
      pointsPerTeam: 1000,
      playersPerTeam: 11,
      basePlayerPrice: 0,
      bidIncrement: 0,
      minimumBid: 0,
      bidIncreaseBy: 0
    } satisfies AuctionSettings);

    message = jasmine.createSpyObj<MessageService>('MessageService', ['success', 'error', 'warning']);

    await TestBed.configureTestingModule({
      imports: [TeamListComponent],
      providers: [
        provideRouter([]),
        { provide: TeamService, useValue: teamService },
        { provide: AuctionService, useValue: auctionService },
        { provide: MessageService, useValue: message }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeamListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('imports valid team rows and skips rows without a team name', async () => {
    const worksheet = XLSX.utils.json_to_sheet([
      { 'Team Name': 'Falcons', 'Owner Name': 'A. Owner', Logo: 'https://example.com/logo.png' },
      { 'Owner Name': 'Missing Name' }
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Teams');
    const file = new File([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], 'teams.xlsx');
    const input = { files: [file], value: 'teams.xlsx' } as unknown as HTMLInputElement;

    await component.importExcel({ target: input } as unknown as Event);

    expect(teamService.saveTeam).toHaveBeenCalledOnceWith({
      auctionId: 'auction-1',
      teamName: 'Falcons',
      ownerName: 'A. Owner',
      logo: 'https://example.com/logo.png',
      totalPoints: 1000,
      remainingPoints: 1000,
      playerLimit: 11,
      playersBought: 0
    });
    expect(input.value).toBe('');
    expect(message.success).toHaveBeenCalledOnceWith('Imported: 1\nSkipped: 1', 'Import Completed');
  });
});
