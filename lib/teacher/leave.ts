/**
 * Where a click on a link would take the teacher, when that leaves the page they are on. The wait for the questions asks
 * before the teacher goes (components/teacher/LeaveGuard.tsx); this decides which clicks are leaving. Nothing here touches
 * the browser, so it is unit tested.
 */

/**
 * The path (with query and fragment) a link to `href` leads to from the page at `here`, or null when the click does not leave:
 * a link to the same page (a skip link, a fragment) stays where it is, and a link to another site is the browser's own to
 * ask about (the page asks it to, `beforeunload`).
 */
export function leavesTo(href: string, here: string): string | null {
  let from: URL;
  let to: URL;
  try {
    from = new URL(here);
    to = new URL(href, from);
  } catch {
    return null;
  }
  if (to.origin !== from.origin) return null;
  if (to.pathname === from.pathname && to.search === from.search) return null;
  return `${to.pathname}${to.search}${to.hash}`;
}
