"use client";

import { CheckCircleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { deleteDraft, retryDraft, useDraft } from "@/lib/teacher/api/hooks";
import { isApiError } from "@/lib/teacher/api/errors";
import { DRAFT_STUCK_MS } from "@/lib/teacher/lessons";
import type { LessonDraft } from "@/lib/teacher/api/types";
import { useT } from "@/lib/teacher/i18n";
import { recallForm, leaveRefill } from "@/lib/teacher/refill";
import { refillOf } from "@/lib/teacher/prepare";
import { backFromDraft, draftUrl, fromOf, lessonUrl, newLessonUrl, NEW_LESSON } from "@/lib/teacher/routes";
import { ConfirmDialog } from "./ConfirmDialog";
import { Editor } from "./Editor";
import { LoadProblem } from "./LoadProblem";
import { PageHeader } from "./PageHeader";
import { WaitFailure, Waiting } from "./PrepareWait";
import { Problem } from "./Problem";
import { Bar, Loading } from "./Skeleton";

/**
 * The page of a draft, found by its address so that a reload, a link and "Продолжи" on Today all bring it back (EC-LES-09). What it
 * shows is what the draft is doing: being written (the wait, which asks again every few seconds and may be left without losing
 * anything), failed (what happened, and the way to try again), or ready (the editor). A draft that has been saved leads to its
 * lesson instead. An address the API does not know says so and leads to preparing a new one.
 */
export function DraftPage() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const from = useSearchParams().get("from");
  const q = useDraft(id);
  const draft = q.data;
  const gone = q.status === "error" && isApiError(q.error) && q.error.code === "not_found";
  // An answer the app cannot read (a draft not in the shape of 11.5) ends the wait with what went wrong: the draft on screen is the
  // last one that could be read, and waiting on it would only ask for the same answer again. Asking still goes on, and a draft that
  // can be read takes the page back. An editor already open keeps the teacher's work on screen.
  const unreadable = isApiError(q.error) && q.error.code === "invalid_response" && draft?.status !== "ready";
  // A draft that was waited for here and is ready now: the editor says so, and the focus goes to its first field.
  const [waited, setWaited] = useState(false);
  if (draft?.status === "pending" && !waited) setWaited(true);
  // A draft of a saved lesson goes back to the lesson in every state, as the editor does, and is about changing it, not about preparing one.
  const back = backFromDraft(from, draft?.lesson_id);

  const plain = <PageHeader title={t("draft.title")} back={back.href} backLabel={t(back.label)} />;
  const preparing = draft?.lesson_id ? (
    <PageHeader title={t("lesson.edit")} back={back.href} backLabel={t(back.label)} />
  ) : (
    <PageHeader title={t("lessonsNew.title")} subtitle={t("prepare.sub")} back={back.href} backLabel={t(back.label)} />
  );

  if (q.status === "loading") {
    return (
      <>
        {plain}
        <div className="content">
          <Loading>
            <div className="card card--stack" aria-hidden="true">
              <Bar width="4rem" height="4rem" className="skeleton--round" />
              <Bar width="40%" height="2rem" />
              <Bar width="80%" height="1.5rem" />
            </div>
            {[0, 1].map((i) => (
              <div key={i} className="question" aria-hidden="true">
                <Bar width="30%" height="1.75rem" />
                <Bar width="80%" height="2rem" />
                <Bar height="3.5rem" className="skeleton--row" />
                <Bar height="3.5rem" className="skeleton--row" />
              </div>
            ))}
          </Loading>
        </div>
      </>
    );
  }
  if ((q.status === "error" && !draft) || unreadable) {
    return (
      <>
        {plain}
        <div className="content">
          {gone ? (
            <div className="card card--stack">
              <span className="card__icon">
                <MagnifyingGlassIcon size={32} aria-hidden="true" />
              </span>
              <h2>{t("draft.notfound.title")}</h2>
              <p>{t("draft.notfound.body")}</p>
              <Link href={NEW_LESSON} className="btn btn--primary">
                {t("lessonsNew.title")}
              </Link>
            </div>
          ) : (
            <LoadProblem title={t("draft.error.title")} error={q.error} onRetry={q.refetch} />
          )}
        </div>
      </>
    );
  }
  if (!draft) return null;

  if (draft.consumed_at !== null) {
    return (
      <>
        <PageHeader title={draft.title ?? t("draft.title")} back={back.href} backLabel={t(back.label)} />
        <div className="content">
          <div className="card card--stack">
            <span className="card__icon">
              <CheckCircleIcon size={32} weight="fill" aria-hidden="true" />
            </span>
            <h2>{t("draft.saved.title")}</h2>
            <p>{t("draft.saved.body")}</p>
            {draft.lesson_id && (
              <Link href={lessonUrl(draft.lesson_id)} className="btn btn--primary">
                {t("draft.saved.open")}
              </Link>
            )}
          </div>
        </div>
      </>
    );
  }
  if (draft.status === "ready") return <Editor key={draft.id} draft={draft} from={from} fresh={waited} />;

  return (
    <>
      {preparing}
      <div className="content">
        {draft.status === "pending" ? (
          <Pending key={draft.id} draft={draft} from={from} offline={q.error?.code === "network"} onAsk={q.refetch} />
        ) : (
          <Failed key={draft.id} draft={draft} from={from} />
        )}
      </div>
    </>
  );
}

