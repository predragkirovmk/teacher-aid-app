"use client";

import { useT } from "./i18n";
import { initials } from "./quiz";
import { useApp } from "./store";

export { AVATARS, type AvatarId } from "./avatars";

export const NAME_MIN = 2;
export const NAME_MAX = 24;

/** Collapse runs of spaces and trim, the way the name is stored and shown. */
export const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim();

/** Letters of any script, with single spaces, hyphens, apostrophes and full stops between them. */
const NAME_RE = /^\p{L}[\p{L}\p{M}'’.\- ]*$/u;

export function nameError(raw: string): "empty" | "short" | "chars" | null {
  const name = cleanName(raw);
  if (!name) return "empty";
  if (Array.from(name).length < NAME_MIN) return "short";
  if (!NAME_RE.test(name)) return "chars";
  return null;
}

/** The signed-in student as classmates see them. */
export function useMe() {
  const { profile } = useApp();
  const { t } = useT();
  const name = profile.name ?? t("user.name");
  return {
    name,
    first: name.split(" ")[0],
    initials: initials(name),
    avatar: profile.avatar,
    custom: profile.name !== null,
  };
}
