"use client";

import { CameraIcon, ImageIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FAILURE_ICON } from "@/components/app/quiz/JoinFailure";
import { startJoin } from "@/lib/app/api/hooks";
import { toApiError, type ApiErrorCode } from "@/lib/app/api/errors";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { useJoinFailureCopy, useQT } from "@/lib/app/quiz-copy";
import { decodeCanvas, decodeImageFile, interpretCode, type ScanResult } from "@/lib/app/scan";

type Phase = "starting" | "scanning" | "denied" | "unavailable" | "error" | "stopped";

const noop = () => () => {};
const INTRO_KEY = "teacheraid-camera-intro";
const introSeen = () => {
  try {
    return window.localStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
};
const cameraBlocked = () => !window.isSecureContext || !navigator.mediaDevices?.getUserMedia;
const onVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const pageVisible = () => document.visibilityState === "visible";

export default function Scan() {
  const { t } = useT();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handled = useRef(false);

  const insecure = useSyncExternalStore(noop, cameraBlocked, () => false);
  // The camera runs only while the page is on screen: it stops when the student switches apps
  // (iPhone ends the stream then anyway) and starts again on return.
  const visible = useSyncExternalStore(onVisibility, pageVisible, () => true);
  const seen = useSyncExternalStore(noop, introSeen, () => true);
  const [introOk, setIntroOk] = useState(false);
  const needIntro = !seen && !introOk;
  const [camPhase, setPhase] = useState<Phase>("starting");
  const phase: Phase | "insecure" = insecure ? "insecure" : camPhase;
  const [attempt, setAttempt] = useState(0);
  /** A code that did not open a quiz and why; a class QR that works leaves for the quiz instead. */
  const [result, setResult] = useState<{ scan: ScanResult; code?: ApiErrorCode } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handle = useCallback((raw: string) => {
    if (handled.current) return;
    handled.current = true;
    const scan = interpretCode(raw);
    // The frame tightens for a beat so the scan reads as caught, then the quiz opens. Joining the
    // quiz records the check-in. Replace, so Back from the quiz skips the camera.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLocked(true);
    const beat = new Promise<void>((resolve) => {
      lockTimer.current = setTimeout(resolve, calm ? 0 : 240);
    });
    const miss = (code?: ApiErrorCode) =>
      beat.then(() => {
        setLocked(false);
        setResult({ scan, code });
      });
    if (scan.kind === "other") return void miss();
    // The API says whether the code opens a session; the quiz screen carries on from the answer.
    startJoin(scan.code).then(
      () => {
        navigator.vibrate?.(60);
        return beat.then(() => router.replace(`/app/play/${scan.code}`));
      },
      (e) => miss(toApiError(e).code),
    );
  }, [router]);

  useEffect(() => () => clearTimeout(lockTimer.current), []);

  useEffect(() => {
    if (result || needIntro || !visible) return;
    handled.current = false;
    let stopped = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const video = videoRef.current!;

    if (cameraBlocked()) return;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (stopped) return;
        const name = (e as DOMException).name;
        setPhase(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "unavailable"
              : "error",
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      // Another app taking the camera ends the track: say so and offer Try again, instead of
      // reading the last frame forever.
      const track = stream.getVideoTracks()[0];
      track?.addEventListener("ended", () => {
        if (!stopped) setPhase("stopped");
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      setPhase("scanning");

      let busy = false;
      let last = 0;
      const tick = async (now: number) => {
        if (stopped || handled.current || track?.readyState === "ended") return;
        raf = requestAnimationFrame(tick);
        if (busy || now - last < 110 || video.readyState < 2 || !video.videoWidth) return;
        busy = true;
        last = now;
        const canvas = canvasRef.current!;
        const scale = Math.min(1, 720 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0, canvas.width, canvas.height);
        const text = await decodeCanvas(canvas);
        busy = false;
        if (text && !stopped) handle(text);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    };
  }, [attempt, result, handle, needIntro, visible]);

  const message =
    phase === "starting"
      ? t("scan.starting")
      : phase === "denied"
        ? t("scan.denied")
        : phase === "insecure"
          ? t("scan.insecure")
          : phase === "unavailable"
            ? t("scan.unavailable")
            : phase === "error"
              ? t("scan.error")
              : phase === "stopped"
                ? t("scan.stopped")
                : t("scan.hint");
  const failed = phase === "denied" || phase === "insecure" || phase === "unavailable" || phase === "error" || phase === "stopped";

  return (
    <main className="scan">
      <div className="scan__view">
        <video ref={videoRef} playsInline muted aria-hidden="true" />
        <canvas ref={canvasRef} hidden />
        <div className="scan__top">
          {/* The scanner works like a modal: Back returns to the screen it was opened from. */}
          <button className="round" aria-label={t("close")} style={{ background: "rgba(3,12,30,0.5)" }} onClick={() => leave(router)}>
            <XIcon size={24} />
          </button>
          <h1 className="top__title" style={{ margin: 0 }}>
            {t("scan.title")}
          </h1>
          <span />
        </div>
        {phase === "scanning" && (
          <div className={`frame${locked ? " frame--locked" : ""}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <b />
          </div>
        )}
        <p className={`scan__msg${failed ? " scan__msg--block" : ""}`} role="status">
          {failed && <WarningIcon size={32} color="var(--yellow)" style={{ display: "block", margin: "0 auto 12px" }} aria-hidden="true" />}
          {message}
        </p>
      </div>

      <div className="scan__tools">
        {note && <p className="warn">{note}</p>}
        {failed && (
          <button
            className="btn btn--primary span2"
            onClick={() => {
              setNote(null);
              setPhase("starting");
              setAttempt((n) => n + 1);
            }}
          >
            {t("scan.retry")}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setNote(null);
            try {
              const text = await decodeImageFile(file);
              if (text) handle(text);
              else setNote(t("scan.uploadFail"));
            } catch {
              setNote(t("scan.uploadFail"));
            }
          }}
        />
        <button className="btn btn--ghost span2" onClick={() => fileRef.current?.click()}>
          <ImageIcon size={20} aria-hidden="true" />
          {t("scan.upload")}
        </button>
      </div>

      {needIntro && (
        <div className="scan-intro">
          <span className="badge badge--quiet" style={{ width: 96, height: 96 }}>
            <CameraIcon size={44} aria-hidden="true" />
          </span>
          <h2 className="t-title">{t("scan.intro.title")}</h2>
          <p className="t-body muted" style={{ margin: 0, maxWidth: 320 }}>
            {t("scan.intro.body")}
          </p>
          <button
            className="btn btn--primary btn--block"
            style={{ marginTop: 16, maxWidth: 320 }}
            onClick={() => {
              try {
                window.localStorage.setItem(INTRO_KEY, "1");
              } catch {
                // ignore
              }
              setIntroOk(true);
            }}
          >
            {t("scan.intro.cta")}
          </button>
          <button className="btn btn--plain" style={{ maxWidth: 320 }} onClick={() => leave(router)}>
            {t("scan.intro.later")}
          </button>
        </div>
      )}

      {result && <Miss code={result.code} onAgain={() => {
        setNote(null);
        setPhase("starting");
        setResult(null);
      }} />}
    </main>
  );
}

/** A code that did not open a quiz, said where the camera was: the reason, and a way to scan again. */
function Miss({ code, onAgain }: { code?: ApiErrorCode; onAgain: () => void }) {
  const failure = useJoinFailureCopy()(code);
  const { t } = useQT();
  const Icon = FAILURE_ICON[failure.kind];
  return (
    <section className="scan-miss glass" role="alert">
      <span className="scan-miss__badge" aria-hidden="true">
        <Icon size={32} color="var(--yellow)" />
      </span>
      <h2 className="scan-miss__title">{failure.title}</h2>
      <p className="scan-miss__body">{failure.body}</p>
      <button className="btn btn--primary btn--block" autoFocus onClick={onAgain}>
        {t("q.fail.scan")}
      </button>
    </section>
  );
}
