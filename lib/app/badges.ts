import { FlameIcon, HandIcon, MedalIcon, StarIcon, type Icon } from "@phosphor-icons/react";
import type { Badge } from "./api/types";
import { hasKey, type TFn } from "./i18n";

const ICONS: Record<string, Icon> = { answer: HandIcon, ontime: MedalIcon, streak: FlameIcon, perfect: StarIcon };

/** The glyph of a badge the app has drawn; a new one from the API gets a star. */
export const badgeIcon = (code: string): Icon => ICONS[code] ?? StarIcon;

/** A badge's name and how to earn it in the app's own words where it has them, else the API's title. */
export function badgeCopy(t: TFn, badge: Pick<Badge, "code" | "title">) {
  const title = `ach.${badge.code}.title`;
  const body = `ach.${badge.code}.body`;
  return {
    title: hasKey(title) ? t(title) : badge.title,
    body: hasKey(body) ? t(body) : "",
  };
}
