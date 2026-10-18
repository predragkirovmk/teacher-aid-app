import { LOGO_BODY, LOGO_EYES, LOGO_VIEWBOX } from "@/lib/brand";

/** The official TeacherAid logo. Draws in currentColor. */
export function Mark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} width={size} height={size} aria-hidden="true" className={className} fill="currentColor">
      <path d={LOGO_BODY} />
      {LOGO_EYES.map((e) => (
        <circle key={e.cx} {...e} />
      ))}
    </svg>
  );
}
