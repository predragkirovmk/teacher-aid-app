"use client";

import { Bell, Check, House, QrCode, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNotifs } from "@/lib/app/derived";
import { useT } from "@/lib/app/i18n";
import { actions, useApp } from "@/lib/app/store";
import type { Locale } from "@/lib/app/data";
import { Pager } from "./Pager";
import { UIContext, type ConfirmOptions } from "./ui";

const NO_TABS = ["/app/scan", "/app/welcome"];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { signedIn, locale } = useApp();
  const { t } = useT();
  // Remember the path an overlay was opened on, so navigating closes it without an effect.
  const [langAt, setLangAt] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ at: string; options: ConfirmOptions } | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOut, setToastOut] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lang = langAt === pathname;
  const confirmOptions = confirmState?.at === pathname ? confirmState.options : null;

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

  const showTabs = !gated && !NO_TABS.includes(pathname) && !pathname.startsWith("/app/checkin");

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
          {toastMsg && (
            <button className={`toast glass${toastOut ? " toast--out" : ""}`} role="status" onClick={dismissToast}>
              {toastMsg}
            </button>
          )}
        </div>
      </div>
    </UIContext.Provider>
  );
}

function Dock({ pathname }: { pathname: string }) {
  const { t } = useT();
  const unread = useNotifs().filter((n) => n.unread).length;
  // Keep the last non-zero count so the badge can shrink away showing it, instead of vanishing.
  const [lastCount, setLastCount] = useState(unread);
  if (unread > 0 && unread !== lastCount) setLastCount(unread);

  const tab = (href: string, label: string, Icon: LucideIcon, active: boolean, badge?: number) => (
    // Switching tabs replaces the history entry, so Back leaves the section instead of replaying tabs.
    <Link href={href} replace className="tab" aria-current={active ? "page" : undefined}>
      <Icon size={24} strokeWidth={2} aria-hidden="true" />
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
      <nav className="tabbar glass" aria-label="Main">
        <span
          className="tab-ind"
          aria-hidden="true"
          style={{ transform: `translateX(${Math.max(index, 0) * 100}%)`, opacity: index < 0 ? 0 : 1 }}
        />
        {tab("/app", t("nav.home"), House, pathname === "/app")}
        {tab("/app/notifications", t("nav.alerts"), Bell, pathname.startsWith("/app/notifications"), unread)}
        {tab("/app/profile", t("nav.profile"), User, pathname === "/app/profile")}
      </nav>
      {/* The scan is an action, not a section, so it sits beside the tab bar instead of in it. */}
      <Link href="/app/scan" className="scan-fab" aria-label={t("nav.scan")}>
        <QrCode size={32} strokeWidth={2} aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * A bottom sheet with a draggable grabber. It follows the finger, resists a pull upwards, and on
 * release either flies off (far enough, or fast enough) or springs back. Tapping the grabber,
 * the scrim or Escape closes it with the same exit.
 */
function Sheet({
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

  const close = useCallback(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) return onClose();
    setPhase("out");
    setTimeout(onClose, 230);
  }, [onClose]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button:not(.sheet__handle)")?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [close]);

  const style =
    phase === "drag"
      ? { transform: `translateY(${dy}px)`, transition: "none", animation: "none" }
      : phase === "settle"
        ? { transform: "translateY(0)", transition: "transform 420ms cubic-bezier(0.34, 1.45, 0.64, 1)", animation: "none" }
        : phase === "out"
          ? { transform: "translateY(120%)", transition: "transform 230ms cubic-bezier(0.4, 0, 1, 1)", animation: "none" }
          : undefined;

  return (
    <>
      <div
        className="scrim"
        onClick={close}
        style={phase === "out" ? { opacity: 0, transition: "opacity 230ms", animation: "none" } : undefined}
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
            if (dy > 90 || d.v > 0.6) close();
            else {
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
            actions.setLocale(o.id);
            onDone();
          }}
        >
          <span>
            {o.label}
            <small>{o.code}</small>
          </span>
          {locale === o.id && (
            <span className="check">
              <Check size={22} strokeWidth={2.5} color="var(--yellow)" aria-hidden="true" />
              <span className="sr">{t("lang.title")}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
