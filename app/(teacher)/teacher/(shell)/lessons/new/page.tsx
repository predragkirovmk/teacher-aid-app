import { Suspense } from "react";
import { PrepareLesson } from "@/components/teacher/PrepareLesson";

/** Prepare a lesson. The address may carry where the teacher came from (`?from=today`), which only the browser knows, so the page waits for it. */
export default function NewLessonPage() {
  return (
    <Suspense fallback={null}>
      <PrepareLesson />
    </Suspense>
  );
}
