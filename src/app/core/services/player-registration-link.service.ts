import { Injectable } from '@angular/core';

import { FirebaseService } from './firestore.service';

export interface PlayerRegistrationLinkSettings {
  enabled: boolean;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PlayerRegistrationLinkService {
  private collection = 'appSettings';
  private id = 'playerRegistration';

  constructor(private firebase: FirebaseService) {}

  async getSettings(): Promise<PlayerRegistrationLinkSettings> {
    const settings = await this.firebase.getById<PlayerRegistrationLinkSettings>(this.collection, this.id);
    return settings || { enabled: false };
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.firebase.set(this.collection, this.id, {
      enabled,
      updatedAt: new Date().toISOString()
    });
  }
}
