"use client";

import { AlertCircle, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_AUDIO_SECONDS } from "@/lib/validators/ai-capture-schemas";
import { useAudioRecorder, type AudioRecording } from "../../hooks/useAudioRecorder";
import { CaptureShell } from "./CaptureShell";

function formatClock(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Heights of the level bars. Decorative — it signals "listening", not amplitude. */
const BAR_HEIGHTS = [30, 55, 80, 100, 70, 45, 85, 60, 35, 75, 50, 90, 40, 65, 25];

function ListeningBars() {
    return (
        <div className="flex h-10 items-center justify-center gap-1" aria-hidden="true">
            {BAR_HEIGHTS.map((height, index) => (
                <span
                    key={index}
                    className="w-[3px] animate-pulse rounded-full bg-accent-primary/70 motion-reduce:animate-none"
                    style={{ height: `${height}%`, animationDelay: `${(index % 5) * 0.12}s` }}
                />
            ))}
        </div>
    );
}

interface VoiceCaptureScreenProps {
    onSubmit: (recording: AudioRecording) => void;
    onBack: () => void;
}

/**
 * Dictating a movement, in one take.
 *
 * The recording is never sent automatically: stopping produces a take the user
 * can listen to and redo. Sending is a separate, deliberate tap — same rule as
 * the summary, one screen earlier.
 */
export function VoiceCaptureScreen({ onSubmit, onBack }: VoiceCaptureScreenProps) {
    const { status, seconds, error, recording, isRecording, remainingSeconds, start, stop, reset } = useAudioRecorder();

    const stage = () => {
        if (status === "error") {
            return (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-rose-500/15 text-rose-400">
                        <AlertCircle className="h-7 w-7" />
                    </span>
                    <p className="max-w-xs text-sm text-text-secondary">{error}</p>
                </div>
            );
        }

        if (status === "recorded" && recording) {
            return (
                <div className="flex flex-col items-center gap-4 py-8">
                    <span className="grid h-20 w-20 place-items-center rounded-full bg-accent-primary/15 text-accent-primary">
                        <Mic className="h-8 w-8" />
                    </span>
                    <p className="text-sm text-text-secondary">
                        Grabaste <span className="font-semibold text-text-primary">{formatClock(recording.seconds)}</span>
                    </p>
                    {/* The user's own recording, played back for review — no transcript to caption. */}
                    <audio src={recording.url} controls className="w-full max-w-xs" />
                    <p className="text-xs text-text-tertiary">Escúchalo antes de enviarlo.</p>
                </div>
            );
        }

        if (status === "requesting") {
            return (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-accent-primary" />
                    <p className="text-sm text-text-secondary">Pidiendo permiso para usar el micrófono…</p>
                </div>
            );
        }

        return (
            <div className="flex flex-col items-center gap-5 py-8">
                <button
                    type="button"
                    onClick={isRecording ? stop : start}
                    aria-label={isRecording ? "Detener grabación" : "Empezar a grabar"}
                    className={cn(
                        "grid h-28 w-28 place-items-center rounded-full text-white transition-all",
                        isRecording
                            ? "animate-pulse bg-rose-500 shadow-[0_0_0_12px_rgba(244,63,94,0.12)] motion-reduce:animate-none"
                            : "bg-accent-primary shadow-[0_0_0_12px_rgba(99,102,241,0.12)] hover:bg-accent-primary-hover",
                    )}
                >
                    {isRecording ? <Square className="h-9 w-9 fill-current" /> : <Mic className="h-10 w-10" />}
                </button>

                {isRecording ? (
                    <>
                        <p className="font-mono text-2xl font-semibold tabular-nums text-text-primary">
                            {formatClock(seconds)}
                            <span className="ml-1 text-xs font-normal text-text-tertiary">
                                / {formatClock(MAX_AUDIO_SECONDS)}
                            </span>
                        </p>
                        <ListeningBars />
                        <p className="text-xs text-text-tertiary">
                            {remainingSeconds <= 10
                                ? `Quedan ${remainingSeconds} s`
                                : "Di el monto, dónde fue y cómo lo pagaste."}
                        </p>
                    </>
                ) : (
                    <p className="max-w-xs text-center text-sm text-text-secondary">
                        Toca el micrófono y cuenta el movimiento. Máximo {MAX_AUDIO_SECONDS} segundos.
                    </p>
                )}
            </div>
        );
    };

    const footer = () => {
        if (status === "error") {
            return (
                <Button
                    type="button"
                    onClick={reset}
                    className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground"
                >
                    Reintentar
                </Button>
            );
        }

        if (status === "recorded" && recording) {
            return (
                <>
                    <Button
                        type="button"
                        onClick={() => onSubmit(recording)}
                        className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
                    >
                        Interpretar
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={reset}
                        className="h-10 w-full rounded-2xl"
                    >
                        <RotateCcw className="mr-2 h-4 w-4" /> Repetir grabación
                    </Button>
                </>
            );
        }

        if (isRecording) {
            return (
                <Button
                    type="button"
                    onClick={stop}
                    className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25"
                >
                    <Square className="mr-2 h-4 w-4 fill-current" /> Detener grabación
                </Button>
            );
        }

        return (
            <Button
                type="button"
                onClick={start}
                disabled={status === "requesting"}
                className="h-12 w-full rounded-2xl bg-accent-primary text-base font-semibold text-accent-primary-foreground shadow-lg shadow-accent-primary/25 hover:bg-accent-primary/90"
            >
                <Mic className="mr-2 h-4 w-4" /> Empezar a grabar
            </Button>
        );
    };

    const subtitle = isRecording
        ? `Grabando · máx. ${MAX_AUDIO_SECONDS} s`
        : status === "recorded"
            ? "Escucha y envía, o repite"
            : "Cuenta el movimiento en voz alta";

    return (
        <CaptureShell title="Dictar" subtitle={subtitle} onBack={onBack} footer={footer()}>
            <div className="flex flex-1 flex-col justify-center">{stage()}</div>
        </CaptureShell>
    );
}
