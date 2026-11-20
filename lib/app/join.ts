"use client";

import { useEffect, useState } from "react";

/**
 * How long a join may take before the student is told the connection is slow. The API call itself gives up at 15 s;
 * 12 s is under that, so the plain message arrives first, and it is long enough for a slow school Wi-Fi to finish a
 * handshake and one small request. Joining is idempotent, so a retry after a join that was only late is safe.
 */
export const JOIN_LIMIT_MS = 12_000;

/** After this long a waiting student is told, quietly, that it is taking a while. */
export const JOIN_SLOW_HINT_MS = 4_000;

/** True once the component has been on screen for `JOIN_SLOW_HINT_MS`; it starts again each time the component mounts. */
export function useSlowHint(): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), JOIN_SLOW_HINT_MS);
    return () => clearTimeout(id);
  }, []);
  return slow;
}
