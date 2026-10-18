import jsQR from "jsqr";
import { subjectByCode, type ClassSubject } from "./data";

export type ScanResult =
  | { kind: "class"; subject: ClassSubject; raw: string }
  | { kind: "unknown-class"; code: string; raw: string }
  | { kind: "other"; raw: string };

/**
 * A class QR is either a link ending in /app/checkin/<code> (so the phone's own camera app works
 * too), a TA:<code> string, or the bare code typed by hand.
 */
export function interpretCode(raw: string): ScanResult {
  const text = raw.trim();
  const link = text.match(/\/app\/checkin\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/);
  const tagged = text.match(/^TA:([A-Za-z0-9-]+)$/i);
  const bare = /^[A-Za-z]{2,5}-\d{1,3}[A-Za-z]?$/.test(text) ? text : null;
  const code = link?.[1] ?? tagged?.[1] ?? bare;
  if (!code) return { kind: "other", raw: text };
  const subject = subjectByCode(code);
  return subject ? { kind: "class", subject, raw: text } : { kind: "unknown-class", code, raw: text };
}

export function checkinLink(origin: string, code: string) {
  return `${origin}/app/checkin/${code}`;
}

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (opts: { formats: string[] }) => Detector;

let nativeDetector: Detector | null | undefined;

function native(): Detector | null {
  if (nativeDetector !== undefined) return nativeDetector;
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  try {
    nativeDetector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    nativeDetector = null;
  }
  return nativeDetector;
}

/**
 * Decode one QR from a canvas: the native BarcodeDetector where there is one, jsQR everywhere else
 * (iOS Safari, Firefox) or if it fails. Camera frames arrive ten times a second, so a native miss
 * is final there; `thorough` (a photo, decoded once) also gives jsQR a try after a native miss.
 */
export async function decodeCanvas(canvas: HTMLCanvasElement, thorough = false): Promise<string | null> {
  const det = native();
  if (det) {
    try {
      const found = await det.detect(canvas);
      if (found[0]?.rawValue) return found[0].rawValue;
      if (!thorough) return null;
    } catch {
      // fall through to jsQR
    }
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
  return code?.data ?? null;
}

export async function decodeImageFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return decodeCanvas(canvas, true);
}
