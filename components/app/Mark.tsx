/** The TeacherAid M mark: a blocky M with a T-shaped cut-out and two eyes. Draws in currentColor. */
export function Mark({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className={className} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4 4H32L50 22L68 4H96V96H4Z M14 44H86V58L58 66V96H42V66L14 58Z"
      />
      <circle cx="31" cy="52" r="5.5" />
      <circle cx="69" cy="52" r="5.5" />
    </svg>
  );
}
