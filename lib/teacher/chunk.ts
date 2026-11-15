/**
 * A page whose code could not be fetched. The browser fetches a page's code ahead of time (a link in view is prefetched); when that
 * happens while the connection is down, the failure is remembered, and opening the page later throws even with the connection back.
 * Rendering again reuses the same failed fetch, so the only cure is to load the page afresh.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "ChunkLoadError" || /Failed to load chunk|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/.test(error.message);
}

const KEY = "teacheraid-chunk-reload";

/**
 * Loads the page afresh, once per address in a short while: if the fresh load fails the same way, the error screen stays, so a page
 * that is really broken does not reload for ever. `now` and `store` are passed in for the tests.
 */
export function reloadOnce(
  href: string,
  reload: () => void,
  now = Date.now(),
  store: Pick<Storage, "getItem" | "setItem"> | null = typeof sessionStorage === "undefined" ? null : sessionStorage,
): boolean {
  try {
    const last = JSON.parse(store?.getItem(KEY) ?? "null") as { href: string; at: number } | null;
    if (last && last.href === href && now - last.at < 30_000) return false;
    store?.setItem(KEY, JSON.stringify({ href, at: now }));
  } catch {
    // Without storage there is no guard against a loop, so do not reload by itself.
    return false;
  }
  reload();
  return true;
}
