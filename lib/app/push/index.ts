"use client";

import { useCallback, useSyncExternalStore } from "react";
import { client, demoOnly } from "../api";
import { onBeforeSignOut, saveNotificationsOn, useMe } from "../api/hooks";
import { onSessionEnd } from "../api/session";
import type { Locale } from "../api/types";
import type { TFn } from "../i18n";
import { asked, calmScreen, NEVER_ASKED, readHistory, shouldAsk, type AskHistory, type Moment } from "./ask";
import { createPushFlow, urlBase64ToBytes, type PushIO, type TurnOnResult } from "./flow";
import { detectSupport, pushStatus, readEnv, type Permission, type PushStatus, type PushSupport } from "./support";
import { testPayload } from "./test-notification";

/**
 * The student app's web push, as the screens see it: what the switch in Settings shows (`usePush`), the soft ask after a
 * moment worth telling the student about (`useAsk`), and the demo's local test notification. The rules are in flow.ts, the
 * policy of when to ask in ask.ts and the worker's side in public/app-push.js and app-sw.js.
 */

/** The server's VAPID public key (URL-safe base64), set at build time. A live build without one cannot push; the demo needs none. */
const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const OPT_IN = "teacheraid-push-optin";
// Under the `teacheraid-shown-` prefix, so a different student on this phone never inherits them (forgetStudent in hooks.ts).
const REGISTERED = "teacheraid-shown-push-registered";
const ASK = "teacheraid-shown-push-ask";
const MOMENT = "teacheraid-push-moment";

const read = (key: string, area: "local" | "session" = "local") => {
  try {
    return (area === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null, area: "local" | "session" = "local") => {
  try {
    const store = area === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // blocked storage: the phone forgets, and the next time the app opens it asks the API again
  }
};

/** How long the worker may take to be ready before push is given up on for now. */
const READY_MS = 5000;

const io: PushIO = {
  env: readEnv,
  permission: () => ("Notification" in window ? Notification.permission : "denied"),
  requestPermission: () => Notification.requestPermission(),
  manager: async () => {
    if (!("serviceWorker" in navigator)) return null;
    const ready = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((resolve) => setTimeout(resolve, READY_MS, null))]);
    return ready ? ready.pushManager : null;
  },
  applicationServerKey: () => (VAPID ? urlBase64ToBytes(VAPID) : null),
  api: {
    setPushToken: (r) => client.setPushToken(r),
    removePushToken: () => client.removePushToken(),
    setNotificationsOn: saveNotificationsOn,
  },
  memory: {
    optIn: () => read(OPT_IN),
    setOptIn: (id) => write(OPT_IN, id),
    registered: () => {
      try {
        const v = JSON.parse(read(REGISTERED) ?? "null") as { studentId?: unknown; endpoint?: unknown } | null;
        return v && typeof v.studentId === "string" && typeof v.endpoint === "string" ? { studentId: v.studentId, endpoint: v.endpoint } : null;
      } catch {
        return null;
      }
    },
    setRegistered: (v) => write(REGISTERED, v && JSON.stringify(v)),
  },
};

export const flow = createPushFlow(io);

// A student who leaves for any reason leaves no subscription behind. When they sign out by choice the API is told first (it needs
// their session); when the session just ends, the API drops the subscription itself and only the phone's is cancelled.
onBeforeSignOut(() => Promise.race([flow.letGo(io.memory.optIn(), true), new Promise<void>((resolve) => setTimeout(resolve, 4000))]));
onSessionEnd(() => void flow.letGo(null, false).then(refresh));

// ---- What this phone says now ------------------------------------------------------------------------------------

type Snapshot = {
  /** False until the browser has been read: the server render and the render that hydrates it. */
  ready: boolean;
  support: PushSupport;
  permission: Permission;
  /** The endpoint of the subscription this phone holds, when it holds one and the API has been told (demo: any, once permitted). */
  endpoint: string | null;
  busy: boolean;
};

const SERVER: Snapshot = { ready: false, support: "unsupported", permission: "default", endpoint: null, busy: false };
let snapshot: Snapshot = SERVER;
const listeners = new Set<() => void>();
let watching = false;

function set(next: Partial<Snapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.ready === snapshot.ready && merged.support === snapshot.support && merged.permission === snapshot.permission && merged.endpoint === snapshot.endpoint && merged.busy === snapshot.busy) return;
  snapshot = merged;
  listeners.forEach((l) => l());
}

