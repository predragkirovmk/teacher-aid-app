import Link from "next/link";
import { Mark } from "@/components/Mark";
import { content } from "@/lib/content";

export default function Home() {
  const links = [
    { href: "/host", label: "Host screen", note: "the projector — QR, live bars, reveal, leaderboard" },
    { href: `/j/${content.code}`, label: "Join as a student", note: "what the judges' phones open" },
    { href: "/print", label: "Printable QR", note: "A4 backup for the judges' table" },
    { href: "/host?sim=1", label: "Host, simulation", note: "fake students, no network needed" },
  ];
  return (
    <main className="min-h-dvh p-[clamp(1.5rem,5vw,4rem)] max-w-[60rem]">
      <Mark name={content.app} className="text-[1.75rem]" />
      <h1 className="font-display font-semibold text-[clamp(2.25rem,5vw,4rem)] leading-[1] tracking-tight mt-10 max-w-[16ch]">
        Every class starts with a question.
      </h1>
      <p className="mt-4 text-ink-2 text-xl max-w-[48ch]">
        Demo build for Startup Weekend Bitola. Session code <span className="font-display font-semibold text-ink">{content.code}</span>.
      </p>
      <ul className="mt-10 grid gap-1">
        {links.map((l) => (
          <li key={l.href} className="border-t border-paper-3 py-4 grid gap-1 sm:grid-cols-[14rem_1fr] sm:items-baseline">
            <Link href={l.href} className="font-display font-semibold text-2xl underline underline-offset-4 decoration-2 hover:text-amber-2 transition-colors">
              {l.label}
            </Link>
            <span className="text-ink-2 text-lg">{l.note}</span>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-ink-3">
        Host keys: Space next · N next question · R reset · S simulation · F fullscreen.
      </p>
    </main>
  );
}
