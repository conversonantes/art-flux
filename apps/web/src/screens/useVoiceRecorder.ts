import { useCallback, useEffect, useRef, useState } from "react";

/** Voice notes last up to 3 minutes; longer recordings go in as a link. */
export const MAX_RECORDING_SECONDS = 180;

export const canRecord = () =>
  typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

/** Records from the microphone; `onDone` gets the audio and how long it lasted. */
export function useVoiceRecorder(onDone: (audio: Blob, seconds: number) => void) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useRef(0);
  const done = useRef(onDone);
  done.current = onDone;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const length = Math.max(1, elapsed.current);
        if (chunks.length > 0) done.current(new Blob(chunks, { type: rec.mimeType || chunks[0]!.type || "audio/webm" }), length);
      };
      recorder.current = rec;
      elapsed.current = 0;
      setSeconds(0);
      rec.start();
      setRecording(true);
      timer.current = setInterval(() => {
        elapsed.current += 1;
        setSeconds(elapsed.current);
        if (elapsed.current >= MAX_RECORDING_SECONDS) stop();
      }, 1000);
    } catch {
      setError("No pudimos usar el micrófono. Revisa el permiso del navegador e intenta de nuevo.");
    }
  }, [stop]);

  // Leaving the screen mid-recording lets go of the microphone.
  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((track) => track.stop());
      }
    },
    [],
  );

  return { recording, seconds, error, start, stop };
}
