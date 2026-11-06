"use client";

import { useParams } from "next/navigation";
import { Gate } from "@/components/app/QueryState";
import { SummaryEmpty, SummaryResult } from "@/components/app/Summary";
import { Top } from "@/components/app/Top";
import { useResult } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";

/** One finished session's summary: where the quiz's last screen leads. */
export default function SessionSummary() {
  const { t } = useT();
  const { id } = useParams<{ id: string }>();
  const result = useResult(decodeURIComponent(id));
  return (
    <Gate query={result} header={<Top title={t("sum.title")} />}>
      {(r) => (r ? <SummaryResult result={r} /> : <SummaryEmpty />)}
    </Gate>
  );
}
