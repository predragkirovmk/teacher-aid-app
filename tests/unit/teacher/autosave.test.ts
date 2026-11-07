import { describe, expect, test } from "vitest";
import { announce, createAutosaver, isSettled, losesWorkOnLeaving, SAVE_DELAY_MS, SAVE_RETRY_MS, type SaveStatus, type Spoken, type Timers } from "@/lib/teacher/autosave";

/** Timers a test moves by hand. */
function clock() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clear: (id) => void pending.delete(id as number),
  };
  const advance = async (ms: number) => {
    const to = now + ms;
    for (;;) {
      const due = [...pending].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await settle();
    }
    now = to;
  };
  return { timers, advance, waiting: () => pending.size };
}

/** Let promises that are already settled run their handlers. */
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

function setup(save: (value: string) => Promise<unknown> = async () => {}) {
  const c = clock();
  const sent: string[] = [];
  const seen: SaveStatus[] = [];
  const saver = createAutosaver<string>({
    save: async (v) => {
      sent.push(v);
      await save(v);
    },
    onStatus: (s) => seen.push(s),
    timers: c.timers,
  });
  return { ...c, saver, sent, seen };
}

describe("saving as the teacher works", () => {
  test("nothing is sent until the teacher has stopped for a moment, and then it is sent once", async () => {
    const t = setup();
    expect(t.saver.status()).toBe("idle");
    t.saver.edit("а");
    expect(t.saver.status()).toBe("dirty");
    await t.advance(SAVE_DELAY_MS - 1);
    expect(t.sent).toEqual([]);
    t.saver.edit("аб");
    await t.advance(SAVE_DELAY_MS - 1);
    expect(t.sent).toEqual([]);
    await t.advance(1);
    expect(t.sent).toEqual(["аб"]);
    expect(t.saver.status()).toBe("saved");
    expect(t.seen).toEqual(["dirty", "saving", "saved"]);
  });

  test("a key pressed while a save is on its way is the next save, and only the newest is sent", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const t = setup(() => gate);
    t.saver.edit("1");
    await t.advance(SAVE_DELAY_MS);
    expect(t.sent).toEqual(["1"]);
    expect(t.saver.status()).toBe("saving");
    t.saver.edit("2");
    t.saver.edit("3");
    // Still on its way: the status does not go back to dirty while it lands.
    expect(t.saver.status()).toBe("saving");
    release();
    await settle();
    await t.advance(SAVE_DELAY_MS);
    expect(t.sent).toEqual(["1", "3"]);
    expect(t.saver.status()).toBe("saved");
  });

  test("flush sends what is waiting at once, and says the draft has it", async () => {
    const t = setup();
    t.saver.edit("а");
    expect(await t.saver.flush()).toBe(true);
    expect(t.sent).toEqual(["а"]);
    expect(t.saver.status()).toBe("saved");
    // The timer that was waiting is gone: nothing is sent twice.
    await t.advance(SAVE_DELAY_MS * 2);
    expect(t.sent).toEqual(["а"]);
    expect(await t.saver.flush()).toBe(true);
    expect(t.sent).toEqual(["а"]);
  });

  test("flush sends the call before it returns, so a page that is closing still sends", () => {
    const t = setup();
    t.saver.edit("а");
    void t.saver.flush();
    expect(t.sent).toEqual(["а"]);
  });

  test("a save that fails is kept and tried again by itself, and the status says so in between", async () => {
    let fails = 2;
    const t = setup(async () => {
      if (fails-- > 0) throw new Error("offline");
    });
    t.saver.edit("а");
    await t.advance(SAVE_DELAY_MS);
    expect(t.saver.status()).toBe("failed");
    await t.advance(SAVE_RETRY_MS);
    expect(t.saver.status()).toBe("failed");
    await t.advance(SAVE_RETRY_MS);
    expect(t.saver.status()).toBe("saved");
    expect(t.sent).toEqual(["а", "а", "а"]);
    expect(t.seen).toEqual(["dirty", "saving", "failed", "saving", "failed", "saving", "saved"]);
  });

  test("a change made while a save is on its way keeps its own short timer when that save fails", async () => {
    let release: (() => void) | null = null;
    let fail = true;
    const t = setup(
      () =>
        new Promise<void>((resolve, reject) => {
          release = () => (fail ? reject(new Error("offline")) : resolve());
        }),
    );
    t.saver.edit("а");
    await t.advance(SAVE_DELAY_MS);
    t.saver.edit("аб"); // the first save is still on its way
    fail = true;
    (release as unknown as () => void)();
    for (let i = 0; i < 4; i++) await t.advance(0);
    fail = false;
    await t.advance(SAVE_DELAY_MS);
    (release as unknown as () => void)();
    for (let i = 0; i < 4; i++) await t.advance(0);
    expect(t.sent).toEqual(["а", "аб"]);
    expect(t.saver.status()).toBe("saved");
  });

  test("a change made after a failure is the one that is tried again", async () => {
    let fails = 1;
    const t = setup(async () => {
      if (fails-- > 0) throw new Error("offline");
    });
    t.saver.edit("а");
    await t.advance(SAVE_DELAY_MS);
    expect(t.saver.status()).toBe("failed");
    t.saver.edit("аб");
    await t.advance(SAVE_DELAY_MS);
    expect(t.sent).toEqual(["а", "аб"]);
    expect(t.saver.status()).toBe("saved");
  });

  test("flush that cannot send says so, and the engine goes on trying", async () => {
    const t = setup(async () => {
      throw new Error("offline");
    });
    t.saver.edit("а");
    expect(await t.saver.flush()).toBe(false);
    expect(t.saver.status()).toBe("failed");
    expect(t.waiting()).toBe(1);
  });

  test("once disposed it sends nothing more by itself", async () => {
    const t = setup();
    t.saver.edit("а");
    t.saver.dispose();
    await t.advance(SAVE_DELAY_MS * 3);
    expect(t.sent).toEqual([]);
    t.saver.edit("б");
    expect(t.saver.status()).toBe("dirty");
    expect(t.waiting()).toBe(0);
  });
});

