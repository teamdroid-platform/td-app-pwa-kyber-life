"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_AUDIO_SECONDS } from "@/lib/validators/ai-capture-schemas";

export type RecorderStatus = "idle" | "requesting" | "recording" | "recorded" | "error";

/** Preferred first: Opus in WebM everywhere, MP4/AAC for Safari, then whatever works. */
const PREFERRED_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
    return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** File extension matching the container, so n8n sees a name it can trust. */
function extensionFor(mimeType: string): string {
    if (mimeType.includes("mp4")) return "m4a";
    if (mimeType.includes("ogg")) return "ogg";
    return "webm";
}

/**
 * Recording is only offered where it actually works. Checked lazily rather than
 * at module scope so it never runs during the server render.
 */
export function isRecordingSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia
    );
}

/** What went wrong, in words the user can act on. */
function describeMicError(error: unknown): string {
    const name = (error as DOMException | null)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
        return "No diste permiso para usar el micrófono. Actívalo en los ajustes del navegador.";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
        return "No se encontró ningún micrófono disponible.";
    }
    if (name === "NotReadableError") {
        return "Otra aplicación está usando el micrófono.";
    }
    return "No se pudo iniciar la grabación.";
}

export interface AudioRecording {
    file: File;
    /** Object URL for the preview player. Revoked when the recording is dropped. */
    url: string;
    seconds: number;
}

/**
 * Microphone capture for the voice flow.
 *
 * Everything it holds is disposable and disposed: the media tracks are stopped
 * as soon as a take ends (so the browser's recording indicator goes away rather
 * than staying lit while the user reviews), and the preview URL is revoked
 * whenever the recording it points at is replaced or dropped.
 */
export function useAudioRecorder() {
    const [status, setStatus] = useState<RecorderStatus>("idle");
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [recording, setRecording] = useState<AudioRecording | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const secondsRef = useRef(0);
    /** Mirrors `recording.url` so cleanup can revoke it without reading state. */
    const previewUrlRef = useRef<string | null>(null);

    const releaseStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    }, []);

    const stopTicking = useCallback(() => {
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
    }, []);

    const revokePreview = useCallback(() => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
    }, []);

    /** Stop the current take. The blob is assembled in the recorder's onstop. */
    const stop = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") recorder.stop();
        stopTicking();
    }, [stopTicking]);

    const start = useCallback(async () => {
        if (!isRecordingSupported()) {
            setError("Este navegador no permite grabar audio.");
            setStatus("error");
            return;
        }

        setError(null);
        setStatus("requesting");

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            setError(describeMicError(e));
            setStatus("error");
            return;
        }

        try {
            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            streamRef.current = stream;
            recorderRef.current = recorder;
            chunksRef.current = [];
            secondsRef.current = 0;
            setSeconds(0);

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };

            recorder.onstop = () => {
                releaseStream();
                stopTicking();
                const type = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type });
                chunksRef.current = [];
                if (blob.size === 0) {
                    setError("La grabación quedó vacía. Intenta de nuevo.");
                    setStatus("error");
                    return;
                }
                const file = new File([blob], `captura.${extensionFor(type)}`, { type });
                revokePreview();
                const url = URL.createObjectURL(blob);
                previewUrlRef.current = url;
                setRecording({ file, url, seconds: secondsRef.current });
                setStatus("recorded");
            };

            recorder.onerror = () => {
                releaseStream();
                stopTicking();
                setError("La grabación se interrumpió.");
                setStatus("error");
            };

            recorder.start();
            setStatus("recording");

            tickRef.current = setInterval(() => {
                secondsRef.current += 1;
                setSeconds(secondsRef.current);
                // The cap is a product decision, not a technical one: past a minute
                // the sentence stops being one transaction.
                if (secondsRef.current >= MAX_AUDIO_SECONDS) stop();
            }, 1000);
        } catch (e) {
            releaseStream();
            setError(describeMicError(e));
            setStatus("error");
        }
    }, [releaseStream, revokePreview, stop, stopTicking]);

    /** Throw the take away and go back to the initial state. */
    const reset = useCallback(() => {
        stop();
        releaseStream();
        revokePreview();
        setRecording(null);
        setSeconds(0);
        secondsRef.current = 0;
        setError(null);
        setStatus("idle");
    }, [releaseStream, revokePreview, stop]);

    // Leaving the screen mid-take must not leave the microphone open. Reads only
    // refs, so it never captures a stale render's values.
    useEffect(() => () => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== "inactive") {
            recorder.onstop = null;
            recorder.stop();
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (tickRef.current) clearInterval(tickRef.current);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    }, []);

    return {
        status,
        seconds,
        error,
        recording,
        isRecording: status === "recording",
        remainingSeconds: Math.max(0, MAX_AUDIO_SECONDS - seconds),
        start,
        stop,
        reset,
    };
}
