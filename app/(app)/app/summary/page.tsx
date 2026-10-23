"use client";

import { Gate } from "@/components/app/QueryState";
import { ResultList } from "@/components/app/Results";
import { Top } from "@/components/app/Top";
import { useResults } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";

/** Every finished lesson, newest first; each opens its summary. */
export default function Results() {
  const { t } = useT();
  const results = useResults();
  return (
    <Gate query={results} header={<Top title={t("res.title")} />}>
      {(all) => (
        <main className="screen">
          <Top title={t("res.title")} />
          {all.length === 0 ? (
            <p className="muted" style={{ textAlign: "center", marginTop: 60 }}>
              {t("sum.empty")}
            </p>
          ) : (
            <ResultList results={all} />
          )}
        </main>
      )}
    </Gate>
  );
}
