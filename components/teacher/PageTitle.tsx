/**
 * The browser tab and screen readers name each page. The language is the teacher's choice and lives
 * in the browser, so the title is rendered here, in the page, where React moves it into the head
 * and keeps it in step with the language.
 */
export function PageTitle({ title }: { title: string }) {
  return <title>{`${title} · TeacherAid`}</title>;
}
