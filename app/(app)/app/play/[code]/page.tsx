"use client";

import { useParams } from "next/navigation";
import { JoinFailureScreen } from "@/components/app/quiz/JoinFailure";
import { Play } from "@/components/app/quiz/Play";
import { toApiError } from "@/lib/app/api/errors";
import { useAuth, useCourse, useJoinSession } from "@/lib/app/api/hooks";
import type { JoinedSession } from "@/lib/app/api/types";

/** A code that came out of a link may be percent-encoded, and a hand-edited one may not decode at all. */
const decode = (code: string) => {
  try {
    return decodeURIComponent(code);
  } catch {
    return code;
  }
};

/** The live quiz a class QR opens: /app/play/<class code>. Joining the session is the check-in. */
export default function PlayPage() {
  const params = useParams<{ code: string }>();
  const code = decode(params.code);
  const signedIn = useAuth().status === "signedIn";
  const join = useJoinSession(code, signedIn);
  if (join.status === "failed") return <JoinFailureScreen code={join.error.code} onRetry={join.retry} />;
  if (join.status === "joining") return <main className="screen screen--bare q" />;
  return <Joined key={join.join.session.id} join={join.join} retry={join.retry} />;
}

function Joined({ join, retry }: { join: JoinedSession; retry: () => void }) {
  const course = useCourse(join.session.courseId);
  if (course.status === "error") return <JoinFailureScreen code={toApiError(course.error).code} onRetry={retry} />;
  if (course.data === undefined) return <main className="screen screen--bare q" />;
  // A session of a course the student's list does not have: nothing the app can draw.
  if (course.data === null) return <JoinFailureScreen code="not_found" onRetry={retry} />;
  return <Play course={course.data} join={join} />;
}
