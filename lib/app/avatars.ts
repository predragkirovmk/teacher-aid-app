/** What the student can change. Class and school come from the school account. */
export type Profile = { name: string | null; photo: string | null };
export const DEFAULT_PROFILE: Profile = { name: null, photo: null };

/** A photo is stored as a small JPEG data URL; anything else is dropped. */
export const isPhoto = (v: unknown): v is string =>
  typeof v === "string" && v.length < 400_000 && v.startsWith("data:image/jpeg;base64,");
