import { HttpErrorResponse } from '@angular/common/http';

/** Converts technical upload failures into a useful message for the form. */
export function describeUploadError(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    if (typeof error.error === 'string' && error.error.trim()) return error.error;
    if (error.message) return error.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
