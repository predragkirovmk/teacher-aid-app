"use client";

import { Mark } from "@/components/app/Mark";
import { useT } from "@/lib/teacher/i18n";

/**
 * What is drawn while the app does not yet know who is signed in, and while it sends the teacher somewhere else: the logo
 * on the ground and nothing else. The server draws it for every page that needs a teacher, so nothing protected is ever in
 * the markup, and the render that hydrates it draws the same.
 */
export function Splash() {
  const { t } = useT();
  return (
    <main className="solo" aria-busy="true">
      <title>TeacherAid</title>
      <Mark size={72} />
      <p className="sr" role="status">
        {t("loading")}
      </p>
    </main>
  );
}
