import type { PushPlatform } from "../api/types";

/**
 * What this phone can do about web push, and what the switch in Settings should therefore say. Pure: the browser is read
 * in one place (`readEnv`) and everything else is a function of what it returned, so every platform can be tested.
 */

export type PushEnv = {
  ua: string;
  touchPoints: number;
  /** Running from the Home Screen (an installed app), not in a browser tab. */
  standalone: boolean;
  secure: boolean;
  serviceWorker: boolean;
  pushManager: boolean;
  notification: boolean;
  /** The offline worker, which push needs, is only registered by a production build. */
  production: boolean;
};

/** `ok`: can ask. `needs-install`: an iPhone or iPad that is not running from the Home Screen yet. `unsupported`: no push here at all. */
export type PushSupport = "ok" | "needs-install" | "unsupported";

export type Permission = NotificationPermission;

/** The switch in Settings: what it shows, and what a tap on it does. */
export type PushStatus = "unsupported" | "needs-install" | "blocked" | "off" | "on";

/** The first iOS and iPadOS version with web push, and only for an app on the Home Screen. */
const IOS_PUSH: readonly [number, number] = [16, 4];

export const isApple = (env: Pick<PushEnv, "ua" | "touchPoints">) =>
  /iPhone|iPad|iPod/.test(env.ua) || (/Macintosh/.test(env.ua) && env.touchPoints > 1);

/** The iOS version in a user agent as [major, minor]; null when it does not say (an iPad asking for the desktop site). */
export function iosVersion(ua: string): [number, number] | null {
  const m = /OS (\d+)[_.](\d+)/.exec(ua) ?? /Version\/(\d+)\.(\d+)/.exec(ua);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function detectSupport(env: PushEnv): PushSupport {
  if (isApple(env) && !env.standalone) {
    const v = iosVersion(env.ua);
    // Before 16.4 there is no push on an iPhone at all, installed or not; a version that is not stated is taken to be a current one.
    return v && (v[0] < IOS_PUSH[0] || (v[0] === IOS_PUSH[0] && v[1] < IOS_PUSH[1])) ? "unsupported" : "needs-install";
  }
  return env.secure && env.serviceWorker && env.pushManager && env.notification && env.production ? "ok" : "unsupported";
}

export const platformOf = (env: Pick<PushEnv, "ua" | "touchPoints">): PushPlatform =>
  isApple(env) ? "ios" : /Android/.test(env.ua) ? "android" : "desktop";

export function pushStatus(input: {
  support: PushSupport;
  permission: Permission;
  /** The student's setting, `notifications_on` (FR-NOT-03). */
  notificationsOn: boolean;
  /** This phone holds a subscription the API knows about (always true in the demo, which has no push server). */
  subscribed: boolean;
}): PushStatus {
  if (input.support !== "ok") return input.support;
  if (input.permission === "denied") return "blocked";
  return input.permission === "granted" && input.notificationsOn && input.subscribed ? "on" : "off";
}

/** The browser's own answers, read when the app asks. Safe to call on the server: it says there is nothing there. */
export function readEnv(): PushEnv {
  if (typeof window === "undefined") {
    return { ua: "", touchPoints: 0, standalone: false, secure: false, serviceWorker: false, pushManager: false, notification: false, production: false };
  }
  return {
    ua: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints ?? 0,
    standalone: window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
    secure: window.isSecureContext,
    serviceWorker: "serviceWorker" in navigator,
    pushManager: "PushManager" in window,
    notification: "Notification" in window,
    production: process.env.NODE_ENV === "production",
  };
}
