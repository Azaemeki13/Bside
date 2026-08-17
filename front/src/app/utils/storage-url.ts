import { isPlatformBrowser } from '@angular/common';

/** Upgrade object URLs stored before the HTTPS gateway was introduced. */
export function browserStorageUrl(url: string, platformId: object): string {
  if (!url) return url;

  const legacyMinioUrl = /^(?:http:\/\/(?:minio|localhost):9000|https:\/\/localhost:9443)/i;
  if (!legacyMinioUrl.test(url)) return url;

  const hostname = isPlatformBrowser(platformId) ? window.location.hostname : 'localhost';
  return url.replace(legacyMinioUrl, `https://${hostname}`);
}
