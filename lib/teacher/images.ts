/**
 * The picture on a question (FR-LES-10, FR-LES-11, FR-LES-19): what may be added, and the demo's way of making it small. Nothing in
 * the first half touches the browser, so it is unit tested; the second half takes the browser's part as an argument for the same reason.
 */

/** FR-LES-19 lists no types and no size. PROPOSED: a teacher's photo or a picture from a document, in the three formats every phone and computer makes. */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
/** PROPOSED. A phone's photo is 2 to 5 MB; 10 MB leaves room for the largest, and the server makes the phone-sized variants (FR-LES-11). */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** What the teacher may write about the picture, for students who cannot see it well. PROPOSED. */
export const IMAGE_ALT_MAX_CHARS = 200;

/** The `accept` of the file input: the extensions, and the types a computer may give them. It narrows the choice; it does not replace the check. */
export const IMAGE_ACCEPT = [...IMAGE_TYPES, ...IMAGE_EXTENSIONS].join(",");

/** What can be wrong with a picture, named as the `reason` of the `validation_failed` the API answers with (PROPOSED). */
export type ImageProblem = "image_type" | "image_too_large" | "image_unreadable";

type Named = { name: string; type: string; size: number };

const hasExtension = (name: string) => IMAGE_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/**
 * What is wrong with a chosen file, before it is sent; null when nothing is. The type the computer gives is trusted when there is one,
 * and the name's ending when there is not (some systems give none). The server judges by the content, as it does for a document
 * (BR-LES-05): a file that passes here and is not a picture is refused there as `image_unreadable`.
 */
export function checkImage(file: Named): ImageProblem | null {
  if (file.size === 0) return "image_unreadable";
  const type = file.type.toLowerCase();
  const typeOk = type === "" ? hasExtension(file.name) : (IMAGE_TYPES as readonly string[]).includes(type);
  if (!typeOk) return "image_type";
  return file.size > IMAGE_MAX_BYTES ? "image_too_large" : null;
}

// ---- Making it small, for the demo -----------------------------------------------------------------------------------

/** The demo keeps a picture in the browser's storage, so it is made small first. The real API does this on the server (FR-LES-11). */
export const DEMO_IMAGE_EDGE = 1000;
export const DEMO_IMAGE_QUALITY = 0.8;

/** The size a picture is made: its longest side at most `edge`, the shape kept, and never larger than it was. */
export function scaledSize(width: number, height: number, edge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > edge)) return { width, height };
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** What the browser does: read a file as a picture, and draw it at a size as a JPEG. */
export type ImageEnv = {
  decode(file: Blob): Promise<{ width: number; height: number; source: unknown }>;
  /** A `data:image/jpeg` address of `source` drawn at this size. */
  encode(source: unknown, width: number, height: number, quality: number): Promise<string>;
};

/** The file is not a picture the browser can read (it is damaged, or something else with a picture's name). */
export class UnreadableImage extends Error {
  constructor(options?: { cause?: unknown }) {
    super("unreadable image", options);
    this.name = "UnreadableImage";
  }
}

/** A picture as a JPEG address of about `edge` pixels on its longest side. A small picture keeps its size. */
export async function downscaleImage(
  file: Blob,
  env: ImageEnv,
  { edge = DEMO_IMAGE_EDGE, quality = DEMO_IMAGE_QUALITY }: { edge?: number; quality?: number } = {},
): Promise<{ url: string; width: number; height: number }> {
  let decoded;
  try {
    decoded = await env.decode(file);
  } catch (cause) {
    throw new UnreadableImage({ cause });
  }
  if (!(decoded.width > 0 && decoded.height > 0)) throw new UnreadableImage();
  const { width, height } = scaledSize(decoded.width, decoded.height, edge);
  try {
    return { url: await env.encode(decoded.source, width, height, quality), width, height };
  } catch (cause) {
    throw new UnreadableImage({ cause });
  }
}

/**
 * The browser's own: `createImageBitmap` reads the file with no address to load (so no `blob:` is needed by the page's security
 * policy), a canvas draws it, and the JPEG is read back as a `data:` address. A transparent picture is drawn on white.
 */
export const browserImageEnv: ImageEnv = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  async encode(source, width, height, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(source as ImageBitmap, 0, 0, width, height);
    (source as ImageBitmap).close?.();
    return canvas.toDataURL("image/jpeg", quality);
  },
};
