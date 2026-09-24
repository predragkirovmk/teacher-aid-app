/* eslint-disable @next/next/no-img-element -- static SVG icons gain nothing from next/image */

// The 26-icon duotone glass set (teacher-aid-flutter/design/teacheraid/assets/icons), exported
// in two tones: dark for midnight surfaces, light for ice surfaces.
export type IconName =
  | "back"
  | "backspace"
  | "badge"
  | "bell"
  | "bolt"
  | "bulb"
  | "chat"
  | "check"
  | "chemistry"
  | "cloud"
  | "cross"
  | "flag"
  | "history"
  | "history-subject"
  | "home"
  | "lock"
  | "offline"
  | "physics"
  | "pin"
  | "practice"
  | "private"
  | "progress"
  | "scan"
  | "shield"
  | "skip"
  | "target";

type Props = {
  name: IconName;
  tone?: "dark" | "light";
  size?: number;
  className?: string;
  label?: string;
};

export function Icon({ name, tone = "dark", size = 40, className, label }: Props) {
  return (
    <img
      src={`/site/icons/${name}-${tone}.svg`}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={className}
      decoding="async"
      draggable={false}
    />
  );
}
