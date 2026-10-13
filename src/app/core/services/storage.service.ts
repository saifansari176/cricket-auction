import { Injectable } from '@angular/core';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase.config';
import { LoadingService } from './loading.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(private loading: LoadingService) {}

  async uploadPlayerImage(file: File): Promise<string> {
    return this.loading.track(() => this.uploadRemoteFile(file, 'players'));
  }

  async uploadTeamLogo(file: File): Promise<string> {
    return this.loading.track(() => this.uploadRemoteFile(file, 'teams'));
  }

  async uploadAuctionLogo(file: File): Promise<string> {
    return this.loading.track(() => this.uploadRemoteFile(file, 'auction'));
  }

  private async uploadRemoteFile(file: File, folder: string): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Only image files can be uploaded.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Image files must be 5 MB or smaller.');

    const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
    const storageRef = ref(storage, `${folder}/${crypto.randomUUID()}.${extension}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
}
