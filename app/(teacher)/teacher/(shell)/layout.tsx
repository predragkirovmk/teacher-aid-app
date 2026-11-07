import type { ReactNode } from "react";
import { Shell } from "@/components/teacher/Shell";

export default function TeacherShellLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
