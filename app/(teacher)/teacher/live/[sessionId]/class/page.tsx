import { ClassView } from "@/components/teacher/ClassView";

/**
 * The projected window of a lesson. It sits beside the sign-in and welcome screens, not under the shell, so it has no sidebar; it is
 * still behind the gate like every page but sign-in and Help, with the same sign-in as the console's window (BR-AUTH-08).
 */
export default function ClassViewPage() {
  return <ClassView />;
}