describe("what a screen reader is told", () => {
  /** The words said as the status goes through `statuses`. */
  const said = (statuses: SaveStatus[]) => {
    let spoken: Spoken = null;
    return statuses.flatMap((s) => {
      const out = announce(spoken, s);
      spoken = out.spoken;
      return out.say ? [out.say] : [];
    });
  };

  test("that it is saved is said once, however many keys follow", () => {
    const keys: SaveStatus[] = ["dirty", "saving", "saved", "dirty", "saving", "saved", "dirty", "saving", "saved"];
    expect(said(keys)).toEqual(["saved"]);
  });

  test("a failure is said, and the first save after it is said again", () => {
    expect(said(["dirty", "saving", "saved", "dirty", "saving", "failed", "saving", "failed", "saving", "saved", "dirty", "saving", "saved"])).toEqual(["saved", "failed", "saved"]);
  });

  test("nothing is said while it is only waiting or on its way", () => {
    expect(said(["idle", "dirty", "saving", "dirty", "saving"])).toEqual([]);
  });
});

describe("what leaving would lose", () => {
  test("a change waiting for its moment is sent as the page goes, so nothing is asked; one that could not be sent, or a number not yet a number, is", () => {
    expect(losesWorkOnLeaving("saved", false)).toBe(false);
    expect(losesWorkOnLeaving("idle", false)).toBe(false);
    expect(losesWorkOnLeaving("dirty", false)).toBe(false);
    expect(losesWorkOnLeaving("saving", false)).toBe(false);
    expect(losesWorkOnLeaving("failed", false)).toBe(true);
    expect(losesWorkOnLeaving("saved", true)).toBe(true);
  });

  test("idle and saved are the two settled states", () => {
    expect((["idle", "saved", "dirty", "saving", "failed"] as const).map(isSettled)).toEqual([true, true, false, false, false]);
  });
});
