import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveAuctionComponent } from './live-auction.component';

describe('LiveAuctionComponent', () => {
  let component: LiveAuctionComponent;
  let fixture: ComponentFixture<LiveAuctionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveAuctionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveAuctionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
