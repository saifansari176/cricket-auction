import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuctionSettingsComponent } from './auction-settings.component';

describe('AuctionSettingsComponent', () => {
  let component: AuctionSettingsComponent;
  let fixture: ComponentFixture<AuctionSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuctionSettingsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AuctionSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
