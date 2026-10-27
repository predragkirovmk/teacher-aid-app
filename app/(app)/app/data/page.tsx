"use client";

import { ArrowRightIcon, TrashIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Gate } from "@/components/app/QueryState";
import { Row } from "@/components/app/Row";
import { Top } from "@/components/app/Top";
import { useUI } from "@/components/app/ui";
import { useDataSummary, useMe } from "@/lib/app/api/hooks";
import type { DataSummary, Student } from "@/lib/app/api/types";
import { useT, type Key } from "@/lib/app/i18n";
import { personName } from "@/lib/app/quiz";
import { CONTACT_EMAIL } from "@/lib/app/privacy";
import { clearPhone, unsentCount } from "@/lib/app/phone-data";

/** The counts in the order the privacy notice lists what is collected. */
const COUNTS: { key: Key; value: (s: DataSummary) => number }[] = [
  { key: "data.n.attendance", value: (s) => s.attendance },
  { key: "data.n.answers", value: (s) => s.answers },
  { key: "data.n.reasons", value: (s) => s.reasons },
  { key: "data.n.asks", value: (s) => s.questionsToTeacher },
  { key: "data.n.focus", value: (s) => s.focusEvents },
  { key: "data.n.practice", value: (s) => s.practiceAnswers },
  { key: "data.n.alerts", value: (s) => s.notifications },
];

/**
 * Profile, Your data: what the server holds about the student (their account, and a count of each kind of record, from the
 * PROPOSED `GET /me/data-summary`), what the phone holds and the button that clears it, and how to ask for a copy or for deletion.
 * There is no self-service delete: a request goes through the school (F-16), and this screen says so.
 */
export default function DataPage() {
  const { t } = useT();
  const me = useMe();
  return (
    <Gate query={me} header={<Top title={t("data.title")} />}>
      {(student) => <DataView student={student} />}
    </Gate>
  );
}

/** One thing the app holds, label above its value. An address breaks after the @ or a dot, never in the middle of a word. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="item data__fact">
      <span className="grow data__stack">
        <span className="t-cap">{label}</span>
        <span className="item__title">
          {value.split(/(?<=[@.])/).map((part, i) => (
            <span key={i}>
              {i > 0 && <wbr />}
              {part}
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}

function DataView({ student }: { student: Student }) {
  const { t, locale } = useT();
  const { confirm, toast } = useUI();
  const summary = useDataSummary();
  const counts = summary.data;

  /** Ask first, and say plainly what is lost when answers have not been sent yet. */
  async function askToClear() {
    const unsent = await unsentCount();
    const run = () =>
      clearPhone().then(
        () => toast(t("data.cleared")),
        () => toast(t("data.clearFailed")),
      );
    if (unsent > 0) {
      confirm({ title: t(unsent === 1 ? "data.clearUnsent.one" : "data.clearUnsent.many", { n: unsent }), confirmLabel: t("data.clearAnyway"), onConfirm: run });
    } else {
      confirm({ title: t("data.clearTitle"), body: t("data.clearHint"), confirmLabel: t("data.clearConfirm"), onConfirm: run });
    }
  }

  return (
    <main className="screen">
      <Top title={t("data.title")} />
      <p className="t-body muted data__sub">{t("data.sub")}</p>

      <h2 className="section-h">{t("data.account")}</h2>
      <div className="list">
        <Fact label={t("data.email")} value={student.schoolEmail} />
        <Fact label={t("data.name")} value={personName(student.fullName, locale)} />
        <Fact label={t("data.display")} value={student.displayName ?? t("data.displayNone")} />
        <Fact label={t("data.photo")} value={t(student.photoUrl ? "data.yes" : "data.no")} />
        <Fact label={t("data.class")} value={student.class.name} />
        <Fact label={t("data.school")} value={personName(student.school.name, locale)} />
      </div>

      <h2 className="section-h">{t("data.activity")}</h2>
      {summary.status === "error" && !counts ? (
        <div role="alert">
          <p className="t-body muted">{t("data.loadFailed")}</p>
          <button className="btn btn--ghost btn--block" onClick={summary.refetch}>
            {t("state.retry")}
          </button>
        </div>
      ) : (
        <>
          <div className="list" aria-busy={!counts}>
            {COUNTS.map(({ key, value }) => (
              <div key={key} className="item data__count">
                <span className="grow item__main">
                  <span className="item__title">{t(key)}</span>
                </span>
                <span className="t-label data__n">{counts ? value(counts) : "–"}</span>
              </div>
            ))}
            <div className="item data__count">
              <span className="grow item__main">
                <span className="item__title">{t("data.n.push")}</span>
              </span>
              <span className="t-label data__n">{counts ? t(counts.pushSubscription ? "data.yes" : "data.no") : "–"}</span>
            </div>
          </div>
          <p className="t-cap data__note">{t("data.counts")}</p>
        </>
      )}

      <h2 className="section-h">{t("data.phone")}</h2>
      <p className="t-body muted data__text">
        {t("data.phoneBody")}{" "}
        <Link href="/app/privacy#phone" className="doc__link">
          {t("data.phoneList")}
        </Link>
      </p>
      <div className="list">
        <Row icon={TrashIcon} label={t("data.clear")} value={t("data.clearHint")} onClick={askToClear} chevron={false} />
      </div>

      <h2 className="section-h">{t("data.request")}</h2>
      <p className="t-body muted data__text">{t("data.requestBody")}</p>
      <div className="list">
        <Row icon={ArrowRightIcon} label={t("data.requestRights")} href="/app/privacy#rights" />
      </div>
      <p className="t-cap data__note">
        {t("data.requestContact")}{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="doc__link">
          {CONTACT_EMAIL}
        </a>
      </p>
    </main>
  );
}
