import { Injectable } from '@angular/core';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

@Injectable({ providedIn: 'root' })
export class PresignedUploadService {
  upload(
    url: string,
    file: File,
    contentType: string,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (event) => {
        const total = file.size;
        const loaded = Math.min(event.loaded, file.size);
        onProgress?.({ loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
          resolve();
        } else {
          reject(new Error(`File upload failed with status ${xhr.status}.`));
        }
      };
      xhr.onerror = () => reject(new Error('File upload failed because of a network error.'));
      xhr.onabort = () => reject(new Error('File upload was cancelled.'));
      xhr.send(file);
    });
  }
}
