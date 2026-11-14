"use client";

import {
  BooksIcon,
  CalendarCheckIcon,
  ChalkboardTeacherIcon,
  GearSixIcon,
  ListIcon,
  QuestionIcon,
  SignOutIcon,
  UsersThreeIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
// Loaded on every page so the browser's install offer is caught whenever it comes.
import "@/lib/app/install";
import { Mark } from "@/components/app/Mark";
import { ConfirmDialog } from "@/components/teacher/ConfirmDialog";
import { signOut, useAuth, useOpenSessionAnywhere, useSchoolWording, useTeacherName } from "@/lib/teacher/api/hooks";
import { useT, type Key } from "@/lib/teacher/i18n";
import { useNarrow } from "@/lib/teacher/media";
import { showsOpenLesson } from "@/lib/teacher/routes";
import { signInUrl } from "@/lib/teacher/signin";
import { NavGlide } from "./NavGlide";
import { OpenLesson } from "./OpenLesson";
import { PublicFrame } from "./PublicFrame";

type Destination = { href: string; label: Key; Icon: Icon };

/** The four places a teacher goes. Always on screen on a laptop. */
const MAIN: Destination[] = [
  { href: "/teacher", label: "nav.today", Icon: CalendarCheckIcon },
  { href: "/teacher/lessons", label: "nav.lessons", Icon: ChalkboardTeacherIcon },
  { href: "/teacher/classes", label: "nav.classes", Icon: UsersThreeIcon },
  { href: "/teacher/library", label: "nav.library", Icon: BooksIcon },
];

const MORE: Destination[] = [
  { href: "/teacher/settings", label: "nav.settings", Icon: GearSixIcon },
  { href: "/teacher/help", label: "nav.help", Icon: QuestionIcon },
];

const FOCUSABLE = "a[href], button:not([disabled])";

/**
 * The frame of every page of a signed-in teacher: the sidebar and, in a narrow window, the top bar that opens it; while a lesson
 * is running, the way back to it on every page that does not already say so. The sidebar is the one place that says who is
 * signed in, at its foot, where the name leads to Settings. Help is open to anyone, and without a teacher it has no sidebar,
 * because every place the sidebar leads to needs one.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  return status === "signedIn" ? <Frame>{children}</Frame> : <PublicFrame>{children}</PublicFrame>;
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, te } = useT();
  useSchoolWording();
  const teacher = useTeacherName();
  const running = useOpenSessionAnywhere(pathname).data?.session ?? null;
  const reminder = running && showsOpenLesson(pathname, running.id) ? running : null;
  const narrow = useNarrow();
  // The path the drawer was opened on, so moving to another page closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = narrow && openAt === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  // Why the teacher is still signed in after saying yes: the server could not be reached.
  const [signOutProblem, setSignOutProblem] = useState<string | null>(null);
  const wasOpen = useRef(false);

  const isCurrent = (href: string) => (href === "/teacher" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));

  // The drawer: focus goes in when it opens and back to the Menu button when it closes, Escape
  // closes it, Tab stays inside it, and the page behind does not scroll.
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpen.current) menuButton.current?.focus();
    wasOpen.current = open;
    if (!open) return;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Escape in a question (the sign-out one) answers the question, not the drawer behind it.
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Escape") return setOpenAt(null);
      if (e.key !== "Tab" || !drawer.current) return;
      const items = Array.from(drawer.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = overflow;
    };
  }, [open]);

  const row = ({ href, label, Icon }: Destination) => {
    const current = isCurrent(href);
    return (
      <li key={href}>
        <Link
          href={href}
          className="nav__item"
          aria-current={current ? "page" : undefined}
          onClick={() => setOpenAt(null)}
          // From a running lesson Help opens beside it, so the console is never left.
          {...(href === "/teacher/help" && pathname.startsWith("/teacher/live/") ? { target: "_blank", rel: "noopener" } : {})}
        >
          {/* The selected row shows the filled icon, as well as its own ground and the heavier label. */}
          <Icon size={22} weight={current ? "fill" : "regular"} aria-hidden="true" />
          {t(label)}
          {href === "/teacher/help" && pathname.startsWith("/teacher/live/") && <span className="sr">{`, ${t("link.newtab")}`}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className="shell">
      <a href="#main" className="btn btn--secondary btn--small skip">
        {t("skip")}
      </a>

      <header className={reminder ? "topbar topbar--running" : "topbar"} inert={open}>
        <button
          ref={menuButton}
          type="button"
          className="btn btn--secondary btn--small"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpenAt(pathname)}
        >
          <ListIcon size={20} aria-hidden="true" />
          {t("nav.menu")}
        </button>
        <Link href="/teacher" className="brand__link" aria-label={t("nav.home")}>
          <Mark size={28} />
          <span className="brand__word">TeacherAid</span>
        </Link>
        {reminder && <OpenLesson session={reminder} where="top" />}
      </header>

      <aside
        id="sidebar"
        ref={drawer}
        className="sidebar"
        data-open={open}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? t("nav.menu") : undefined}
      >
        <div className="brand">
          <button ref={closeButton} type="button" className="btn btn--secondary btn--small sidebar__close" onClick={() => setOpenAt(null)}>
            <XIcon size={20} aria-hidden="true" />
            {t("close")}
          </button>
          <Link href="/teacher" className="brand__link" aria-label={t("nav.home")} onClick={() => setOpenAt(null)}>
            <Mark size={28} />
            <span className="brand__word">TeacherAid</span>
          </Link>
        </div>
        <nav aria-label={t("nav.main")}>
          <NavGlide at={pathname} />
          <ul className="nav">{MAIN.map(row)}</ul>
        </nav>
        {/* Under the four places, not above them: when it appears or goes the menu does not move under the pointer. */}
        {reminder && <OpenLesson session={reminder} where="side" />}
        <nav className="sidebar__foot" aria-label={t("nav.more")}>
          <NavGlide at={pathname} />
          <ul className="nav">
            {MORE.map(row)}
            <li>
              <button type="button" className="nav__item" onClick={() => setSigningOut(true)}>
                <SignOutIcon size={22} aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </li>
          </ul>
        </nav>
        {teacher && (
          <div className="sidebar__me">
            <Link href="/teacher/settings" className="me" aria-label={t("user.link", { name: teacher.full })} onClick={() => setOpenAt(null)}>
              {/* The initials are drawn by the style sheet, so the name the link has is the name that can be read on it. */}
              <span className="me__badge" aria-hidden="true" data-initials={teacher.initials} />
              <span className="me__name">{teacher.full}</span>
            </Link>
          </div>
        )}
      </aside>
      <div className="scrim" data-open={open} aria-hidden="true" onClick={() => setOpenAt(null)} />

      <main id="main" className="main" tabIndex={-1} inert={open}>
        {children}
      </main>

      <ConfirmDialog
        open={signingOut}
        title={t("logout.title")}
        problem={signOutProblem ?? undefined}
        stay={t("logout.stay")}
        confirm={t("logout.confirm")}
        onStay={() => {
          setSigningOut(false);
          setSignOutProblem(null);
        }}
        onConfirm={async () => {
          try {
            // Ends the session and forgets what was shown. Help is open to anyone, so the gate would leave a teacher who signs
            // out there where they are: the teacher is taken to the sign-in screen from here, whichever page they were on.
            await signOut();
            router.replace(signInUrl({ notice: "signed_out" }));
          } catch (e) {
            // Still signed in: the question stays open and says why, and Yes tries again.
            setSignOutProblem(`${t("logout.failed")} ${te(e)}`);
          }
        }}
      />
    </div>
  );
}
