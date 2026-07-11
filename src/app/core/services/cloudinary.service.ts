import { Injectable } from '@angular/core';
import { cloudinaryConfig } from '../../../environments/cloudinary.config';

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  constructor() {}

  async uploadFile(file: File): Promise<string> {
    const { cloudName, uploadPreset } = cloudinaryConfig;

    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary not configured (cloudName/uploadPreset).');
    }

    const url = this.uploadEndpoint(cloudName);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', uploadPreset);

    const res = await fetch(url, {
      method: 'POST',
      body: fd
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudinary upload failed: ${res.status} ${text}`);
    }

    const json = await res.json();
    return json.secure_url || json.url || '';
  }

  async uploadRemoteUrl(url: string): Promise<string> {
    const { cloudName, uploadPreset } = cloudinaryConfig;

    if (!cloudName || !uploadPreset) {
      throw new Error('Cloudinary not configured (cloudName/uploadPreset).');
    }

    const remoteUrl = this.toRemoteImageUrl(url);
    const endpoint = this.uploadEndpoint(cloudName);
    const formData = new FormData();
    formData.append('file', remoteUrl);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData
    });
    const responseBody = await response.text();
    let json: { secure_url?: string; url?: string; error?: { message?: string } } = {};

    try {
      json = JSON.parse(responseBody);
    } catch {
      // A proxy or invalid Cloudinary cloud name can return an HTML error page.
    }

    if (!response.ok) {
      throw new Error(
        json.error?.message ||
        `Cloudinary could not upload the image URL (HTTP ${response.status}). ` +
          'Check the cloud name and unsigned upload preset.'
      );
    }

    return json.secure_url || json.url || '';
  }

  private toRemoteImageUrl(url: string): string {
    const trimmed = url.trim();
    const fileId = this.extractGoogleDriveFileId(trimmed);

    // Cloudinary can fetch a publicly shared Drive thumbnail reliably. The
    // "open?id=" page itself is HTML, not an image, so it cannot be uploaded.
    return fileId
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`
      : trimmed;
  }

  private uploadEndpoint(cloudName: string): string {
    return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  }

  private extractGoogleDriveFileId(url: string): string {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return match[1];
    }

    return '';
  }


}
