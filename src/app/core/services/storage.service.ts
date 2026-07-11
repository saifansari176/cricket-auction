import { Injectable } from '@angular/core';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../../firebase.config';
import { cloudinaryConfig } from '../../../environments/cloudinary.config';
import { CloudinaryService } from './cloudinary.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  constructor(private cloudinaryService: CloudinaryService) {}

  async uploadPlayerImage(file: File): Promise<string> {
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      throw new Error('Cloudinary is not configured for player image upload.');
    }

    return this.cloudinaryService.uploadFile(file);
  }

  async uploadTeamLogo(file: File): Promise<string> {
    return this.uploadRemoteFile(file, 'teams');
  }

  async uploadAuctionLogo(file: File): Promise<string> {
    return this.uploadRemoteFile(file, 'auction');
  }

  private async uploadRemoteFile(file: File, folder: string): Promise<string> {
    if (cloudinaryConfig.cloudName && cloudinaryConfig.uploadPreset) {
      try {
        return await this.cloudinaryService.uploadFile(file);
      } catch (error) {
        console.warn('Cloudinary upload failed, falling back to Firebase Storage', error);
      }
    }

    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return getDownloadURL(storageRef);
  }
}
