"use client";

import { Gate } from "@/components/app/QueryState";
import { SummaryEmpty, SummaryResult } from "@/components/app/Summary";
import { Top } from "@/components/app/Top";
import { useLatestResult } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";

export default function Summary() {
  const { t } = useT();
  const latest = useLatestResult();
  return (
    <Gate query={latest} header={<Top title={t("sum.title")} />}>
      {(result) => (result ? <SummaryResult result={result} /> : <SummaryEmpty />)}
    </Gate>
  );
}