/** Where a draft that is thrown away leaves the teacher: the form, filled in again, for a first draft; the questions as they were, for a refinement. */
function useGiveUp(draft: LessonDraft, from: string | null, note: "cancelled" | "kept") {
  const router = useRouter();
  return async () => {
    const before = draft.previous_draft_id;
    if (before === null) leaveRefill(refillOf(draft, recallForm(), note));
    await deleteDraft(draft.id);
    router.replace(before === null ? newLessonUrl(fromOf(from)) : draftUrl(before, fromOf(from)));
  };
}

/**
 * The wait. The page asks for the draft again every few seconds (see `useDraft`), so there is nothing to do here but wait, and the
 * page may be left: the lesson will be on Today. Cancel asks first, since it throws the draft away, and then returns to the form
 * filled in again (or, for a refinement, to the questions as they were). A wait that goes on well past the server's own limit
 * (`DRAFT_STUCK_MS`) is over: the page says so, and the teacher goes back with everything kept or waits on.
 */
function Pending({ draft, from, offline, onAsk }: { draft: LessonDraft; from: string | null; offline: boolean; onAsk: () => void }) {
  const { t, te } = useT();
  const refining = draft.previous_draft_id !== null;
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  const giveUp = useGiveUp(draft, from, "cancelled");
  const goBack = useGiveUp(draft, from, "kept");
  // Each round of waiting has its own limit: "Keep waiting" starts another.
  const [round, setRound] = useState(0);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), DRAFT_STUCK_MS);
    return () => clearTimeout(timer);
  }, [round]);

  // The focus goes to what is being done as the page opens, and again when the wait goes on after it was over: it is what a screen
  // reader then reads.
  useEffect(() => {
    if (!stuck) document.querySelector<HTMLElement>('[data-focus="wait"]')?.focus();
  }, [stuck]);

  if (stuck) {
    return (
      <>
        <Stuck
          refining={refining}
          onBack={() => {
            setProblem(null);
            goBack().catch(setProblem);
          }}
          onWait={() => {
            setProblem(null);
            setStuck(false);
            setRound((r) => r + 1);
            onAsk();
          }}
        />
        {problem !== null && <Problem>{te(problem)}</Problem>}
      </>
    );
  }

  return (
    <>
      <Waiting
        phase="writing"
        withDocument={draft.source?.kind === "upload" && !refining}
        title={refining ? "refine.wait.title" : undefined}
        onCancel={() => setAsking(true)}
      />
      {/* The work goes on without this page, so a connection that has gone only stops the page from hearing of it. */}
      <p role="status" className={offline ? "wait__offline" : "sr"}>
        {offline ? t("wait.offline") : ""}
      </p>
      <ConfirmDialog
        open={asking}
        title={t(refining ? "refine.cancel.title" : "wait.cancel.title")}
        body={t(refining ? "refine.cancel.body" : "wait.cancel.body")}
        problem={problem === null ? undefined : te(problem)}
        stay={t("wait.cancel.stay")}
        confirm={t("wait.cancel.confirm")}
        onStay={() => {
          setAsking(false);
          setProblem(null);
        }}
        onConfirm={async () => {
          try {
            await giveUp();
          } catch (e) {
            setProblem(e);
          }
        }}
      />
    </>
  );
}

/**
 * The draft is still being written long after the server should have failed it: the job has stopped without anyone saying so. The
 * yellow button is the way a failure has, back to the form filled in again (or the questions as they were); the other waits on.
 */
function Stuck({ refining, onBack, onWait }: { refining: boolean; onBack: () => void; onWait: () => void }) {
  const { t } = useT();

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-focus="stuck"]')?.focus();
  }, []);

  return (
    <section className="card card--stack">
      <Problem id="wait-stuck" title={t("prepare.fail.timeout.title")}>
        {t(refining ? "refine.stuck.body" : "wait.stuck.body")}
      </Problem>
      <div className="prepare__actions">
        <button type="button" className="btn btn--primary btn--big" data-focus="stuck" aria-describedby="wait-stuck" onClick={onBack}>
          {t(refining ? "refine.fail.keep" : "wait.stuck.back")}
        </button>
        <button type="button" className="btn btn--secondary btn--big" onClick={onWait}>
          {t("wait.stuck.wait")}
        </button>
      </div>
    </section>
  );
}

/** The AI could not write it, even after its one retry (EC-LES-02): the yellow button runs the same draft again, the other gives it up. */
function Failed({ draft, from }: { draft: LessonDraft; from: string | null }) {
  const [problem, setProblem] = useState<unknown>(null);
  const { te } = useT();
  const giveUp = useGiveUp(draft, from, "kept");

  useEffect(() => {
    document.querySelector<HTMLElement>('[data-focus="failed"]')?.focus();
  }, []);

  return (
    <>
      <WaitFailure
        failure="generation"
        error={null}
        refining={draft.previous_draft_id !== null}
        onRetry={() => {
          setProblem(null);
          retryDraft(draft.id).catch(setProblem);
        }}
        onBack={() => {
          setProblem(null);
          giveUp().catch(setProblem);
        }}
      />
      {problem !== null && <Problem>{te(problem)}</Problem>}
    </>
  );
}
