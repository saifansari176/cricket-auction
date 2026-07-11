import { TestBed } from '@angular/core/testing';

import { FirestoreServiceTs } from './firestore.service.ts';

describe('FirestoreServiceTs', () => {
  let service: FirestoreServiceTs;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FirestoreServiceTs);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
