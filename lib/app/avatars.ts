export const AVATARS = ["initials", "atom", "rocket", "telescope", "zap", "music", "earth", "palette"] as const;
export type AvatarId = (typeof AVATARS)[number];

/** What the student can change. Class and school come from the school account. */
export type Profile = { name: string | null; avatar: AvatarId };
export const DEFAULT_PROFILE: Profile = { name: null, avatar: "initials" };

export const isAvatar = (v: unknown): v is AvatarId => AVATARS.includes(v as AvatarId);
