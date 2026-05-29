import { isPlatformBrowser } from "@angular/common"
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from "@angular/core"
import { Howl } from "howler"
import { Observable, Subscription } from "rxjs"
import { VolumeService } from "./volume.service"

export type AudioFormat = 'flac' | 'wav' | 'mp3';

export type AudioTrack = {
    id: string;
    title: string;
    artist: string;
    src: string;
    format: AudioFormat;
    coverUrl?: string;
}

export type QueueEntry = {
    id: string;
    title: string;
    artist: string;
    format: AudioFormat;
    coverUrl?: string;
    onRequestUrl: () => Observable<{ url: string }>;
};

@Injectable({ providedIn: 'root'})
export class AudioPlayerService {
    private readonly platformId = inject(PLATFORM_ID);
    private readonly volumeService = inject(VolumeService);
    private readonly isBrowser = isPlatformBrowser(this.platformId);

    private sound?: Howl;
    private progressTimer?: number;
    private urlSub?: Subscription;
    private loadToken = 0;

    readonly currentTrack = signal<AudioTrack | null>(null);
    readonly isPlaying = signal(false);
    readonly isLoading = signal(false);
    readonly duration = signal(0);
    readonly position = signal(0);
    readonly error = signal<string | null>(null);

    private queue: QueueEntry[] = [];
    readonly queueIndex = signal(-1);
    readonly queueLength = signal(0);

    readonly progressPercent = computed(() => {
        const total = this.duration();
        if (total <= 0)
            return 0;
        return Math.min(100, Math.max(0, (this.position() / total) * 100));
    });

    readonly hasNext = computed(() => this.queueIndex() < this.queueLength() - 1);
    readonly hasPrevious = computed(() => this.queueIndex() > 0);

    constructor() {
        if (!this.isBrowser)
            return;

        effect(() => {
            this.sound?.volume(this.volumeService.volume01());
        });
    }

    setQueue(entries: QueueEntry[], startIndex = 0): void {
        this.queue = entries;
        this.queueLength.set(entries.length);
        this.playIndex(startIndex);
    }

    next(): void {
        if (this.hasNext()) {
            this.playIndex(this.queueIndex() + 1);
        }
    }

    previous(): void {
        const currentPos = this.position();
        if (currentPos > 3) {
            this.seekToPercent(0);
            return;
        }
        if (this.hasPrevious()) {
            this.playIndex(this.queueIndex() - 1);
        }
    }

    play(): void {
        if (!this.sound)
            return;
        this.sound.play();
    }

    pause(): void {
        this.sound?.pause();
    }

    toggle(): void {
        if (!this.sound)
            return;

        if (this.sound.playing()) {
            this.pause();
        } else {
            this.play();
        }
    }

    stop(): void {
        this.loadToken++;
        this.urlSub?.unsubscribe();
        this.urlSub = undefined;
        this.stopProgressTimer();

        if (this.sound) {
            this.sound.stop();
            this.sound.unload();
            this.sound = undefined;
        }

        this.currentTrack.set(null);
        this.isPlaying.set(false);
        this.isLoading.set(false);
        this.duration.set(0);
        this.position.set(0);
    }

    seekToPercent(percent: number): void {
        if (!this.sound)
            return;

        const clamped = Math.min(100, Math.max(0, percent));
        const nextPosition = (clamped / 100) * this.duration();

        this.sound.seek(nextPosition);
        this.position.set(nextPosition);
    }

    private playIndex(index: number): void {
        if (index < 0 || index >= this.queue.length)
            return;

        this.stop();
        this.queueIndex.set(index);

        const entry = this.queue[index];
        const token = ++this.loadToken;
        this.isLoading.set(true);
        this.error.set(null);

        this.urlSub = entry.onRequestUrl().subscribe({
            next: ({ url }) => {
                if (token !== this.loadToken)
                    return;

                this.loadTrack({
                    id: entry.id,
                    title: entry.title,
                    artist: entry.artist,
                    src: url,
                    format: entry.format,
                    coverUrl: entry.coverUrl,
                }, token);
                this.sound?.play();
            },
            error: (err) => {
                if (token !== this.loadToken)
                    return;

                this.isLoading.set(false);
                this.error.set(`Could not load stream URL: ${err}`);
            },
        });
    }

    private loadTrack(track: AudioTrack, token: number): void {
        if (!this.isBrowser || token !== this.loadToken)
            return;

        this.stopProgressTimer();

        this.error.set(null);
        this.currentTrack.set(track);
        this.duration.set(0);
        this.position.set(0);

        const sound = new Howl({
            src: [track.src],
            html5: true,
            format: [track.format],
            volume: this.volumeService.volume01(),

            onload: () => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isLoading.set(false);
                this.duration.set(sound.duration() ?? 0);
            },

            onplay: () => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isPlaying.set(true);
                this.startProgressTimer();
            },

            onpause: () => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.syncPosition();
            },

            onstop: () => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.position.set(0);
            },

            onend: () => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.position.set(0);
                this.next();
            },

            onloaderror: (_id: number, error: unknown) => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isLoading.set(false);
                this.error.set(String(error));
            },

            onplayerror: (_id: number, error: unknown) => {
                if (token !== this.loadToken || sound !== this.sound)
                    return;

                this.isPlaying.set(false);
                this.isLoading.set(false);
                this.error.set(String(error));
            },
        });

        this.sound = sound;
    }

    private startProgressTimer(): void {
        this.stopProgressTimer();

        this.progressTimer = window.setInterval(() => {
            this.syncPosition();
        }, 250);
    }

    private stopProgressTimer(): void {
        if (this.progressTimer === undefined)
            return;

        window.clearInterval(this.progressTimer);
        this.progressTimer = undefined;
    }

    private syncPosition(): void {
        if (!this.sound)
            return;

        const next = this.sound.seek();
        this.position.set(typeof next === 'number' ? next : 0);
    }
}
