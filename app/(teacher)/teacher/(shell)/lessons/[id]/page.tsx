import { Suspense } from "react";
import { LessonView } from "@/components/teacher/LessonView";

/** One lesson, to read. The address carries where the teacher came from (`?from=today`), which only the browser knows, so the view waits for it. */
export default function LessonPage() {
  return (
    <Suspense fallback={null}>
      <LessonView />
    </Suspense>
  );
}
