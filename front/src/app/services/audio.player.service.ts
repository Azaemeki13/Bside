import { isPlatformBrowser } from "@angular/common"
import { Injectable, PLATFORM_ID, computed, effect, inject, signal } from "@angular/core"
import { Howl } from "howler"
import { VolumeService } from "./volume.service"


// Creation des types / "objets" pour contenir des audio
export type AudioFormat = 'flac' | 'wav' | 'mp3';

export type AudioTrack = {
    id: string;
    title: string;
    artist: string;
    src: string;
    format: AudioFormat;
    coverUrl?: string;
}

@Injectable({ providedIn: 'root'})
export class AudioPlayerService {
    private readonly platformId = inject(PLATFORM_ID);
    private readonly volumeService = inject(VolumeService);
    private readonly isBrowser = isPlatformBrowser(this.platformId);

    private sound?: Howl;
    private progressTimer?: number;

    readonly currentTrack = signal<AudioTrack | null>(null);
    readonly isPlaying = signal(false);
    readonly isLoading = signal(false);
    readonly duration = signal(0);
    readonly position = signal(0);
    readonly error = signal<string | null>(null);

    // Calcul pour l'UI de la progressBar
    readonly progressPercent = computed(() => {
        const total = this.duration();
        if (total <= 0)
            return 0;
        return Math.min(100, Math.max(0, (this.position() / total) * 100));
    });


    // ça j'ai vraiment pas compris
    constructor() {
        if (!this.isBrowser)
            return;

        effect(() => {
            this.sound?.volume(this.volumeService.volume01());
        });
    }

    // Initialisation de l'objet Howler avec ses fonctionalités
    load(track: AudioTrack): void {
        if (!this.isBrowser)
            return ;

        this.stop();
        this.error.set(null);
        this.isLoading.set(true);
        this.currentTrack.set(track);
        this.duration.set(0);
        this.position.set(0);

        this.sound = new Howl({
            src: [track.src],
            html5: true,
            format: [track.format],
            volume: this.volumeService.volume01(),

            onload: () => {
                this.isLoading.set(false);
                this.duration.set(this.sound?.duration() ?? 0);
            },

            onplay: () => {
                this.isPlaying.set(true);
                this.startProgressTimer();
            },

            onpause: () => {
                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.syncPosition();
            },

            onstop: () => {
                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.position.set(0);
            },

            onend: () => {
                this.isPlaying.set(false);
                this.stopProgressTimer();
                this.position.set(0);
            },

            onloaderror: (_id, error) => {
                this.isLoading.set(false);
                this.error.set(String(error));
            },

            onplayerror: (_id, error) => {
                this.isPlaying.set(false);
                this.error.set(String(error));
            },
        });
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
        this.stopProgressTimer();

        if (this.sound) {
            this.sound.stop();
            this.sound.unload();
            this.sound = undefined;
        }

        this.isPlaying.set(false);
        this.isLoading.set(false);
        this.position.set(0);
    }

    // Fonctions utilitaires pour la progressbar et le suivi de la progression du son
    seekToPercent(percent: number): void {
        if (!this.sound)
            return;

        const clamped = Math.min(100, Math.max(0, percent));
        const nextPosition = (clamped / 100) * this.duration();

        this.sound.seek(nextPosition);
        this.position.set(nextPosition);
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