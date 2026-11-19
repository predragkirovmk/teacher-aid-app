"use client";

import { CheckIcon, HouseSimpleIcon, QrCodeIcon, UserIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, ViewTransition, type ReactNode } from "react";
import { invalidate } from "@/lib/app/api/query";
import { NOTIFICATIONS_PAGE } from "@/lib/app/api/config";
import { useAuth, useNotifications, useSettings } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";
import { useAsk, usePush } from "@/lib/app/push";
import { SPRINGS, throwTo } from "@/lib/app/motion";
import { isOpenPath, needsNotice, noticeWaits, noticeWasUpdated } from "@/lib/app/privacy";
import { BACK, goBack } from "@/lib/app/nav";
import { welcomeUrl } from "@/lib/app/signin";
import type { Locale } from "@/lib/app/api/types";
import { ClockOptions } from "./ClockOptions";
import { ConnectionPill } from "./ConnectionPill";
import { NoticeScreen } from "./NoticeScreen";
import { OutboxRunner } from "./OutboxRunner";
import { Pager } from "./Pager";
import { SegGlide } from "./SegGlide";
import { IosInstallSteps, PushAskSheet, PushHelpSheet } from "./PushSheets";
import { PushRunner } from "./PushRunner";
import { StudentStream } from "./StudentStream";
import { SignedElsewhere, Splash, Unreachable } from "./SessionScreens";
import { UIContext, type ConfirmOptions } from "./ui";

