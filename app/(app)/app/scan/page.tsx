"use client";

import { Camera, ChevronLeft, ImageUp, Keyboard, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ScanResultView } from "@/components/app/ScanResult";
import { useT } from "@/lib/app/i18n";
import { leave } from "@/lib/app/nav";
import { decodeCanvas, decodeImageFile, interpretCode, type ScanResult } from "@/lib/app/scan";
import { actions, type Checkin } from "@/lib/app/store";

type Phase = "starting" | "scanning" | "denied" | "unavailable" | "error";

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

export default function Scan() {
  const { t } = useT();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handled = useRef(false);

  const insecure = useSyncExternalStore(noop, cameraBlocked, () => false);
  const seen = useSyncExternalStore(noop, introSeen, () => true);
  const [introOk, setIntroOk] = useState(false);
  const needIntro = !seen && !introOk;
  const [camPhase, setPhase] = useState<Phase>("starting");
  const phase: Phase | "insecure" = insecure ? "insecure" : camPhase;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ scan: ScanResult; entry: Checkin | null } | null>(null);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const lockTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handle = useCallback((raw: string) => {
    if (handled.current) return;
    handled.current = true;
    const scan = interpretCode(raw);
    const entry = scan.kind === "class" ? actions.checkIn(scan.subject.id) : null;
    if (scan.kind === "class") navigator.vibrate?.(60);
    // The frame tightens for a beat so the scan reads as caught, then the result takes over.
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLocked(true);
    lockTimer.current = setTimeout(
      () => {
        setLocked(false);
        setResult({ scan, entry });
      },
      calm ? 0 : 240,
    );
  }, []);

  useEffect(() => () => clearTimeout(lockTimer.current), []);

  useEffect(() => {
    if (result || needIntro) return;
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
      video.srcObject = stream;
      await video.play().catch(() => {});
      setPhase("scanning");

      let busy = false;
      let last = 0;
      const tick = async (now: number) => {
        if (stopped || handled.current) return;
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
  }, [attempt, result, handle, needIntro]);

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
              : t("scan.hint");
  const failed = phase === "denied" || phase === "insecure" || phase === "unavailable" || phase === "error";

  return (
    <main className="scan">
      <div className="scan__view">
        <video ref={videoRef} playsInline muted aria-hidden="true" />
        <canvas ref={canvasRef} hidden />
        <div className="scan__top">
          {/* The scanner works like a modal: Back returns to the screen it was opened from. */}
          <button className="round" aria-label={t("back")} style={{ background: "rgba(3,12,30,0.5)" }} onClick={() => leave(router)}>
            <ChevronLeft size={26} strokeWidth={2} />
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
          {failed && <TriangleAlert size={32} strokeWidth={2} color="var(--yellow)" style={{ display: "block", margin: "0 auto 12px" }} aria-hidden="true" />}
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
        <button className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
          <ImageUp size={20} strokeWidth={2} aria-hidden="true" />
          {t("scan.upload")}
        </button>
        <button className="btn btn--ghost" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>
          <Keyboard size={20} strokeWidth={2} aria-hidden="true" />
          {t("scan.type")}
        </button>
        {typing && (
          <form
            className="codeform"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) handle(code);
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("scan.typePlaceholder")}
              aria-label={t("scan.type")}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              autoFocus
            />
            <button className="btn btn--primary" style={{ minHeight: 52, padding: "0 20px" }} type="submit">
              {t("scan.submit")}
            </button>
          </form>
        )}
        <Link href="/app/qr-kit" className="btn btn--ghost span2" style={{ minHeight: 48 }}>
          {t("scan.kit")}
        </Link>
      </div>

      {needIntro && (
        <div className="scan-intro">
          <span className="badge badge--quiet" style={{ width: 96, height: 96 }}>
            <Camera size={44} strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className="t-title">{t("scan.intro.title")}</h2>
          <p className="t-body muted" style={{ margin: 0, maxWidth: 320 }}>
            {t("scan.intro.body")}
          </p>
          <button
            className="btn btn--primary btn--block"
            style={{ marginTop: 18, maxWidth: 320 }}
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
          <button className="sr" onClick={() => leave(router)}>
            {t("back")}
          </button>
        </div>
      )}

      {result && (
        <ScanResultView
          result={result.scan}
          entry={result.entry}
          onAgain={() => {
            setNote(null);
            setPhase("starting");
            setResult(null);
          }}
          onDone={() => leave(router)}
        />
      )}
    </main>
  );
}
