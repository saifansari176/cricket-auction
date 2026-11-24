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

    const uploadFile = await this.compressImage(file);
    const extension = uploadFile.type === 'image/png' ? 'png'
      : uploadFile.type === 'image/webp' ? 'webp' : 'jpg';
    const storageRef = ref(storage, `${folder}/${crypto.randomUUID()}.${extension}`);
    await uploadBytes(storageRef, uploadFile);
    return getDownloadURL(storageRef);
  }

  private async compressImage(file: File): Promise<File> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, file.type === 'image/png' ? 'image/webp' : 'image/jpeg', 0.82)
    );
    if (!blob) return file;
    return new File([blob], file.name, { type: blob.type });
  }
}
