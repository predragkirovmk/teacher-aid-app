import { Suspense } from "react";
import { DraftView } from "@/components/teacher/DraftView";

/** The questions of a generation, to read, at an address of their own so that a reload finds them (EC-LES-09). It may carry where the teacher started (`?from=today`), which only the browser knows, so the page waits for it. */
export default function DraftPage() {
  return (
    <Suspense fallback={null}>
      <DraftView />
    </Suspense>
  );
}
