import type { Locale } from "../api/types";
import type { TFn } from "../i18n";

/**
 * The payload the demo's "send a test notification" hands the worker: what the API would push for a practice set the
 * teacher sent (PROPOSED shape, see public/app-push.js), in the student's language, with the ids of the practice set
 * the demo starts with so a tap opens it. Like the real one it holds no score, no name and no answer.
 */
export function testPayload(t: TFn, locale: Locale) {
  return {
    v: 1,
    id: "n-practice-ps-session-math-1",
    kind: "practice_set_sent",
    locale,
    title: t("notif.practice_set_sent.title", { subject: t("subj.math") }),
    body: t("notif.practice_set_sent.body"),
    payload: { course_id: "math", subject_id: "math", practice_set_id: "ps-session-math-1" },
  };
}