/** Read the browser again: the permission may have changed in its own settings, the subscription in the worker. */
export async function refresh() {
  const support = detectSupport(readEnv());
  const permission = io.permission();
  let endpoint: string | null = null;
  if (support === "ok" && permission === "granted") {
    try {
      endpoint = VAPID ? ((await (await io.manager())?.getSubscription())?.endpoint ?? null) : "demo";
    } catch {
      endpoint = null;
    }
  }
  set({ ready: true, support, permission, endpoint });
}

function watch() {
  if (watching) return;
  watching = true;
  const again = () => void refresh();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && again());
  window.addEventListener("focus", again);
  // Changing the permission in the browser's own settings while the app is open.
  navigator.permissions?.query({ name: "notifications" }).then((s) => (s.onchange = again), () => {});
  again();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  watch();
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER;

/** The state of the notifications switch, and the two things it can do. `checking` is the moment before the browser has been read. */
export function usePush() {
  const me = useMe().data;
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const notificationsOn = me?.settings.notificationsOn ?? false;
  const registered = me ? io.memory.registered() : null;
  // The demo has no push server, so a granted permission is the whole of it; a live phone is on once the API has its subscription.
  const subscribed = demoOnly ? snap.permission === "granted" : snap.endpoint !== null && !!registered && registered.studentId === me?.id && registered.endpoint === snap.endpoint;
  const status: PushStatus | "checking" = !snap.ready
    ? "checking"
    : pushStatus({ support: snap.support, permission: snap.permission, notificationsOn, subscribed });

  const turnOn = useCallback(async (): Promise<TurnOnResult> => {
    if (!me) return { result: "failed", error: new Error("not signed in") };
    set({ busy: true });
    try {
      return await flow.turnOn(me.id);
    } finally {
      set({ busy: false });
      await refresh();
    }
  }, [me]);

  const turnOff = useCallback(async () => {
    if (!me) return;
    set({ busy: true });
    try {
      await flow.turnOff(me.id);
    } finally {
      set({ busy: false });
      await refresh();
    }
  }, [me]);

  return { status, permission: snap.permission, support: snap.support, busy: snap.busy, turnOn, turnOff };
}

// ---- The ask -------------------------------------------------------------------------------------------------------

/** Something worth telling the student about has just happened (a lesson ended, a practice set was finished): an ask may follow on a calm screen. */
export function noteMoment(moment: Moment) {
  write(MOMENT, moment, "session");
  momentListeners.forEach((l) => l());
}

const momentListeners = new Set<() => void>();
const subscribeMoment = (cb: () => void) => {
  momentListeners.add(cb);
  return () => {
    momentListeners.delete(cb);
  };
};

export const askHistory = (): AskHistory => readHistory(read(ASK));

/** The ask is on screen: count it and use the moment up. Counted when shown, so closing it or ignoring it both count. */
function markAsked() {
  write(ASK, JSON.stringify(asked(askHistory(), Date.now())));
  write(MOMENT, null, "session");
  momentListeners.forEach((l) => l());
}

/**
 * Whether to ask now: a moment is waiting, the student is on a calm screen, and the policy (ask.ts) allows it.
 */
export function useAsk(pathname: string) {
  const { status, permission } = usePush();
  // Read as one snapshot, a boolean, so the clock is only looked at when React asks and never while rendering.
  const eligible = useSyncExternalStore(
    subscribeMoment,
    () => read(MOMENT, "session") !== null && status !== "checking" && calmScreen(pathname) && shouldAsk({ status, permission, history: askHistory(), now: Date.now() }),
    () => false,
  );
  return {
    eligible,
    /** What the sheet is about: turning notifications on, or adding the app to the Home Screen first (iPhone). */
    kind: status === "needs-install" ? ("install" as const) : ("turn-on" as const),
    shown: markAsked,
  };
}

// ---- The demo's test notification ------------------------------------------------------------------------------------

export type TestResult = "sent" | "denied" | "dismissed" | "unsupported" | "needs-install";

/**
 * Show a notification through the worker, as a push would, after a few seconds: for the demo, which has no push server.
 * Asks for the browser's permission first if the student has not been asked; they pressed the button, so this is not cold.
 * Tapping it opens the practice set the demo starts with, through the same path as a real push.
 */
export async function sendTestNotification(t: TFn, locale: Locale): Promise<TestResult> {
  const support = detectSupport(readEnv());
  if (support !== "ok") return support;
  let permission = io.permission();
  if (permission === "default") permission = await io.requestPermission();
  await refresh();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active ?? navigator.serviceWorker.controller;
  if (!worker) return "unsupported";
  worker.postMessage({ type: "show-notification", payload: testPayload(t, locale), delayMs: 5000 });
  return "sent";
}

export { NEVER_ASKED };
