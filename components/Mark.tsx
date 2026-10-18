import { Mark as Logo } from "./app/Mark";

export function Mark({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Logo size={18} className="h-[1.1em] w-[1.1em]" />
      <span className="font-display font-semibold tracking-tight">{name}</span>
    </span>
  );
}
