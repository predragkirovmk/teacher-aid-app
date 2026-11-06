/**
 * Background Sync, as a nicety. Where the browser has it (Chromium), a saved answer registers a sync
 * tag; when the network returns the service worker (public/app-sw.js) tells the open pages to flush the
 * outbox. Nothing relies on it: iOS has no Background Sync, a closed app is not woken here, and the
 * outbox flushes by itself when the page gets the `online` event, comes to the front, or starts. The
 * worker never sends, caches or replays an answer; the page does, from its own store.
 */
export const SYNC_TAG = "teacheraid-answers";
export const WAKE_MESSAGE = "flush-outbox";

type SyncRegistration = ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };

/** Ask the browser to wake the page when the connection is back. Does nothing where it cannot. */
export async function requestBackgroundSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const registration = (await navigator.serviceWorker.getRegistration("/app")) as SyncRegistration | undefined;
    await registration?.sync?.register(SYNC_TAG);
  } catch {
    // refused or unsupported: the page's own triggers are the plan
  }
}

/** Run `flush` when the worker wakes the page. Returns the way to stop. */
export function onSyncWake(flush: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const listener = (e: MessageEvent) => {
    if ((e.data as { type?: unknown } | null)?.type === WAKE_MESSAGE) flush();
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
