"use client";

import { DocRow } from "@/components/app/DocRow";
import { QueryState } from "@/components/app/QueryState";
import { Top } from "@/components/app/Top";
import { useDocuments } from "@/lib/app/api/hooks";
import { useT } from "@/lib/app/i18n";

/** Teacher handouts (PROPOSED `GET /me/documents`, OPEN-18). With none, or while the API has not built them, a calm line says so. */
export default function Documents() {
  const { t } = useT();
  const docs = useDocuments();
  const list = docs.data;
  return (
    <main className="screen">
      <Top title={t("docs.title")} />
      <p className="t-cap sub">{t("docs.sub")}</p>
      {list === undefined && <QueryState query={docs} />}
      {list !== undefined && !list?.length && <p className="t-cap home-empty">{t("docs.none")}</p>}
      {!!list?.length && (
        <ul className="list">
          {list.map((d) => (
            <li key={d.id}>
              <DocRow doc={d} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
