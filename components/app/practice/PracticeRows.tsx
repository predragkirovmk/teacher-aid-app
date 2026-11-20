"use client";

import { CaretRightIcon, CheckCircleIcon, CircleHalfIcon, NotePencilIcon } from "@phosphor-icons/react";
import Link from "next/link";
import type { PracticeSet } from "@/lib/app/api/types";
import { formatDate } from "@/lib/app/format";
import { useT, type TFn } from "@/lib/app/i18n";
import { answeredIn, openSets, practiceStatus } from "@/lib/app/practice";
import { usePracticeSets } from "@/lib/app/api/hooks";

/** "1 question", "4 questions" / "1 прашање", "4 прашања". */
export const questionCount = (t: TFn, n: number) => t(n === 1 ? "pr.count.one" : "pr.count.other", { n });

/** Where a set stands, in words. */
export function stateText(t: TFn, set: PracticeSet): string {
  const status = practiceStatus(set);
  if (status === "new") return t("pr.state.new");
  if (status === "started") return t("pr.state.started", { done: answeredIn(set), n: set.questions.length });
  return t("pr.state.done", { score: set.score ?? 0, n: set.questions.length });
}

/** Where a set stands, for a row: a word, with an icon once there is something to show. */
function State({ set }: { set: PracticeSet }) {
  const { t } = useT();
  const status = practiceStatus(set);
  if (status === "new") return <span className="pill">{stateText(t, set)}</span>;
  if (status === "started") {
    return (
      <span className="status">
        <CircleHalfIcon size={18} weight="bold" aria-hidden="true" />
        {stateText(t, set)}
      </span>
    );
  }
  return (
    <span className="status">
      <CheckCircleIcon size={18} weight="bold" aria-hidden="true" />
      {stateText(t, set)}
    </span>
  );
}

/** One practice set in a list: the lesson it came from, how many questions, when it was sent, and where the student is in it. */
export function PracticeRow({ set }: { set: PracticeSet }) {
  const { t, locale } = useT();
  const meta = t("pr.meta", { count: questionCount(t, set.questions.length), date: formatDate(set.createdAt, locale) });
  const Icon = practiceStatus(set) === "done" ? CheckCircleIcon : NotePencilIcon;
  return (
    <Link href={`/app/practice/${encodeURIComponent(set.id)}`} className="item" transitionTypes={["nav-forward"]}>
      <span className="item__icon">
        <Icon size={22} aria-hidden="true" />
      </span>
      <span className="grow item__main">
        <span className="item__text">
          <span className="item__title" style={{ display: "block" }}>
            {set.lessonTitle ?? t("pr.title")}
          </span>
          <span className="t-cap">{meta}</span>
        </span>
        <State set={set} />
      </span>
      <CaretRightIcon size={22} aria-hidden="true" />
    </Link>
  );
}

/**
 * Home's yellow card. Waiting sets (new, or started and not finished) say so and open that set, or the list when more wait.
 * With none waiting it is quieter and opens the list, where finished sets can be done again.
 */
export function PracticeCard() {
  const { t } = useT();
  const sets = usePracticeSets();
  const waiting = openSets(sets.data ?? []);
  const fresh = waiting.filter((s) => practiceStatus(s) === "new");
  const first = waiting[0];
  const title = (fresh[0] ?? first)?.lessonTitle;
  const line = !sets.data
    ? ""
    : waiting.length === 0
      ? t("pr.home.none")
      : fresh.length > 1
        ? t("pr.home.newN", { n: fresh.length })
        : fresh.length === 1
          ? title
            ? t("pr.home.new1", { title })
            : t("home.new")
          : title
            ? t("pr.home.resume", { title })
            : t("pr.continue");
  return (
    <Link
      href={waiting.length === 1 ? `/app/practice/${encodeURIComponent(first.id)}` : "/app/practice"}
      className={waiting.length === 0 && sets.data ? "next next--quiet" : "next"}
      transitionTypes={["nav-forward"]}
    >
      <span className="next__sign" aria-hidden="true">
        <NotePencilIcon size={136} />
      </span>
      <span className="next__name">{t("pr.title")}</span>
      <span className="next__when">{line}</span>
      {waiting.length > 0 && <span className="next__action">{t(fresh.length === 0 ? "pr.continue" : "pr.start")}</span>}
    </Link>
  );
}
