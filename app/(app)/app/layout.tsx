import type { ReactNode } from "react";
import { Shell } from "@/components/app/Shell";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
