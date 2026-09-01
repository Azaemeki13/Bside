import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, MediaValidationService } from './media-validation.service';

describe('MediaValidationService', () => {
  const service = new MediaValidationService();

  /** Builds small browser files without repeating test setup. */
  function file(name: string, type = '', size = 1): File {
    return new File([new Uint8Array(size)], name, { type });
  }

  it('accepts WAV and FLAC extensions regardless of case', () => {
    expect(service.getAudioFormat(file('song.WAV'))).toBe('wav');
    expect(service.getAudioFormat(file('song.flac'))).toBe('flac');
    expect(service.getAudioFormat(file('song.mp3'))).toBeNull();
  });

  it('builds and validates the title from the file name', () => {
    expect(service.getTrackTitle(file('  My Song.flac'))).toBe('My Song');
    expect(service.isValidAudio(file('.wav'))).toBe(false);
  });

  it('rejects audio larger than the backend limit', () => {
    const oversized = { name: 'large.wav', size: MAX_AUDIO_BYTES + 1 } as File;
    expect(service.isValidAudio(oversized)).toBe(false);
  });

  it('accepts cover MIME types and safe fallback extensions', () => {
    expect(service.isCoverImage(file('cover.bin', 'image/webp'))).toBe(true);
    expect(service.isCoverImage(file('cover.JPEG'))).toBe(true);
    expect(service.isCoverImage(file('cover.gif', 'image/gif'))).toBe(false);
  });

  it('keeps durations between one second and six hours', () => {
    expect(service.isValidDuration(1)).toBe(true);
    expect(service.isValidDuration(21_600)).toBe(true);
    expect(service.isValidDuration(0)).toBe(false);
    expect(service.isValidDuration(Number.NaN)).toBe(false);
  });
});
