import { releaseDevice } from "./api/hooks";
import { invalidate } from "./api/query";
import { resetFeed } from "./feed";
import { keepOnClear, keptOnClear } from "./keep-keys";
import { LOCALE_KEY } from "./locale";
import { warmOfflineCache } from "./offline-cache";
import { refresh } from "./push";
import { focusQueue, outbox } from "./session/send";

/**
 * "Clear data on this phone" (the "Your data" screen). What the app keeps on a phone, and what clearing it does.
 *
 * Kept on the phone (the privacy notice lists the same, section `phone`):
 *  - the sign-in cookie, which the server set and the app cannot read;
 *  - IndexedDB `teacheraid-outbox`: answers and questions to the teacher not sent yet (BR-NET-01), practice answers for up to 30 days;
 *  - localStorage `teacheraid-*`: the language, the practice sets last seen, the focus queue and the line about it, who signed in last,
 *    notification choices, the camera intro, small "seen" marks;
 *  - sessionStorage `teacheraid-*`: a lesson in progress, the sign-in step, small marks for this visit;
 *  - the offline worker's caches `app-*`: the app's own pages and files, with no student data (the worker never sees an API call).
 *
 * Clearing removes all of it except the language, and the sign-in cookie (which is not the app's to remove: signing out ends it).
 * It first lets go of this phone's notification subscription, as signing out does, because the subscription is the one thing on the
 * phone that also lives on the server. In the demo, the mock's stand-in server data lives in the same storage and is kept.
 */

// The language is a choice, not a trace of the student. The demo's server stand-in is not the phone's data (the mock registers its keys).
keepOnClear(LOCALE_KEY);

/** The offline worker's caches (public/app-sw.js). */
const CACHE_PREFIX = "app-";
const KEY_PREFIX = "teacheraid-";

/** How many answers and questions are saved on this phone and not sent yet, for the warning before clearing. */
export async function unsentCount(): Promise<number> {
  await outbox.load();
  return outbox.getStatus().pending;
}

function wipe(storage: Storage, keep: readonly string[]) {
  for (const key of Object.keys(storage)) if (key.startsWith(KEY_PREFIX) && !keep.includes(key)) storage.removeItem(key);
}

/**
 * Clear it. Never half-way by choice: each step is tried and the first failure is thrown after the others have run, so a
 * blocked storage does not leave the outbox full. Resolves when the phone holds nothing of the above.
 */
export async function clearPhone(): Promise<void> {
  const failures: unknown[] = [];
  const step = async (fn: () => unknown) => {
    try {
      await fn();
    } catch (e) {
      failures.push(e);
    }
  };

  // While the student is still known to the server: this phone's notification subscription goes, here and there.
  await step(releaseDevice);
  await step(() => outbox.clear());
  focusQueue.clear();
  await step(() => wipe(window.localStorage, keptOnClear()));
  await step(() => wipe(window.sessionStorage, []));
  await step(async () => {
    if (typeof caches === "undefined") return;
    for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
  });

  // The student stays signed in, so screens keep what they show and read it again from the server.
  invalidate();
  resetFeed();
  refresh().catch(() => {});
  void warmOfflineCache();

  if (failures.length) throw failures[0];
}
