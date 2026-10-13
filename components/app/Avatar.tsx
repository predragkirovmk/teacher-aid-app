import { AtomIcon, BinocularsIcon, GlobeHemisphereWestIcon, LightningIcon, MusicNotesIcon, PaletteIcon, RocketIcon, type Icon } from "@phosphor-icons/react";
import type { AvatarId } from "@/lib/app/avatars";

export const AVATAR_ICONS: Record<Exclude<AvatarId, "initials">, Icon> = {
  atom: AtomIcon,
  rocket: RocketIcon,
  telescope: BinocularsIcon,
  zap: LightningIcon,
  music: MusicNotesIcon,
  earth: GlobeHemisphereWestIcon,
  palette: PaletteIcon,
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
      {Icon ? <Icon style={{ width: "48%", height: "48%" }} /> : initials}
    </span>
  );
}
