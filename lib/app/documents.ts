import type { MouseEvent } from "react";
import { client, demoOnly } from "./api";
import { documentsAge } from "./api/hooks";
import { amend, peek, reload } from "./api/query";
import type { TeacherDocument } from "./api/types";

/**
 * A signed address lasts "a few minutes" (spec 11.3; the API picks the number). A list older than this is asked for again before a
 * document opens: one minute is well inside any few minutes, and long enough that two taps in a row do not ask twice.
 */
export const STALE_MS = 60_000;

/** Tell the API, without waiting, and show the row as opened. */
function markOpened(id: string) {
  void client.markDocumentOpened(id).catch(() => {}); // the next list shows the truth if this one is lost
  amend<TeacherDocument[] | null>("documents", (list) => list && list.map((d) => (d.id === id ? { ...d, opened: true } : d)));
}

/**
 * What a tap on a document does. The row is a link with `target="_blank"`, so a fresh address opens by itself, with no script in
 * the way (a cross-origin `download` attribute is ignored, so it has none). Only an old list needs us: a blank tab is opened
 * at once, inside the tap (a tab opened after an await is refused on a phone), the list is fetched again, and the tab goes to
 * the new address; if the fetch fails it goes to the old one, which may still work. Either way the API is told, and the row shows as opened.
 * The demo's address never expires.
 */
export function openDocument(e: MouseEvent<HTMLAnchorElement>, doc: TeacherDocument) {
  if (demoOnly || documentsAge() <= STALE_MS) return markOpened(doc.id);
  e.preventDefault();
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  void reload("documents").then(() => {
    const url = peek<TeacherDocument[] | null>("documents")?.find((d) => d.id === doc.id)?.url ?? doc.url;
    markOpened(doc.id);
    if (tab) tab.location.href = url;
    else window.location.assign(url);
  });
}
