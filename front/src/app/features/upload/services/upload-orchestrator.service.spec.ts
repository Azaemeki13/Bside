import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PresignedUploadService, type UploadProgress } from '../../../services/presigned-upload.service';
import { UploadApiService } from '../data-access/upload-api.service';
import type { UploadSongResponse } from '../models/upload.models';
import { MediaValidationService } from './media-validation.service';
import { UploadOrchestratorService, type UploadTrackInput, type UploadTrackStage } from './upload-orchestrator.service';

describe('UploadOrchestratorService', () => {
  let service: UploadOrchestratorService;
  let api: { createSong: ReturnType<typeof vi.fn>; verifySong: ReturnType<typeof vi.fn> };
  let uploader: { upload: ReturnType<typeof vi.fn> };
  let validation: { getAudioFormat: ReturnType<typeof vi.fn> };
  let input: UploadTrackInput;

  // Use small fakes here so the tests describe workflow order, not Angular HTTP.
  beforeEach(() => {
    api = { createSong: vi.fn(), verifySong: vi.fn() };
    uploader = { upload: vi.fn() };
    validation = { getAudioFormat: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: UploadApiService, useValue: api },
        { provide: PresignedUploadService, useValue: uploader },
        { provide: MediaValidationService, useValue: validation },
      ],
    });
    service = TestBed.inject(UploadOrchestratorService);
    input = {
      albumId: 'album-1',
      file: new File(['audio'], 'opening.wav', { type: 'audio/wav' }),
      title: 'Opening',
      durationSeconds: 92,
    };
  });

  it('creates, uploads, and verifies a track in backend order', async () => {
    const calls: string[] = [];
    const response = songResponse();
    validation.getAudioFormat.mockReturnValue('wav');
    api.createSong.mockImplementation(() => {
      calls.push('create');
      return of(response);
    });
    uploader.upload.mockImplementation(async () => { calls.push('upload'); });
    api.verifySong.mockImplementation(() => {
      calls.push('verify');
      return of(undefined);
    });

    await service.uploadTrack(input);

    expect(calls).toEqual(['create', 'upload', 'verify']);
    expect(api.createSong).toHaveBeenCalledWith({
      title: 'Opening', albumId: 'album-1', durationSeconds: 92, format: 'wav',
    });
    expect(uploader.upload).toHaveBeenCalledWith(
      'https://storage/upload', input.file, 'audio/wav', undefined,
    );
    expect(api.verifySong).toHaveBeenCalledWith('song-1');
  });

  it('forwards stage changes and storage progress to the caller', async () => {
    const stages: UploadTrackStage[] = [];
    const progressValues: UploadProgress[] = [];
    validation.getAudioFormat.mockReturnValue('flac');
    api.createSong.mockReturnValue(of(songResponse()));
    uploader.upload.mockImplementation(async (_url: string, _file: File, _type: string, onProgress: (value: UploadProgress) => void) => {
      onProgress({ loaded: 4, total: 10, percent: 40 });
    });
    api.verifySong.mockReturnValue(of(undefined));

    await service.uploadTrack({
      ...input,
      onStage: (stage) => stages.push(stage),
      onProgress: (progress) => progressValues.push(progress),
    });

    expect(stages).toEqual(['creating-song', 'uploading-file', 'verifying']);
    expect(progressValues).toEqual([{ loaded: 4, total: 10, percent: 40 }]);
    expect(uploader.upload).toHaveBeenCalledWith(
      'https://storage/upload', input.file, 'audio/flac', expect.any(Function),
    );
  });

  it('fails before any request when the audio format is unsupported', async () => {
    validation.getAudioFormat.mockReturnValue(null);

    await expect(service.uploadTrack(input)).rejects.toThrow('opening.wav is not a WAV or FLAC file.');
    expect(api.createSong).not.toHaveBeenCalled();
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(api.verifySong).not.toHaveBeenCalled();
  });

  it('does not upload or verify when song creation fails', async () => {
    validation.getAudioFormat.mockReturnValue('wav');
    api.createSong.mockReturnValue(throwError(() => new Error('create failed')));

    await expect(service.uploadTrack(input)).rejects.toThrow('create failed');
    expect(uploader.upload).not.toHaveBeenCalled();
    expect(api.verifySong).not.toHaveBeenCalled();
  });

  it('does not verify when the storage upload fails', async () => {
    validation.getAudioFormat.mockReturnValue('wav');
    api.createSong.mockReturnValue(of(songResponse()));
    uploader.upload.mockRejectedValue(new Error('storage failed'));

    await expect(service.uploadTrack(input)).rejects.toThrow('storage failed');
    expect(api.verifySong).not.toHaveBeenCalled();
  });

  it('forwards verification failures after the file upload succeeds', async () => {
    validation.getAudioFormat.mockReturnValue('wav');
    api.createSong.mockReturnValue(of(songResponse()));
    uploader.upload.mockResolvedValue(undefined);
    api.verifySong.mockReturnValue(throwError(() => new Error('verify failed')));

    await expect(service.uploadTrack(input)).rejects.toThrow('verify failed');
    expect(uploader.upload).toHaveBeenCalledOnce();
    expect(api.verifySong).toHaveBeenCalledOnce();
  });

  // Keep one complete response fixture readable across the workflow tests.
  function songResponse(): UploadSongResponse {
    return {
      song: {
        id: 'song-1', album_id: 'album-1', title: 'Opening', duration_seconds: 92,
        audio_url: '', status: 'pending', created_at: '2026-09-01T00:00:00Z',
      },
      upload_url: 'https://storage/upload',
    };
  }
});