const NO_TABS = ["/app/scan", "/app/welcome"];
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
      back: () => (window.history.length > 1 ? goBack(router) : router.push("/app", BACK)),
    }),
    [toast, pathname, router],
  );

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // The tab tap that is going somewhere, as the two screens it joins. It holds through the swap, so the old screen's exit and the new
  // screen's enter both see it (a flag cleared when the path changes would be gone for the enter), and it is forgotten as soon as the
  // student is on any screen it does not join or taps anything outside the tab bar (a row on the screen it arrived at must not count as a tab tap). See ENTER_TAB.
  const [tap, setTap] = useState<{ from: string; to: string } | null>(null);
  if (tap && pathname !== tap.from && pathname !== tap.to) setTap(null);
  const tabTap = tap !== null;

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

  // The route guard. Every screen but the welcome screen, the privacy notice and the terms is shown only to a signed-in
  // student: until the session is known there is the launch picture, and a signed-out student is sent to sign in (carrying
  // the screen that was asked for, a check-in link say, so signing in continues to it) without any signed-in screen being
  // drawn first. Signing out by choice carries nothing: the next student starts at Home. A signed-in student who has not seen
  // this version of the privacy notice (a first sign-in, or the notice changed) sees it before anything else, except in the
  // middle of a lesson or a practice set, which it waits for; the check-in link comes after it, so no attendance is
  // recorded before the student has been told.
  const onOpen = isOpenPath(pathname);
  const view = onOpen
    ? "screen"
    : !hydrated || status === "loading"
      ? "splash"
      : status === "signedIn"
        ? me.data && needsNotice(me.data) && !noticeWaits(pathname)
          ? "notice"
          : "screen"
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
  // The notice and the terms can be read without signing in; the tab bar is only for a student who is.
  const showTabs = view === "screen" && !NO_TABS.includes(pathname) && !(onOpen && status !== "signedIn") && !pathname.startsWith("/app/checkin") && !pathname.startsWith("/app/play") && !inPractice;
  const content =
    view === "screen" ? (
      children
    ) : view === "notice" && me.data ? (
      <NoticeScreen updated={noticeWasUpdated(me.data)} />
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
      <div className="stage" onClickCapture={(e) => tap && !(e.target as Element).closest(".tabbar") && setTap(null)}>
        <div className="phone">
          <Pager pathname={pathname}>
            {/* Keyed by the route so the screen enters and exits (the layout itself never remounts). Only typed navigations animate; the pager's swipe and redirects carry no type. */}
            <ViewTransition key={pathname} enter={tabTap ? ENTER_TAB : ENTER} exit={tabTap ? EXIT_TAB : EXIT} default="none">
              {content}
            </ViewTransition>
          </Pager>
          {!inQuiz && <ConnectionPill variant="float" />}
          {showTabs && (
            <>
              <div className="edge" aria-hidden="true" />
              <Dock pathname={pathname} onTabTap={(href) => setTap(href === pathname ? null : { from: pathname, to: href })} />
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
            // A sheet that was left behind by a screen it belonged to must not close the next question that opens (its exit timer outlives it).
            <Sheet label={confirmOptions.title} onClose={() => setConfirmState((s) => (s === confirmState ? null : s))}>
              {(close) => (
                <>
                  <p className="sheet__title">{confirmOptions.title}</p>
                  {confirmOptions.body && <p className="t-body steps__note">{confirmOptions.body}</p>}
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
          {/* Not behind the privacy notice: nothing of the student's is read before it has been answered. */}
          {status === "signedIn" && view === "screen" && <AlertAnnouncer />}
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

/** Says out loud, once and politely, that a new alert arrived, on whichever screen the student is on. */
function AlertAnnouncer() {
  const { t } = useT();
  const feed = useNotifications().data;
  const count = (feed ?? []).filter((n) => n.readAt === null).length;
  const shownCount = count >= NOTIFICATIONS_PAGE ? `${NOTIFICATIONS_PAGE}+` : count;
  // The first load is not news.
  const [seen, setSeen] = useState<number | null>(feed === undefined ? null : count);
  const [arrived, setArrived] = useState("");
  if (feed !== undefined && seen !== count) {
    setSeen(count);
    if (seen !== null && count > seen) setArrived(t("notif.arrived", { n: shownCount }));
  }
  // Always present: a live region that appears together with its text is often not read.
  return (
    <span className="sr" role="status">
      {arrived}
    </span>
  );
}

/** Each navigation type picks its CSS classes in app.css; `lift` marks the screen that travels on top (the new one going deeper, the old one going back). Anything untyped does nothing. */
const ENTER = { "nav-forward": "nav-forward lift", "nav-back": "nav-back", tab: "tab", swipe: "none", default: "none" };
const EXIT = { "nav-forward": "nav-forward", "nav-back": "nav-back lift", tab: "tab", swipe: "none", default: "none" };
/** While a tap on a tab is on its way the screens crossfade whatever type React hands the transition. React can lose the `tab` the Link added (the router finishes the navigation in a transition of its own, and under load the commit has been seen to arrive untyped), and an untyped swap would show no crossfade at all. */
const ENTER_TAB = { ...ENTER, default: "tab" };
const EXIT_TAB = { ...EXIT, default: "tab" };

function Dock({ pathname, onTabTap }: { pathname: string; onTabTap: (href: string) => void }) {
  const { t } = useT();

  // The tab tapped moves the piece and fills its glyph at once, before its screen has loaded; aria-current stays with the
  // screen actually shown. A tap is forgotten as soon as the screen changes: kept, it would win again on a later return to
  // the screen it was made on (a swipe back), and send the piece to the old tab.
  const [tapped, setTapped] = useState<{ href: string; from: string } | null>(null);
  if (tapped && tapped.from !== pathname) setTapped(null);
  const shown = pathname === "/app" ? "/app" : pathname === "/app/profile" ? "/app/profile" : "";
  const chosen = tapped?.from === pathname ? tapped.href : shown;

  const tab = (href: string, label: string, Icon: Icon) => (
    // Switching tabs replaces the history entry, so Back leaves the section instead of replaying tabs.
    <Link
      href={href}
      replace
      transitionTypes={["tab"]}
      className="tab"
      aria-current={shown === href ? "page" : undefined}
      data-checked={chosen === href}
      onClick={() => {
        setTapped({ href, from: pathname });
        onTabTap(href);
      }}
    >
      {/* The selected tab shows the filled glyph, as a tab bar does on iOS. */}
      <Icon size={24} weight={chosen === href ? "fill" : "regular"} aria-hidden="true" />
      {label}
    </Link>
  );

  return (
    <nav className="dock" aria-label={t("nav.main")}>
      {/* Two sections with the scan between them, a call to action rather than a section. The one piece under the
          current tab is SegGlide's, and it slides over the scan from one section to the other. */}
      <div className="tabbar glass">
        <SegGlide at={chosen} />
        {tab("/app", t("nav.home"), HouseSimpleIcon)}
        {/* The halo sits outside the face, which clips the shine; the press scales the whole link. */}
        <Link href="/app/scan" className="scan-pill" transitionTypes={["nav-forward"]}>
          <span className="scan-pill__halo" aria-hidden="true" />
          <span className="scan-pill__face">
            <QrCodeIcon className="scan-pill__glyph" size={22} weight="bold" aria-hidden="true" />
            {t("nav.scanJoin")}
          </span>
        </Link>
        {tab("/app/profile", t("nav.profile"), UserIcon)}
      </div>
    </nav>
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
  const drag = useRef<{ y0: number; y: number; t: number; v: number; moved: boolean; base: number } | null>(null);
  /** The spring back to rest, while it runs: a new touch catches the sheet where it is. */
  const settling = useRef<Animation | null>(null);
  const [dy, setDy] = useState(0);
  const [phase, setPhase] = useState<"in" | "drag" | "settle" | "out">("in");
  /** How the sheet leaves: on the drawer curve, or at the speed of the flick that threw it. */
  const [exit, setExit] = useState({ ms: SHEET_EXIT_MS, flung: false });

  const leave = useCallback(
    (ms: number, flung: boolean) => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (calm) return onClose();
      // Closed while it is still rising: freeze it where it is, so the exit starts from there. Dropping the rise (animation: none,
      // below) with nothing held would snap the sheet to its resting place, or past it, before it leaves.
      // (Found by its role, not through `ref`: this callback is handed to render, where a ref may not be read.)
      const el = document.querySelector<HTMLElement>('.sheet[role="dialog"]');
      if (el) {
        for (const a of el.getAnimations()) {
          a.commitStyles();
          a.cancel();
        }
        void el.offsetHeight;
      }
      setExit({ ms, flung });
      setPhase("out");
      setTimeout(onClose, ms);
    },
    [onClose],
  );
  const close = useCallback(() => leave(SHEET_EXIT_MS, false), [leave]);

  /** The sheet springs back to rest carrying the finger's speed (px per ms, down is positive); Reduce Motion puts it back at once. */
  const springBack = (v: number) => {
    const el = ref.current;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el && !calm && Math.abs(dy) >= 1) {
      const { animation } = throwTo(el, "y", dy, 0, v, SPRINGS.snappy);
      settling.current = animation;
      animation.onfinish = () => {
        if (settling.current === animation) settling.current = null;
      };
    }
    setPhase("settle");
    setDy(0);
  };

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
      settling.current?.cancel();
    };
  }, []);

  const style =
    phase === "drag"
      ? { transform: `translateY(${dy}px)`, transition: "none", animation: "none" }
      : phase === "settle"
        ? { transform: "translateY(0)", transition: "none", animation: "none" }
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
            // A sheet still springing back is caught where it is, and the finger carries on from there.
            let base = 0;
            const el = ref.current;
            if (settling.current && el) {
              base = new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
              settling.current.cancel();
              settling.current = null;
              setDy(base);
              setPhase("drag");
            }
            drag.current = { y0: e.clientY, y: e.clientY, t: e.timeStamp, v: 0, moved: false, base };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const raw = e.clientY - d.y0;
            if (Math.abs(raw) > 6) d.moved = true;
            const at = d.base + raw;
            if (!d.moved) return;
            const dt = Math.max(1, e.timeStamp - d.t);
            d.v = 0.8 * d.v + 0.2 * ((e.clientY - d.y) / dt);
            d.y = e.clientY;
            d.t = e.timeStamp;
            setPhase("drag");
            // Pulling up meets resistance instead of moving freely.
            setDy(at >= 0 ? at : -Math.sqrt(-at) * 3);
          }}
          onPointerUp={(e) => {
            const d = drag.current;
            if (!d) return;
            if (!d.moved) {
              // A touch that caught a settling sheet but did not drag lets it go again.
              if (d.base) springBack(0);
              return;
            }
            // A finger that stopped before it lifted leaves with no speed.
            const v = e.timeStamp - d.t > 100 ? 0 : d.v;
            if (dy > 90 || v > 0.6) {
              // A flick keeps its speed instead of starting the exit again from rest.
              const left = (ref.current?.offsetHeight ?? 0) * 1.2 - dy;
              const flung = v > 0 && left / v < SHEET_EXIT_MS;
              leave(flung ? Math.max(120, Math.round(left / v)) : SHEET_EXIT_MS, flung);
            } else {
              springBack(v);
            }
            // The click that follows this pointerup must not close the sheet.
            setTimeout(() => {
              drag.current = null;
            }, 0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            springBack(0);
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
