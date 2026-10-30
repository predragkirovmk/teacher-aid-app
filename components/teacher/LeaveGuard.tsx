"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { leavesTo } from "@/lib/teacher/leave";
import { useT } from "@/lib/teacher/i18n";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Mounted only while the questions are being written, because leaving then loses the wait. A click on any of the app's own
 * links (the menu, Back, the reminder of a running lesson) is held and the teacher is asked, with "Остани" as the answer in
 * hand; Yes goes where the link went. Closing the tab or reloading is the browser's own question (`beforeunload`), which a
 * page can only ask for, not word. The browser's Back button cannot be held by a page, so it is not.
 *
 * The click is caught on the way down, before the router sees it, so a `<Link>` anywhere on the page is covered without each
 * one having to know. A link that opens elsewhere (a new tab, a download), a click with a modifier key and a link to the
 * page itself are left alone.
 */
export function LeaveGuard() {
  const { t } = useT();
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const to = leavesTo(link.href, window.location.href);
      if (to === null) return;
      e.preventDefault();
      e.stopPropagation();
      setTarget(to);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, []);

  return (
    <ConfirmDialog
      open={target !== null}
      title={t("prepare.leave.title")}
      body={t("prepare.leave.body")}
      stay={t("prepare.leave.stay")}
      confirm={t("prepare.leave.confirm")}
      onStay={() => setTarget(null)}
      onConfirm={() => {
        if (target !== null) router.push(target);
        setTarget(null);
      }}
    />
  );
}
