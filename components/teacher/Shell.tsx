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
import { useT, type Key } from "@/lib/teacher/i18n";
import { useNarrow } from "@/lib/teacher/media";

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

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const narrow = useNarrow();
  // The path the drawer was opened on, so moving to another page closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = narrow && openAt === pathname;
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const logout = useRef<HTMLDialogElement>(null);
  const stay = useRef<HTMLButtonElement>(null);
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
      // Escape in the sign-out question answers the question, not the drawer behind it.
      if (logout.current?.open) return;
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

  const askLogout = () => {
    logout.current?.showModal();
    // The safe answer is the one in hand.
    stay.current?.focus();
  };
  const confirmLogout = () => {
    logout.current?.close();
    router.push("/teacher/signed-out");
  };

  const row = ({ href, label, Icon }: Destination) => {
    const current = isCurrent(href);
    return (
      <li key={href}>
        <Link href={href} className="nav__item" aria-current={current ? "page" : undefined} onClick={() => setOpenAt(null)}>
          {/* The selected row shows the filled icon, as well as the bar and the bold label. */}
          <Icon size={28} weight={current ? "fill" : "regular"} aria-hidden="true" />
          {t(label)}
        </Link>
      </li>
    );
  };

  return (
    <div className="shell">
      <a href="#main" className="btn btn--secondary btn--small skip">
        {t("skip")}
      </a>

      <header className="topbar" inert={open}>
        <button
          ref={menuButton}
          type="button"
          className="btn btn--secondary btn--small"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpenAt(pathname)}
        >
          <ListIcon size={24} aria-hidden="true" />
          {t("nav.menu")}
        </button>
        <Link href="/teacher" className="brand__link" aria-label={t("nav.home")}>
          <Mark size={36} />
          <span className="brand__word">TeacherAid</span>
        </Link>
      </header>

      <div
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
            <XIcon size={24} aria-hidden="true" />
            {t("close")}
          </button>
          <Link href="/teacher" className="brand__link" aria-label={t("nav.home")} onClick={() => setOpenAt(null)}>
            <Mark size={40} />
            <span className="brand__word">TeacherAid</span>
          </Link>
        </div>
        <nav aria-label={t("nav.main")}>
          <ul className="nav">{MAIN.map(row)}</ul>
        </nav>
        <nav className="sidebar__foot" aria-label={t("nav.more")}>
          <ul className="nav">
            {MORE.map(row)}
            <li>
              <button type="button" className="nav__item" onClick={askLogout}>
                <SignOutIcon size={28} aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </li>
          </ul>
        </nav>
      </div>
      <div className="scrim" data-open={open} aria-hidden="true" onClick={() => setOpenAt(null)} />

      <main id="main" className="main" tabIndex={-1} inert={open}>
        {children}
      </main>

      <dialog ref={logout} className="dialog" role="alertdialog" aria-labelledby="logout-title">
        <h2 id="logout-title" className="dialog__title">
          {t("logout.title")}
        </h2>
        <div className="dialog__actions">
          <button ref={stay} type="button" className="btn btn--primary" autoFocus onClick={() => logout.current?.close()}>
            {t("logout.stay")}
          </button>
          <button type="button" className="btn btn--secondary" onClick={confirmLogout}>
            {t("logout.confirm")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
