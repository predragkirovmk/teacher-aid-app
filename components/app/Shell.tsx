"use client";

import { BellSimpleIcon, CheckIcon, HouseSimpleIcon, ScanIcon, UserIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { NOTIFICATIONS_PAGE } from "@/lib/app/api/config";
import { invalidate } from "@/lib/app/api/query";
import { useAuth, useNotifications, useSettings } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";
import { useAsk, usePush } from "@/lib/app/push";
import { welcomeUrl } from "@/lib/app/signin";
import type { Locale } from "@/lib/app/api/types";
import { ClockOptions } from "./ClockOptions";
import { ConnectionPill } from "./ConnectionPill";
import { OutboxRunner } from "./OutboxRunner";
import { Pager } from "./Pager";
import { IosInstallSteps, PushAskSheet, PushHelpSheet } from "./PushSheets";
import { PushRunner } from "./PushRunner";
import { StudentStream } from "./StudentStream";
import { SignedElsewhere, Splash, Unreachable } from "./SessionScreens";
import { UIContext, type ConfirmOptions } from "./ui";

const NO_TABS = ["/app/scan", "/app/welcome"];
const WELCOME = "/app/welcome";
/** How long after landing on a calm screen the ask about notifications appears: the result is read first. */
const ASK_DELAY_MS = 1200;

const noop = () => () => {};

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, reason, me } = useAuth();
  const { t, locale } = useT();
  // False while the server renders and the first client render hydrates it, when the saved session is not known yet.
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  // Remember the path an overlay was opened on, so navigating closes it without an effect.
  const [langAt, setLangAt] = useState<string | null>(null);
  const [clockAt, setClockAt] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ at: string; options: ConfirmOptions } | null>(null);
  const [installState, setInstallState] = useState<{ at: string; how: "ios" | "manual"; push: boolean } | null>(null);
  const [pushHelpAt, setPushHelpAt] = useState<string | null>(null);
  const [askAt, setAskAt] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [toastOut, setToastOut] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lang = langAt === pathname;
  const clockOpen = clockAt === pathname;
  const confirmOptions = confirmState?.at === pathname ? confirmState.options : null;
  const install = installState?.at === pathname ? installState : null;
  const pushHelp = pushHelpAt === pathname;
  const askOpen = askAt === pathname;
  const push = usePush();
  const ask = useAsk(pathname);

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
      openInstall: (how: "ios" | "manual", reason?: "push") => setInstallState({ at: pathname, how, push: reason === "push" }),
      openPushHelp: () => setPushHelpAt(pathname),
      openClock: () => setClockAt(pathname),
    }),
    [toast, pathname],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // A lesson or a practice set has just finished and the student is on a calm screen: after a beat, ask once about notifications.
  const { eligible, shown } = ask;
  useEffect(() => {
    if (!eligible) return;
    const timer = setTimeout(() => {
      shown();
      setAskAt(pathname);
    }, ASK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [eligible, shown, pathname]);

  // The route guard. Every screen but the welcome screen is shown only to a signed-in student: until the
  // session is known there is the launch picture, and a signed-out student is sent to sign in (carrying
  // the screen that was asked for, a check-in link say, so signing in continues to it) without any
  // signed-in screen being drawn first. Signing out by choice carries nothing: the next student starts at Home.
  const onWelcome = pathname === WELCOME;
  const view = onWelcome
    ? "screen"
    : !hydrated || status === "loading"
      ? "splash"
      : status === "signedIn"
        ? "screen"
        : status === "error"
          ? "unreachable"
          : reason === "signed_in_elsewhere"
            ? "elsewhere"
            : "redirect";
  useEffect(() => {
    if (view === "redirect") router.replace(reason === "signed_out" ? welcomeUrl() : welcomeUrl(pathname));
  }, [view, reason, pathname, router]);

  // A page the browser brings back from its cache (Back after signing out) is as old as when it was left.
  useEffect(() => {
    const show = (e: PageTransitionEvent) => e.persisted && invalidate("me");
    window.addEventListener("pageshow", show);
    return () => window.removeEventListener("pageshow", show);
  }, []);

  // One set at a time is a screen of its own, like the quiz; the list of sets is an ordinary screen.
  const inPractice = pathname.startsWith("/app/practice/");
  const showTabs = view === "screen" && !NO_TABS.includes(pathname) && !pathname.startsWith("/app/checkin") && !pathname.startsWith("/app/play") && !inPractice;
  const content =
    view === "screen" ? (
      children
    ) : view === "elsewhere" ? (
      <SignedElsewhere onSignIn={() => router.replace(welcomeUrl(pathname))} />
    ) : view === "unreachable" ? (
      <Unreachable error={me.error} onRetry={me.refetch} />
    ) : (
      <Splash />
    );

  // The quiz draws the connection itself, as a strip in its own layout.
  const inQuiz = view === "screen" && (pathname.startsWith("/app/play") || pathname.startsWith("/app/checkin") || inPractice);

  return (
    <UIContext.Provider value={ui}>
      <OutboxRunner meId={status === "signedIn" ? me.data?.id : undefined} />
      <StudentStream meId={status === "signedIn" ? me.data?.id : undefined} />
      <PushRunner student={status === "signedIn" && me.data ? { id: me.data.id, notificationsOn: me.data.settings.notificationsOn } : undefined} />
      <div className="stage">
        <div className="phone">
          <Pager pathname={pathname}>{content}</Pager>
          {!inQuiz && <ConnectionPill variant="float" />}
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
          {install && (
            <Sheet label={t("install.title")} onClose={() => setInstallState(null)}>
              {(close) => (
                <>
                  <p className="sheet__title">{t("install.title")}</p>
                  {install.how === "ios" ? <IosInstallSteps /> : <p className="t-body steps__note">{t("install.other")}</p>}
                  {install.push && <p className="t-body steps__note">{t("install.pushNote")}</p>}
                  <button className="btn btn--primary btn--block" onClick={close}>
                    {t("install.ok")}
                  </button>
                </>
              )}
            </Sheet>
          )}
          {pushHelp && (
            <Sheet label={t("push.help.title")} onClose={() => setPushHelpAt(null)}>
              {(close) => <PushHelpSheet close={close} />}
            </Sheet>
          )}
          {askOpen && (
            <Sheet label={t("push.ask.title")} onClose={() => setAskAt(null)}>
              {(close) => <PushAskSheet kind={ask.kind} close={close} turnOn={push.turnOn} />}
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
  const feed = useNotifications().data;
  const count = (feed ?? []).filter((n) => n.readAt === null).length;
  // A feed of a full page that is all unread may have more behind it: say "30+" rather than a number that is too low.
  const label = count >= NOTIFICATIONS_PAGE ? `${NOTIFICATIONS_PAGE}+` : count;
  // Keep the last non-zero count so the badge can shrink away showing it, instead of vanishing.
  const [lastCount, setLastCount] = useState(label);
  if (count > 0 && label !== lastCount) setLastCount(label);
  // A new alert while the app is open is said out loud once, politely. The first load is not news.
  const [seen, setSeen] = useState<number | null>(feed === undefined ? null : count);
  const [arrived, setArrived] = useState("");
  if (feed !== undefined && seen !== count) {
    setSeen(count);
    if (seen !== null && count > seen) setArrived(t("notif.arrived", { n: label }));
  }

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
          {badge > 0 && <span className="sr">{t("notif.unreadCount", { n: label })}</span>}
        </>
      )}
    </Link>
  );

  const index = pathname === "/app" ? 0 : pathname.startsWith("/app/notifications") ? 1 : pathname === "/app/profile" ? 2 : -1;

  return (
    <div className="dock">
      <span className="sr" role="status">
        {arrived}
      </span>
      <nav className="tabbar glass" aria-label={t("nav.main")}>
        <span
          className="tab-ind"
          aria-hidden="true"
          style={{ transform: `translateX(${Math.max(index, 0) * 100}%)`, opacity: index < 0 ? 0 : 1 }}
        />
        {tab("/app", t("nav.home"), HouseSimpleIcon, pathname === "/app")}
        {tab("/app/notifications", t("nav.alerts"), BellSimpleIcon, pathname.startsWith("/app/notifications"), count)}
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
    // A sheet that is about typing says where focus goes (data-autofocus); otherwise its first button.
    (sheet?.querySelector<HTMLElement>("[data-autofocus]") ?? sheet?.querySelector<HTMLElement>("button:not(.sheet__handle)"))?.focus();
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

function LangOptions({ onDone }: { onDone: () => void }) {
  const { t, locale } = useT();
  const { setLocale } = useSettings();
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
