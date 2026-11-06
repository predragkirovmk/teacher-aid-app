import type { PushPlatform, PushRegistration } from "../api/types";
import { detectSupport, platformOf, type Permission, type PushEnv, type PushSupport } from "./support";

/**
 * Turning web push on and off, and keeping this phone's subscription and the API's in step. The browser, the API and
 * the phone's memory are handed in (`PushIO`), so the rules run unchanged in the app and in a unit test.
 *
 * The rules, in the order they matter:
 *  - Nothing here asks for the browser's permission unless a student has just chosen to turn notifications on.
 *  - A subscription is made only for a student who turned them on on this phone (`optIn`): a permission that was given
 *    by someone else, or for another student, is not consent.
 *  - A student who is gone (signed out, signed in elsewhere, session over) leaves nothing behind: the subscription is
 *    cancelled with the push service, so a push for them has nowhere to go on a phone the next student holds.
 */

export type SubscriptionLike = {
  endpoint: string;
  toJSON(): { endpoint?: string; expirationTime?: number | null; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
};

export type PushManagerLike = {
  getSubscription(): Promise<SubscriptionLike | null>;
  subscribe(options: { userVisibleOnly: boolean; applicationServerKey: BufferSource }): Promise<SubscriptionLike>;
};

export type PushIO = {
  env(): PushEnv;
  permission(): Permission;
  requestPermission(): Promise<Permission>;
  /** The worker's registration (its push manager), or null when there is none to be had. */
  manager(): Promise<PushManagerLike | null>;
  /**
   * The server's VAPID public key, as the browser wants it, or null. With none (the demo) there is nothing to subscribe
   * to: the permission is real, the subscription is not.
   */
  applicationServerKey(): Uint8Array | null;
  api: {
    setPushToken(registration: PushRegistration): Promise<void>;
    removePushToken(): Promise<void>;
    setNotificationsOn(on: boolean): Promise<void>;
  };
  /** What the phone remembers (localStorage). */
  memory: {
    /** The student who turned notifications on, on this phone. */
    optIn(): string | null;
    setOptIn(studentId: string | null): void;
    /** The subscription the API holds for this phone: its endpoint, and whose it is. */
    registered(): { studentId: string; endpoint: string } | null;
    setRegistered(value: { studentId: string; endpoint: string } | null): void;
  };
};

export type TurnOnResult =
  | { result: "on" }
  /** The browser's permission is "denied": the student has to change it in the browser's own settings. */
  | { result: "denied" }
  /** The browser's prompt was closed without an answer. Nothing changed. */
  | { result: "dismissed" }
  | { result: "unsupported" | "needs-install" }
  | { result: "failed"; error: unknown };

/** The VAPID key in the form the Push API takes: the bytes of a URL-safe base64 string. */
export function urlBase64ToBytes(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The subscription as the API takes it (PROPOSED, spec 11.3). Null for a subscription with no keys, which cannot be pushed to. */
export function registrationOf(sub: SubscriptionLike, platform: PushPlatform): PushRegistration | null {
  const json = sub.toJSON();
  const { p256dh, auth } = json.keys ?? {};
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh, auth }, platform };
}

export function createPushFlow(io: PushIO) {
  const support = (): PushSupport => detectSupport(io.env());

  /** The phone's subscription, made if it has none. Null where there is no push server to subscribe to (the demo). */
  async function subscription(make: boolean): Promise<SubscriptionLike | null> {
    const key = io.applicationServerKey();
    if (!key) return null;
    const manager = await io.manager();
    if (!manager) throw new Error("no push manager");
    const existing = await manager.getSubscription();
    if (existing || !make) return existing;
    return manager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  }

  /** Tell the API about the subscription, unless it already has this one. */
  async function register(studentId: string, sub: SubscriptionLike) {
    const known = io.memory.registered();
    if (known && known.studentId === studentId && known.endpoint === sub.endpoint) return;
    const registration = registrationOf(sub, platformOf(io.env()));
    if (!registration) throw new Error("the subscription has no keys");
    await io.api.setPushToken(registration);
    io.memory.setRegistered({ studentId, endpoint: sub.endpoint });
  }

  /**
   * Give up this phone's subscription. `server`: also ask the API to forget it (not possible once the session is gone, and the
   * API forgets it itself when a session ends). Never throws: letting go is something a sign-out must not wait for.
   */
  async function letGo(studentId: string | null, server: boolean): Promise<void> {
    try {
      const manager = io.applicationServerKey() ? await io.manager() : null;
      const sub = await manager?.getSubscription();
      if (server && studentId && (sub || io.memory.registered())) await io.api.removePushToken().catch(() => {});
      await sub?.unsubscribe().catch(() => {});
    } catch {
      // nothing to let go of
    }
    io.memory.setRegistered(null);
  }

  return {
    support,
    letGo,

    /**
     * The student chose to turn notifications on (the switch, or the ask after a lesson). Asks the browser if it has not been
     * asked, subscribes, tells the API the subscription and then that the switch is on. A failure leaves the switch off.
     */
    async turnOn(studentId: string): Promise<TurnOnResult> {
      const s = support();
      if (s !== "ok") return { result: s };
      let permission = io.permission();
      if (permission === "denied") return { result: "denied" };
      if (permission === "default") {
        permission = await io.requestPermission();
        if (permission === "denied") return { result: "denied" };
        if (permission !== "granted") return { result: "dismissed" };
      }
      try {
        // The setting first: if the subscription fails after it, the next time the app opens it tries again.
        await io.api.setNotificationsOn(true);
        io.memory.setOptIn(studentId);
        const sub = await subscription(true);
        if (sub) await register(studentId, sub);
        return { result: "on" };
      } catch (error) {
        return { result: "failed", error };
      }
    },

    /** The student turned the switch off: the setting is saved first (and is what fails if there is no signal), then this phone lets go. */
    async turnOff(studentId: string): Promise<void> {
      await io.api.setNotificationsOn(false);
      io.memory.setOptIn(null);
      await letGo(studentId, true);
    },

    /**
     * The app opened for a signed-in student: bring this phone and the API into step without asking anyone anything. A student
     * who turned notifications on here, and still has them on, gets a subscription made again if the browser lost it and the API
     * told of a changed one. A student who turned them off elsewhere, or never turned them on here, has nothing kept for them.
     */
    async resync(student: { id: string; notificationsOn: boolean }): Promise<void> {
      if (support() !== "ok") return;
      const optedIn = io.memory.optIn() === student.id;
      try {
        if (!optedIn || !student.notificationsOn) {
          // A subscription that is here but is nobody's wish: another student's leftover, or one the student switched off.
          await letGo(student.id, optedIn);
          return;
        }
        if (io.permission() !== "granted") return;
        const sub = await subscription(true);
        if (sub) await register(student.id, sub);
      } catch {
        // offline or refused: the next time the app opens tries again
      }
    },
  };
}

export type PushFlow = ReturnType<typeof createPushFlow>;
