"use client";

import { Gate } from "@/components/app/QueryState";
import { PracticeRow } from "@/components/app/practice/PracticeRows";
import { Top } from "@/components/app/Top";
import { usePracticeSets } from "@/lib/app/api/hooks";
import type { PracticeSet } from "@/lib/app/api/types";
import { useT } from "@/lib/app/i18n";
import { practiceStatus } from "@/lib/app/practice";

/** Every practice set the teachers sent: the ones to do first, the finished ones after. Practice is optional, so nothing here counts or nags. */
export default function PracticePage() {
  const { t } = useT();
  const sets = usePracticeSets();
  return (
    <Gate query={sets} header={<Top title={t("pr.title")} />}>
      {(all) => <PracticeList all={all} />}
    </Gate>
  );
}

function PracticeList({ all }: { all: PracticeSet[] }) {
  const { t } = useT();
  const open = all.filter((s) => practiceStatus(s) !== "done");
  const done = all.filter((s) => practiceStatus(s) === "done");
  return (
    <main className="screen">
      <Top title={t("pr.title")} />
      {all.length === 0 ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
          {t("pr.empty")}
        </p>
      ) : (
        <>
          <p className="muted sub">{t("pr.intro")}</p>
          <Group title={t("pr.group.open")} sets={open} />
          <Group title={t("pr.group.done")} sets={done} />
        </>
      )}
    </main>
  );
}

function Group({ title, sets }: { title: string; sets: PracticeSet[] }) {
  if (sets.length === 0) return null;
  return (
    <section>
      <h2 className="section-h">{title}</h2>
      <ul className="list">
        {sets.map((s) => (
          <li key={s.id}>
            <PracticeRow set={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}
