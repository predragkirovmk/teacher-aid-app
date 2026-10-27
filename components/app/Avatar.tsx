/** The student's own avatar: their photo, or a yellow circle with their initials. */
export function Avatar({
  photo = null,
  initials,
  size = 64,
  className = "",
}: {
  photo?: string | null;
  initials: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${className}`}
      aria-hidden="true"
      style={{ width: `${size / 16}rem`, height: `${size / 16}rem`, fontSize: `${(size * 0.34) / 16}rem` }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" width={size} height={size} className="avatar__img" draggable={false} />
      ) : (
        initials
      )}
    </span>
  );
}
