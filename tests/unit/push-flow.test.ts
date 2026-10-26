import { describe, expect, it, vi } from "vitest";
import { createPushFlow, registrationOf, urlBase64ToBytes, type PushIO, type SubscriptionLike } from "@/lib/app/push/flow";
import type { Permission, PushEnv } from "@/lib/app/push/support";

const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const subscription = (endpoint = "https://push.example/s1"): SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> } => ({
  endpoint,
  toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "pk", auth: "au" } }),
  unsubscribe: vi.fn(async () => true),
});

/** A phone, an API and a memory that a test can look into. */
function setup(over: { permission?: Permission; ask?: Permission; key?: boolean; ua?: string; standalone?: boolean; existing?: SubscriptionLike | null; optIn?: string | null } = {}) {
  let permission = over.permission ?? "default";
  let existing = over.existing ?? null;
  const env: PushEnv = {
    ua: over.ua ?? ANDROID,
    touchPoints: 5,
    standalone: over.standalone ?? false,
    secure: true,
    serviceWorker: true,
    pushManager: true,
    notification: true,
    production: true,
  };
  const created = subscription("https://push.example/new");
  const manager = {
    getSubscription: vi.fn(async () => existing),
    subscribe: vi.fn(async () => {
      existing = created;
      return created;
    }),
  };
  let optIn = over.optIn ?? null;
  let registered: { studentId: string; endpoint: string } | null = null;
  const calls: string[] = [];
  const io: PushIO = {
    env: () => env,
    permission: () => permission,
    requestPermission: vi.fn(async () => {
      permission = over.ask ?? "granted";
      return permission;
    }),
    manager: vi.fn(async () => manager),
    applicationServerKey: () => (over.key === false ? null : new Uint8Array([4, 1, 2])),
    api: {
      setPushToken: vi.fn(async () => void calls.push("PUT")),
      removePushToken: vi.fn(async () => void calls.push("DELETE")),
      setNotificationsOn: vi.fn(async (on: boolean) => void calls.push(`PATCH ${on}`)),
    },
    memory: {
      optIn: () => optIn,
      setOptIn: (id) => (optIn = id),
      registered: () => registered,
      setRegistered: (v) => (registered = v),
    },
  };
  return { io, manager, calls, flow: createPushFlow(io), state: () => ({ optIn, registered, permission }), created };
}

