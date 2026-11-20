"use client";

import { DownloadSimpleIcon } from "@phosphor-icons/react";
import type { TeacherDocument } from "@/lib/app/api/types";
import { openDocument } from "@/lib/app/documents";
import { formatDate, formatSize } from "@/lib/app/format";
import { useT } from "@/lib/app/i18n";

/**
 * One teacher handout (no file icon, so the caption has the room): the title, then one line with the teacher (which gives way first), the date, the kind and the size, and the
 * "New" mark of the quiz rows until it is opened. A link to the signed address in a new tab: opening is a navigation, which needs
 * no `connect-src`, and there is no `download` attribute because a cross-origin address ignores it. Shared by Home and the documents screen.
 */
export function DocRow({ doc }: { doc: TeacherDocument }) {
  const { t, locale } = useT();
  return (
    <a className="item item--doc" href={doc.url} target="_blank" rel="noopener" onClick={(e) => openDocument(e, doc)}>
      <span className="grow">
        <span className="item__title" style={{ display: "block" }}>
          {doc.title}
        </span>
        <span className="t-cap res-cap">
          {!doc.opened && (
            <>
              <b className="tile__new res-cap__fixed">{t("home.new")}</b>
              <span className="res-cap__fixed">{" · "}</span>
            </>
          )}
          <span className="doc-cap__teacher">{doc.teacherName}</span>
          <span className="res-cap__fixed">{` · ${formatDate(doc.sentAt, locale)} · ${t(`doc.type.${doc.type}`)} · ${formatSize(doc.sizeBytes, locale)}`}</span>
        </span>
      </span>
      <DownloadSimpleIcon size={22} aria-hidden="true" />
    </a>
  );
}
