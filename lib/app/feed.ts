"use client";

import { useSyncExternalStore } from "react";
import type { ApiClient } from "./api/client";
import { NOTIFICATIONS_PAGE } from "./api/config";
import type { ApiError } from "./api/errors";
import { reload } from "./api/query";
import type { Notification } from "./api/types";

/**
 * The Alerts feed is paged (PROPOSED, spec 11.3): the newest page is always loaded, older ones when the student asks
 * for them. The query holds one list, the newest first, made of as many pages as have been asked for; every refresh,
 * the badge's and a realtime event's, reads those pages again from the top, so a notification that arrives while an
 * older page is open pushes the rest down instead of leaving a hole.
 */

type FeedState = {
  /** How many pages the list is made of. */
  pages: number;
  /** The last page read was full, so there may be older ones. */
  more: boolean;
  /** Older notifications are being read. */
  busy: boolean;
};

const START: FeedState = { pages: 1, more: false, busy: false };
let feed = START;
const listeners = new Set<() => void>();

function set(next: Partial<FeedState>) {
  const merged = { ...feed, ...next };
  if (merged.pages === feed.pages && merged.more === feed.more && merged.busy === feed.busy) return;
  feed = merged;
  listeners.forEach((l) => l());
}

/** A different student, or none: back to the newest page. */
export const resetFeed = () => set(START);

/**
 * Read `wanted` pages of the feed, newest first, once each. With one page the client's own promise is returned as it is,
 * so an adapter that answers at once (the mock) still fills the screen in the render that asks.
 */
export function loadFeed(c: Pick<ApiClient, "listNotifications">, wanted: number = feed.pages, size: number = NOTIFICATIONS_PAGE): Promise<Notification[]> {
  const first = c.listNotifications({ limit: size });
  if (wanted <= 1) {
    void first.then((page) => set({ more: page.length >= size }), () => {});
    return first;
  }
  return (async () => {
    const seen = new Set<string>();
    const all: Notification[] = [];
    let page = await first;
    for (let i = 1; ; i++) {
      for (const n of page) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          all.push(n);
        }
      }
      if (i >= wanted || page.length < size) break;
      page = await c.listNotifications({ limit: size, before: page[page.length - 1].id });
    }
    set({ more: page.length >= size });
    return all;
  })();
}

/** Ask for the next older page. Resolves with the failure, if there was one, and then the feed stays as it was. */
export async function loadMoreFeed(): Promise<ApiError | null> {
  if (feed.busy || !feed.more) return null;
  set({ pages: feed.pages + 1, busy: true });
  const failure = await reload("notifications");
  set(failure ? { pages: feed.pages - 1, busy: false } : { busy: false });
  return failure;
}

/** The pages the feed is made of now, for the query that reads it. */
export const feedPages = () => feed.pages;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether older notifications may be waiting, and whether they are being read. */
export function useFeedMore() {
  const { more, busy } = useSyncExternalStore(subscribe, () => feed, () => START);
  return { hasMore: more, loading: busy, loadMore: loadMoreFeed };
}