describe("turning notifications on", () => {
  it("asks the browser, subscribes with the server's key, and tells the API: the setting, then the subscription", async () => {
    const t = setup();
    expect(await t.flow.turnOn("st-1")).toEqual({ result: "on" });
    expect(t.io.requestPermission).toHaveBeenCalledOnce();
    expect(t.manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([4, 1, 2]) });
    expect(t.calls).toEqual(["PATCH true", "PUT"]);
    expect(t.io.api.setPushToken).toHaveBeenCalledWith({
      endpoint: "https://push.example/new",
      expirationTime: null,
      keys: { p256dh: "pk", auth: "au" },
      platform: "android",
    });
    expect(t.state()).toMatchObject({ optIn: "st-1", registered: { studentId: "st-1", endpoint: "https://push.example/new" } });
  });

  it("does not ask again once the browser has been asked", async () => {
    const t = setup({ permission: "granted" });
    expect(await t.flow.turnOn("st-1")).toEqual({ result: "on" });
    expect(t.io.requestPermission).not.toHaveBeenCalled();
  });

  it("changes nothing when the browser says no, or the prompt is closed", async () => {
    const no = setup({ ask: "denied" });
    expect(await no.flow.turnOn("st-1")).toEqual({ result: "denied" });
    expect(no.calls).toEqual([]);
    const closed = setup({ ask: "default" });
    expect(await closed.flow.turnOn("st-1")).toEqual({ result: "dismissed" });
    expect(closed.calls).toEqual([]);
    const blocked = setup({ permission: "denied" });
    expect(await blocked.flow.turnOn("st-1")).toEqual({ result: "denied" });
    expect(blocked.io.requestPermission).not.toHaveBeenCalled();
  });

  it("never prompts on an iPhone that is not on the Home Screen, or in a browser without push", async () => {
    const iphone = setup({ ua: IPHONE });
    expect(await iphone.flow.turnOn("st-1")).toEqual({ result: "needs-install" });
    expect(iphone.io.requestPermission).not.toHaveBeenCalled();
    const installed = setup({ ua: IPHONE, standalone: true });
    expect(await installed.flow.turnOn("st-1")).toEqual({ result: "on" });
    const none = setup();
    const noneEnv = none.io.env();
    none.io.env = () => ({ ...noneEnv, pushManager: false });
    expect(await none.flow.turnOn("st-1")).toEqual({ result: "unsupported" });
  });

  it("is the permission alone in the demo, which has no push server to subscribe to", async () => {
    const t = setup({ key: false });
    expect(await t.flow.turnOn("st-1")).toEqual({ result: "on" });
    expect(t.manager.subscribe).not.toHaveBeenCalled();
    expect(t.calls).toEqual(["PATCH true"]);
  });

  it("fails, with the setting already saved, when the API will not take the subscription", async () => {
    const t = setup({ permission: "granted" });
    const error = new Error("offline");
    vi.mocked(t.io.api.setPushToken).mockRejectedValueOnce(error);
    expect(await t.flow.turnOn("st-1")).toEqual({ result: "failed", error });
    expect(t.state().registered).toBeNull();
  });

  it("fails when the setting cannot be saved, before subscribing to anything", async () => {
    const t = setup({ permission: "granted" });
    vi.mocked(t.io.api.setNotificationsOn).mockRejectedValueOnce(new Error("offline"));
    expect((await t.flow.turnOn("st-1")).result).toBe("failed");
    expect(t.manager.subscribe).not.toHaveBeenCalled();
    expect(t.state().optIn).toBeNull();
  });

  it("uses the subscription the phone already has and does not tell the API twice", async () => {
    const own = subscription("https://push.example/own");
    const t = setup({ permission: "granted", existing: own });
    await t.flow.turnOn("st-1");
    await t.flow.turnOn("st-1");
    expect(t.manager.subscribe).not.toHaveBeenCalled();
    expect(t.calls.filter((c) => c === "PUT")).toHaveLength(1);
  });
});

describe("turning notifications off", () => {
  it("saves the setting first, then cancels the subscription and has the API forget it", async () => {
    const own = subscription();
    const t = setup({ permission: "granted", existing: own, optIn: "st-1" });
    await t.flow.turnOff("st-1");
    expect(t.calls).toEqual(["PATCH false", "DELETE"]);
    expect(own.unsubscribe).toHaveBeenCalled();
    expect(t.state()).toMatchObject({ optIn: null, registered: null });
  });

  it("leaves the phone as it was when the setting cannot be saved", async () => {
    const own = subscription();
    const t = setup({ permission: "granted", existing: own, optIn: "st-1" });
    vi.mocked(t.io.api.setNotificationsOn).mockRejectedValueOnce(new Error("offline"));
    await expect(t.flow.turnOff("st-1")).rejects.toThrow("offline");
    expect(own.unsubscribe).not.toHaveBeenCalled();
    expect(t.state().optIn).toBe("st-1");
  });

  it("lets go of the phone's subscription even when the API cannot be reached", async () => {
    const own = subscription();
    const t = setup({ permission: "granted", existing: own, optIn: "st-1" });
    vi.mocked(t.io.api.removePushToken).mockRejectedValueOnce(new Error("offline"));
    await t.flow.turnOff("st-1");
    expect(own.unsubscribe).toHaveBeenCalled();
  });
});

describe("a student who is gone leaves no subscription behind", () => {
  it("cancels it with the push service and, if the session still exists, has the API forget it", async () => {
    const own = subscription();
    const t = setup({ permission: "granted", existing: own });
    await t.flow.letGo("st-1", true);
    expect(t.calls).toEqual(["DELETE"]);
    expect(own.unsubscribe).toHaveBeenCalled();
    const gone = setup({ permission: "granted", existing: subscription() });
    await gone.flow.letGo(null, false);
    expect(gone.calls).toEqual([]);
  });

  it("never throws, whatever the browser does", async () => {
    const t = setup({ permission: "granted", existing: subscription() });
    t.io.manager = vi.fn(async () => {
      throw new Error("no worker");
    });
    await expect(t.flow.letGo("st-1", true)).resolves.toBeUndefined();
  });
});

