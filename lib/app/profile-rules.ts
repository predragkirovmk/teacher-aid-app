/** The photo the API takes: a JPEG of up to 200 KB (spec 3.2). */
export const PHOTO_MAX_BYTES = 200 * 1024;

/** The display name is 2 to 24 characters (BR-STU-01). */
export const NAME_MIN = 2;
export const NAME_MAX = 24;

/** Collapse runs of spaces and trim, the way the name is stored and shown. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim();

/** Letters of any script, with single spaces, hyphens, apostrophes and full stops between them. */
const NAME_RE = /^\p{L}[\p{L}\p{M}'\u2019.\- ]*$/u;

export function nameError(raw: string): "empty" | "short" | "long" | "chars" | null {
  const name = cleanName(raw);
  if (!name) return "empty";
  const length = Array.from(name).length;
  if (length < NAME_MIN) return "short";
  if (length > NAME_MAX) return "long";
  if (!NAME_RE.test(name)) return "chars";
  return null;
}
