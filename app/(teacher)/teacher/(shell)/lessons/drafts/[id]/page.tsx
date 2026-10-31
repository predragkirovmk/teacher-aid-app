import { Suspense } from "react";
import { DraftPage } from "@/components/teacher/DraftPage";

/** A draft: the wait for it, its failure, or the editor, at an address of its own so that a reload finds it (EC-LES-09). It may carry where the teacher started (`?from=today`), which only the browser knows, so the page waits for it. */
export default function DraftRoute() {
  return (
    <Suspense fallback={null}>
      <DraftPage />
    </Suspense>
  );
}