describe("bringing the phone and the API into step when the app opens", () => {
  it("makes a subscription again, without asking, for a student who turned notifications on here", async () => {
    const t = setup({ permission: "granted", optIn: "st-1" });
    await t.flow.resync({ id: "st-1", notificationsOn: true });
    expect(t.io.requestPermission).not.toHaveBeenCalled();
    expect(t.calls).toEqual(["PUT"]);
  });

  it("tells the API about a subscription that changed", async () => {
    const t = setup({ permission: "granted", optIn: "st-1", existing: subscription("https://push.example/rotated") });
    t.io.memory.setRegistered({ studentId: "st-1", endpoint: "https://push.example/old" });
    await t.flow.resync({ id: "st-1", notificationsOn: true });
    expect(t.state().registered?.endpoint).toBe("https://push.example/rotated");
  });

  it("never subscribes a student who did not turn notifications on here, even where a permission was given", async () => {
    const t = setup({ permission: "granted", optIn: "st-2" });
    await t.flow.resync({ id: "st-1", notificationsOn: true });
    expect(t.manager.subscribe).not.toHaveBeenCalled();
    expect(t.calls).toEqual([]);
  });

  it("cancels a subscription nobody asked for, without touching the API", async () => {
    const left = subscription();
    const t = setup({ permission: "granted", optIn: "st-2", existing: left });
    await t.flow.resync({ id: "st-1", notificationsOn: true });
    expect(left.unsubscribe).toHaveBeenCalled();
    expect(t.calls).toEqual([]);
  });

  it("lets go of a subscription for a student who has switched notifications off", async () => {
    const own = subscription();
    const t = setup({ permission: "granted", optIn: "st-1", existing: own });
    await t.flow.resync({ id: "st-1", notificationsOn: false });
    expect(t.calls).toEqual(["DELETE"]);
    expect(own.unsubscribe).toHaveBeenCalled();
  });

  it("does nothing without a permission, on a phone with no push, or when the API cannot be reached", async () => {
    const none = setup({ permission: "default", optIn: "st-1" });
    await none.flow.resync({ id: "st-1", notificationsOn: true });
    expect(none.calls).toEqual([]);
    const off = setup({ permission: "granted", optIn: "st-1" });
    const offEnv = off.io.env();
    off.io.env = () => ({ ...offEnv, serviceWorker: false });
    await off.flow.resync({ id: "st-1", notificationsOn: true });
    expect(off.manager.subscribe).not.toHaveBeenCalled();
    const down = setup({ permission: "granted", optIn: "st-1" });
    vi.mocked(down.io.api.setPushToken).mockRejectedValueOnce(new Error("offline"));
    await expect(down.flow.resync({ id: "st-1", notificationsOn: true })).resolves.toBeUndefined();
  });
});

describe("the subscription as the API takes it", () => {
  it("keeps the browser's names and adds the platform", () => {
    expect(registrationOf(subscription(), "ios")).toEqual({ endpoint: "https://push.example/s1", expirationTime: null, keys: { p256dh: "pk", auth: "au" }, platform: "ios" });
  });

  it("refuses one with no keys, which nothing could be pushed to", () => {
    const bare: SubscriptionLike = { endpoint: "x", toJSON: () => ({ endpoint: "x" }), unsubscribe: async () => true };
    expect(registrationOf(bare, "ios")).toBeNull();
  });

  it("reads the VAPID key the way the Push API wants it", () => {
    // 4, 251, 255 in URL-safe base64 without padding.
    expect([...urlBase64ToBytes("BPv_")]).toEqual([4, 251, 255]);
    expect([...urlBase64ToBytes("AQI")]).toEqual([1, 2]);
  });
});
