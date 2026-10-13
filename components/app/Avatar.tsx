import { Atom, Earth, Music, Palette, Rocket, Telescope, Zap, type LucideIcon } from "lucide-react";
import type { AvatarId } from "@/lib/app/avatars";

export const AVATAR_ICONS: Record<Exclude<AvatarId, "initials">, LucideIcon> = {
  atom: Atom,
  rocket: Rocket,
  telescope: Telescope,
  zap: Zap,
  music: Music,
  earth: Earth,
  palette: Palette,
};

/** The student's own avatar: a yellow circle with their initials or the glyph they picked. */
export function Avatar({
  avatar,
  initials,
  size = 64,
  className = "",
}: {
  avatar: AvatarId;
  initials: string;
  size?: number;
  className?: string;
}) {
  const Icon = avatar === "initials" ? null : AVATAR_ICONS[avatar];
  return (
    <span
      className={`avatar ${className}`}
      aria-hidden="true"
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem`, fontSize: `${(size * 0.34) / 16}rem` }}
    >
      {Icon ? <Icon strokeWidth={2} style={{ width: "48%", height: "48%" }} /> : initials}
    </span>
  );
}
