import { describe, expect, it } from "vitest";
import { ASK_GAP_MS, ASK_MAX, NEVER_ASKED, asked, calmScreen, readHistory, shouldAsk } from "@/lib/app/push/ask";
import { detectSupport, iosVersion, platformOf, pushStatus, type PushEnv } from "@/lib/app/push/support";

const IPHONE_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_16_3 = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1";
const IPHONE_16_4 = IPHONE_16_3.replaceAll("16_3", "16_4").replace("16.3", "16.4");
const IPAD_DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  ua: ANDROID,
  touchPoints: 5,
  standalone: false,
  secure: true,
  serviceWorker: true,
  pushManager: true,
  notification: true,
  production: true,
  ...over,
});

describe("what this phone can do about web push", () => {
  it("asks on a browser that has the whole of it", () => {
    expect(detectSupport(env())).toBe("ok");
    expect(detectSupport(env({ ua: MAC, touchPoints: 0 }))).toBe("ok");
    expect(detectSupport(env({ standalone: true }))).toBe("ok");
  });

  it("has no push without a secure page, a worker, a push manager, notifications or a production build", () => {
    for (const missing of ["secure", "serviceWorker", "pushManager", "notification", "production"] as const) {
      expect(detectSupport(env({ [missing]: false })), missing).toBe("unsupported");
    }
  });

  it("on an iPhone needs the app on the Home Screen first", () => {
    const tab = { ua: IPHONE_17, pushManager: false, notification: false };
    expect(detectSupport(env(tab))).toBe("needs-install");
    expect(detectSupport(env({ ...tab, standalone: true, pushManager: true, notification: true }))).toBe("ok");
    // Installed on a version with no push: the browser has no push manager.
    expect(detectSupport(env({ ua: IPHONE_16_3, standalone: true, pushManager: false, notification: false }))).toBe("unsupported");
  });

  it("knows the first iOS with push is 16.4", () => {
    expect(detectSupport(env({ ua: IPHONE_16_3 }))).toBe("unsupported");
    expect(detectSupport(env({ ua: IPHONE_16_4 }))).toBe("needs-install");
    expect(iosVersion(IPHONE_17)).toEqual([17, 4]);
    expect(iosVersion(IPHONE_16_3)).toEqual([16, 3]);
    expect(iosVersion(ANDROID)).toBeNull();
    // A newer Safari freezes the OS token; its own version is the one that counts. Chrome on iOS has only the token.
    expect(iosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1")).toEqual([26, 0]);
    expect(iosVersion("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1")).toEqual([17, 2]);
  });

  it("takes an iPad asking for the desktop site for an iPad, and a Mac for a Mac", () => {
    expect(platformOf({ ua: IPAD_DESKTOP, touchPoints: 5 })).toBe("ios");
    expect(detectSupport(env({ ua: IPAD_DESKTOP, touchPoints: 5 }))).toBe("needs-install");
    expect(platformOf({ ua: MAC, touchPoints: 0 })).toBe("desktop");
    expect(platformOf({ ua: ANDROID, touchPoints: 5 })).toBe("android");
    expect(platformOf({ ua: IPHONE_17, touchPoints: 5 })).toBe("ios");
  });
});

describe("the notifications switch", () => {
  const base = { support: "ok", permission: "granted", notificationsOn: true, subscribed: true } as const;

  it("is on only when the setting, the permission and a subscription all are", () => {
    expect(pushStatus(base)).toBe("on");
    expect(pushStatus({ ...base, notificationsOn: false })).toBe("off");
    expect(pushStatus({ ...base, subscribed: false })).toBe("off");
    expect(pushStatus({ ...base, permission: "default" })).toBe("off");
  });

  it("says blocked whatever the setting is, once the browser has said no", () => {
    expect(pushStatus({ ...base, permission: "denied" })).toBe("blocked");
    expect(pushStatus({ ...base, permission: "denied", notificationsOn: false })).toBe("blocked");
  });

  it("says what the phone lacks before anything else", () => {
    expect(pushStatus({ ...base, support: "needs-install", permission: "denied" })).toBe("needs-install");
    expect(pushStatus({ ...base, support: "unsupported" })).toBe("unsupported");
  });
});

describe("when to ask", () => {
  const now = 1_800_000_000_000;
  const ask = (over: Partial<Parameters<typeof shouldAsk>[0]> = {}) => shouldAsk({ status: "off", permission: "default", history: NEVER_ASKED, now, ...over });

  it("asks a student who has never been asked and has not decided", () => {
    expect(ask()).toBe(true);
  });

  it("never asks one who said no in the browser, said no in the app, cannot say yes, or already said yes", () => {
    expect(ask({ status: "blocked", permission: "denied" })).toBe(false);
    expect(ask({ status: "off", permission: "granted" })).toBe(false);
    expect(ask({ status: "unsupported" })).toBe(false);
    expect(ask({ status: "on", permission: "granted" })).toBe(false);
  });

  it("asks an iPhone that is not installed yet, to say how", () => {
    expect(ask({ status: "needs-install" })).toBe(true);
  });

  it("asks at most twice, and not twice in a week", () => {
    const once = asked(NEVER_ASKED, now);
    expect(ask({ history: once })).toBe(false);
    expect(ask({ history: once, now: now + ASK_GAP_MS - 1 })).toBe(false);
    expect(ask({ history: once, now: now + ASK_GAP_MS })).toBe(true);
    const twice = asked(once, now + ASK_GAP_MS);
    expect(twice.count).toBe(ASK_MAX);
    expect(ask({ history: twice, now: now + 10 * ASK_GAP_MS })).toBe(false);
  });

  it("reads what the phone kept, and takes anything else for a student who was never asked", () => {
    expect(readHistory(JSON.stringify({ count: 1, last: 5 }))).toEqual({ count: 1, last: 5 });
    for (const raw of [null, "", "nope", "[]", "{}", JSON.stringify({ count: -1, last: 5 }), JSON.stringify({ count: "1", last: 5 })]) {
      expect(readHistory(raw), String(raw)).toEqual(NEVER_ASKED);
    }
  });

  it("waits for a calm screen: a tab root, a summary or the practice list, not a quiz, a scan or a set", () => {
    for (const path of ["/app", "/app/notifications", "/app/profile", "/app/summary/se-1", "/app/summary", "/app/practice"]) expect(calmScreen(path), path).toBe(true);
    for (const path of ["/app/play/MATH-7B", "/app/scan", "/app/practice/ps-1", "/app/checkin/MATH-7B", "/app/welcome", "/app/settings"]) expect(calmScreen(path), path).toBe(false);
  });
});
