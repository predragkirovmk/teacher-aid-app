import { Suspense } from "react";
import { Guide } from "@/components/teacher/Guide";

/**
 * The guide of a first run, and what Settings shows again on request. Needs a signed-in teacher, like every page but sign-in and Help.
 * Where it goes on to is in the address (`?next=`), which only the browser knows, so the guide waits for it.
 */
export default function WelcomePage() {
  return (
    <Suspense fallback={null}>
      <Guide />
    </Suspense>
  );
}
