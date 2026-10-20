"use client";

import { BellSimpleIcon, CheckIcon, ExportIcon, HouseSimpleIcon, PlusSquareIcon, ScanIcon, UserIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNotifications } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";
import type { Locale } from "@/lib/app/api/types";
import { setLocale } from "@/lib/app/locale";
import { useApp } from "@/lib/app/store";
import { ClockOptions } from "./ClockOptions";
import { Pager } from "./Pager";
import { UIContext, type ConfirmOptions } from "./ui";

const NO_TABS = ["/app/scan", "/app/welcome"];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signedIn } = useApp();
  const { t, locale } = useT();
  // Remember the path an overlay was opened on, so navigating closes it without an effect.
  const [langAt, setLangAt] = useState<string | null>(null);
  const [clockAt, setClockAt] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ at: string; options: ConfirmOptions } | null>(null);
  const [installState, setInstallState] = useState<{ at: string; how: "ios" | "manual" } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOut, setToastOut] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lang = langAt === pathname;
  const clockOpen = clockAt === pathname;
  const confirmOptions = confirmState?.at === pathname ? confirmState.options : null;
  const installHow = installState?.at === pathname ? installState.how : null;

  // Time-boxed UI is hard for some people, so the toast stays long and a tap dismisses it.
  const dismissToast = useCallback(() => {
    clearTimeout(toastTimer.current);
    setToastOut(true);
    toastTimer.current = setTimeout(() => {
      setToastMsg(null);
      setToastOut(false);
    }, 200);
  }, []);

  const toast = useCallback(
    (m: string) => {
      clearTimeout(toastTimer.current);
      setToastOut(false);
      setToastMsg(m);
      toastTimer.current = setTimeout(dismissToast, 6000);
    },
    [dismissToast],
  );

  const ui = useMemo(
    () => ({
      openLang: () => setLangAt(pathname),
      confirm: (options: ConfirmOptions) => setConfirmState({ at: pathname, options }),
      toast,
      openInstall: (how: "ios" | "manual") => setInstallState({ at: pathname, how }),
      openClock: () => setClockAt(pathname),
    }),
    [toast, pathname],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Logged out: show nothing behind the welcome screen, and carry the screen that was asked for
  // (a check-in link, say) through it, so Continue lands there instead of on Home.
  const gated = !signedIn && pathname !== "/app/welcome";
  useEffect(() => {
    if (gated) router.replace(`/app/welcome?next=${encodeURIComponent(pathname)}`);
  }, [gated, pathname, router]);

  const showTabs =
    !gated && !NO_TABS.includes(pathname) && !pathname.startsWith("/app/checkin") && !pathname.startsWith("/app/play");

  return (
    <UIContext.Provider value={ui}>
      <div className="stage">
        <div className="phone">
          <Pager pathname={pathname}>{gated ? null : children}</Pager>
          {showTabs && (
            <>
              <div className="edge" aria-hidden="true" />
              <Dock pathname={pathname} />
            </>
          )}
          {lang && (
            <Sheet label={t("lang.title")} onClose={() => setLangAt(null)}>
              {(close) => <LangOptions onDone={close} />}
            </Sheet>
          )}
          {clockOpen && (
            <Sheet label={t("settings.clock")} onClose={() => setClockAt(null)}>
              {(close) => (
                <>
                  <p className="sheet__title">{t("settings.clock")}</p>
                  <ClockOptions onDone={close} />
                </>
              )}
            </Sheet>
          )}
          {confirmOptions && (
            <Sheet label={confirmOptions.title} onClose={() => setConfirmState(null)}>
              {(close) => (
                <>
                  <p className="sheet__title">{confirmOptions.title}</p>
                  <button
                    className="btn btn--ghost btn--block"
                    onClick={() => {
                      close();
                      confirmOptions.onConfirm();
                    }}
                  >
                    {confirmOptions.confirmLabel}
                  </button>
                  <button className="btn btn--primary btn--block" onClick={close}>
                    {t("confirm.cancel")}
                  </button>
                </>
              )}
            </Sheet>
          )}
          {installHow && (
            <Sheet label={t("install.title")} onClose={() => setInstallState(null)}>
              {(close) => (
                <>
                  <p className="sheet__title">{t("install.title")}</p>
                  {installHow === "ios" ? (
                    <>
                      <ol className="steps">
                        <InstallStep icon={ExportIcon} text={t("install.ios.share")} />
                        <InstallStep icon={PlusSquareIcon} text={t("install.ios.add")} />
                        <InstallStep icon={CheckIcon} text={t("install.ios.confirm")} />
                      </ol>
                      <p className="t-cap steps__note">{t("install.ios.safari")}</p>
                    </>
                  ) : (
                    <p className="t-body steps__note">{t("install.other")}</p>
                  )}
                  <button className="btn btn--primary btn--block" onClick={close}>
                    {t("install.ok")}
                  </button>
                </>
              )}
            </Sheet>
          )}
          {/* A live region that is always present announces the toast; one that appears together
              with its text is often not read. The visible toast is for the eyes and a tap. */}
          <p className="sr" role="status">
            {toastMsg ?? ""}
          </p>
          {toastMsg && (
            <div className={`toast glass${toastOut ? " toast--out" : ""}`} aria-hidden="true" onClick={dismissToast}>
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </UIContext.Provider>
  );
}

function Dock({ pathname }: { pathname: string }) {
  const { t } = useT();
  const unread = (useNotifications().data ?? []).filter((n) => n.readAt === null).length;
  // Keep the last non-zero count so the badge can shrink away showing it, instead of vanishing.
  const [lastCount, setLastCount] = useState(unread);
  if (unread > 0 && unread !== lastCount) setLastCount(unread);

  const tab = (href: string, label: string, Icon: Icon, active: boolean, badge?: number) => (
    // Switching tabs replaces the history entry, so Back leaves the section instead of replaying tabs.
    <Link href={href} replace className="tab" aria-current={active ? "page" : undefined}>
      {/* The selected tab shows the filled glyph, as a tab bar does on iOS. */}
      <Icon size={24} weight={active ? "fill" : "regular"} aria-hidden="true" />
      {label}
      {badge !== undefined && (
        <>
          <span className="tab__badge" data-on={badge > 0} aria-hidden="true">
            <span key={lastCount} className="tab__count">
              {lastCount}
            </span>
          </span>
          {badge > 0 && <span className="sr">{t("notif.unreadCount", { n: badge })}</span>}
        </>
      )}
    </Link>
  );

  const index = pathname === "/app" ? 0 : pathname.startsWith("/app/notifications") ? 1 : pathname === "/app/profile" ? 2 : -1;

  return (
    <div className="dock">
      <nav className="tabbar glass" aria-label={t("nav.main")}>
        <span
          className="tab-ind"
          aria-hidden="true"
          style={{ transform: `translateX(${Math.max(index, 0) * 100}%)`, opacity: index < 0 ? 0 : 1 }}
        />
        {tab("/app", t("nav.home"), HouseSimpleIcon, pathname === "/app")}
        {tab("/app/notifications", t("nav.alerts"), BellSimpleIcon, pathname.startsWith("/app/notifications"), unread)}
        {tab("/app/profile", t("nav.profile"), UserIcon, pathname === "/app/profile")}
      </nav>
      {/* The scan is an action, not a section, so it sits beside the tab bar instead of in it. */}
      <Link href="/app/scan" className="scan-fab" aria-label={t("nav.scan")}>
        <ScanIcon size={32} aria-hidden="true" />
      </Link>
    </div>
  );
}

const SHEET_EXIT_MS = 230;

/**
 * A bottom sheet with a draggable grabber. It follows the finger, resists a pull upwards, and on
 * release either flies off (far enough, or fast enough) or springs back. Tapping the grabber,
 * the scrim or Escape closes it with the same exit.
 */
export function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; y: number; t: number; v: number; moved: boolean } | null>(null);
  const [dy, setDy] = useState(0);
  const [phase, setPhase] = useState<"in" | "drag" | "settle" | "out">("in");
  /** How the sheet leaves: on the drawer curve, or at the speed of the flick that threw it. */
  const [exit, setExit] = useState({ ms: SHEET_EXIT_MS, flung: false });

  const leave = useCallback(
    (ms: number, flung: boolean) => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (calm) return onClose();
      setExit({ ms, flung });
      setPhase("out");
      setTimeout(onClose, ms);
    },
    [onClose],
  );
  const close = useCallback(() => leave(SHEET_EXIT_MS, false), [leave]);

  // The latest close, for the Escape key, without setting the sheet up again on every render.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  // Open: everything behind the sheet (except its scrim) becomes inert, so keyboard focus and
  // screen readers stay in the sheet, and focus moves to its first button. Close: the page comes
  // back first, then focus returns to where it was.
  useEffect(() => {
    const sheet = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    const behind: HTMLElement[] = [];
    for (let node: Element | null = sheet; node?.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib === node || sib.classList.contains("scrim") || !(sib instanceof HTMLElement) || sib.inert) continue;
        // A live region stays live, so a toast sent as the sheet closes is still read out.
        if (sib.getAttribute("role") === "status") continue;
        sib.inert = true;
        behind.push(sib);
      }
    }
    sheet?.querySelector<HTMLElement>("button:not(.sheet__handle)")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      behind.forEach((el) => (el.inert = false));
      prev?.focus?.();
    };
  }, []);

  const style =
    phase === "drag"
      ? { transform: `translateY(${dy}px)`, transition: "none", animation: "none" }
      : phase === "settle"
        ? { transform: "translateY(0)", transition: "transform var(--spring-snappy-dur) var(--spring-snappy)", animation: "none" }
        : phase === "out"
          ? {
              transform: "translateY(120%)",
              transition: `transform ${exit.ms}ms ${exit.flung ? "linear" : "cubic-bezier(0.32, 0.72, 0, 1)"}`,
              animation: "none",
            }
          : undefined;

  return (
    <>
      <div
        className="scrim"
        onClick={close}
        style={phase === "out" ? { opacity: 0, transition: `opacity ${exit.ms}ms`, animation: "none" } : undefined}
      />
      <div className="sheet glass" role="dialog" aria-modal="true" aria-label={label} ref={ref} style={style}>
        <button
          className="sheet__handle"
          aria-label={t("close")}
          onClick={() => {
            if (!drag.current?.moved) close();
          }}
          onPointerDown={(e) => {
            drag.current = { y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const raw = e.clientY - d.y0;
            if (Math.abs(raw) > 6) d.moved = true;
            if (!d.moved) return;
            const dt = Math.max(1, e.timeStamp - d.t);
            d.v = 0.8 * d.v + 0.2 * ((e.clientY - d.y) / dt);
            d.y = e.clientY;
            d.t = e.timeStamp;
            setPhase("drag");
            // Pulling up meets resistance instead of moving freely.
            setDy(raw >= 0 ? raw : -Math.sqrt(-raw) * 3);
          }}
          onPointerUp={() => {
            const d = drag.current;
            if (!d?.moved) return;
            if (dy > 90 || d.v > 0.6) {
              // A flick keeps its speed instead of starting the exit again from rest.
              const left = (ref.current?.offsetHeight ?? 0) * 1.2 - dy;
              const flung = d.v > 0 && left / d.v < SHEET_EXIT_MS;
              leave(flung ? Math.max(120, Math.round(left / d.v)) : SHEET_EXIT_MS, flung);
            } else {
              setPhase("settle");
              setDy(0);
            }
            // The click that follows this pointerup must not close the sheet.
            setTimeout(() => {
              drag.current = null;
            }, 0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            setPhase("settle");
            setDy(0);
          }}
        >
          <span className="sheet__grip" />
        </button>
        {children(close)}
      </div>
    </>
  );
}

function InstallStep({ icon: Icon, text }: { icon: Icon; text: string }) {
  return (
    <li>
      <span className="item__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      {text}
    </li>
  );
}

function LangOptions({ onDone }: { onDone: () => void }) {
  const { t, locale } = useT();
  const opts: { id: Locale; label: string; code: string }[] = [
    { id: "en", label: "English", code: "EN" },
    { id: "mk", label: "Македонски", code: "МК" },
  ];
  return (
    <div role="radiogroup" aria-label={t("lang.title")}>
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={locale === o.id}
          className="opt"
          onClick={() => {
            setLocale(o.id);
            onDone();
          }}
        >
          <span>
            {o.label}
            <small>{o.code}</small>
          </span>
          {locale === o.id && (
            <span className="check">
              <CheckIcon size={22} weight="bold" color="var(--yellow)" aria-hidden="true" />
              <span className="sr">{t("lang.title")}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
