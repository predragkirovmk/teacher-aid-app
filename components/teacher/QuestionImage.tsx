"use client";

import { ArrowClockwiseIcon, ArrowsClockwiseIcon, ArrowUUpLeftIcon, CircleNotchIcon, ImageIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type Dispatch } from "react";
import { uploadMedia } from "@/lib/teacher/api/hooks";
import { ApiError } from "@/lib/teacher/api/errors";
import type { QuestionMedia } from "@/lib/teacher/api/types";
import type { EditorAction } from "@/lib/teacher/editor-state";
import { fileSize } from "@/lib/teacher/prepare";
import { checkImage, IMAGE_ACCEPT, IMAGE_ALT_MAX_CHARS, IMAGE_MAX_BYTES } from "@/lib/teacher/images";
import { useT } from "@/lib/teacher/i18n";
import { Problem } from "./Problem";

/**
 * The picture of a question (FR-LES-10, FR-LES-19), optional. "Додај слика" is the label of a real file input, so a keyboard and a screen
 * reader find it as a file field; once a picture is there it is shown, with "Замени" and "Отстрани", and a box to say in a few words what it
 * shows, for students who cannot see it well (recommended, never required). The picture is added with a calm wait; what is wrong with it (not a
 * JPEG, PNG or WebP, too large, unreadable, no connection) is said in words, right here, and the old picture stays until a new one has arrived.
 *
 * Removing the picture is one press, so it can be taken back: the line that says it is removed has "Врати ја сликата", which puts the same picture
 * and its words back (the API keeps a picture nothing holds any more for a day, so the address is still good).
 *
 * The picture and its words go into the lesson through the editor's own actions, which name the question: a picture takes a moment, and what
 * the teacher wrote meanwhile is not undone by it, nor is it lost if the question is closed meanwhile.
 */
export function QuestionImage({ questionId, media, dispatch }: { questionId: string; media: QuestionMedia | null; dispatch: Dispatch<EditorAction> }) {
  const { t, te, locale } = useT();
  const fileId = useId();
  const altId = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  // The file that could not be sent for want of a connection, so that trying again does not ask for it again.
  const [again, setAgain] = useState<File | null>(null);
  const [said, setSaid] = useState("");
  // The picture that was just removed, to be put back; gone as soon as another is added or the question is closed.
  const [removed, setRemoved] = useState<QuestionMedia | null>(null);
  const alive = useRef(true);
  const altBox = useRef<HTMLTextAreaElement>(null);
  const toAlt = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A picture that has just been added is described next: the focus goes to the box for its words.
  useEffect(() => {
    if (toAlt.current && media) {
      toAlt.current = false;
      altBox.current?.focus();
    }
  }, [media]);

  const add = async (file: File) => {
    if (busy) return;
    setProblem(null);
    setAgain(null);
    const wrong = checkImage(file);
    if (wrong) {
      setProblem(new ApiError("validation_failed", { reason: wrong }));
      return;
    }
    setBusy(true);
    // Said in the line that is always on the page: a line that appears with its words is often not read out, one that changes is.
    setSaid(t("image.busy"));
    try {
      const uploaded = await uploadMedia(file);
      // A new picture is not described yet: the words of the one it replaces would be about something else.
      toAlt.current = true;
      setRemoved(null);
      dispatch({ type: "media", id: questionId, media: { id: uploaded.id, url: uploaded.url, alt: null } });
      if (alive.current) setSaid(t("image.added"));
    } catch (e) {
      if (alive.current) {
        setSaid("");
        setProblem(e);
        // A failure of the connection or of the server is worth trying again with the same file; a refusal of the file is not.
        setAgain(e instanceof ApiError && e.code === "validation_failed" ? null : file);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Cleared at once, so choosing the same file again (after it was refused, or removed) is a change too.
    e.target.value = "";
    if (picked) void add(picked);
  };

  const remove = () => {
    setRemoved(media);
    dispatch({ type: "media", id: questionId, media: null });
    setProblem(null);
    setAgain(null);
    setSaid(t("image.removed"));
    // The button that was pressed goes with the picture: the way to add another is where it was.
    requestAnimationFrame(() => document.getElementById(fileId)?.focus());
  };

  const restore = () => {
    if (!removed) return;
    dispatch({ type: "media", id: questionId, media: removed });
    setRemoved(null);
    setSaid(t("image.restored"));
    // The button that was pressed goes with the line; the picture's own buttons are where it was.
    requestAnimationFrame(() => document.getElementById(fileId)?.focus());
  };

  return (
    <div className="editor__field imagefield" data-field="image">
      <h4 className="editor__label">{t("image.title")}</h4>
      <p className="editor__hint">{t("image.hint")}</p>
      <input
        id={fileId}
        type="file"
        className="sr"
        accept={IMAGE_ACCEPT}
        data-focus="image-file"
        aria-describedby={problem !== null ? `${fileId}-problem` : undefined}
        onChange={choose}
      />
      <p role="status" className="sr">
        {said}
      </p>

      {media && (
        // eslint-disable-next-line @next/next/no-img-element -- the picture comes from the API, already made phone-sized (FR-LES-11)
        <img className="imagefield__preview" src={media.url} alt={media.alt || t("question.image")} />
      )}

      {busy ? (
        <p className="imagefield__busy">
          <CircleNotchIcon size={28} aria-hidden="true" />
          {t("image.busy")}
        </p>
      ) : (
        <div className="imagefield__actions">
          {media ? (
            <>
              {/* The label is the button: it opens the file input, which has the focus ring (see .imagefield). */}
              <label htmlFor={fileId} className="btn btn--secondary imagefield__pick">
                <ArrowsClockwiseIcon size={24} aria-hidden="true" />
                <span>
                  {t("image.replace")}
                  <span className="sr">{t("image.replace.label")}</span>
                </span>
              </label>
              <button type="button" className="btn btn--secondary" aria-label={t("image.remove.label")} onClick={remove}>
                <TrashIcon size={24} aria-hidden="true" />
                {t("image.remove")}
              </button>
            </>
          ) : (
            <>
              <label htmlFor={fileId} className="btn btn--secondary imagefield__pick">
                <ImageIcon size={24} aria-hidden="true" />
                {t("image.add")}
              </label>
              {/* Beside the button where there is room, so that the question does not grow by a line for it. */}
              <p className="editor__hint imagefield__rules">{t("image.rules", { size: fileSize(IMAGE_MAX_BYTES, locale) })}</p>
            </>
          )}
        </div>
      )}

      {removed && !media && !busy && (
        <div className="imagefield__removed">
          <p>{t("image.removed")}</p>
          <button type="button" className="btn btn--secondary" onClick={restore}>
            <ArrowUUpLeftIcon size={24} weight="bold" aria-hidden="true" />
            {t("image.restore")}
          </button>
        </div>
      )}

      {problem !== null && (
        <div id={`${fileId}-problem`} className="imagefield__problem">
          <Problem title={t("image.problem.title")}>{te(problem)}</Problem>
          {again && (
            <button type="button" className="btn btn--secondary" onClick={() => void add(again)}>
              <ArrowClockwiseIcon size={24} weight="bold" aria-hidden="true" />
              {t("image.retry")}
            </button>
          )}
        </div>
      )}

      {media && (
        <div className="editor__field imagefield__alt">
          <label htmlFor={altId} className="editor__label">
            {t("image.alt")}
          </label>
          <p id={`${altId}-hint`} className="editor__hint">
            {t("image.alt.hint")}
          </p>
          {/* Up to 200 characters: three lines are all in view, where a single line would hide most of what was written. A line break is a space. */}
          <textarea
            ref={altBox}
            id={altId}
            className="field field--area field--short"
            rows={3}
            maxLength={IMAGE_ALT_MAX_CHARS}
            aria-describedby={`${altId}-hint`}
            value={media.alt ?? ""}
            onChange={(e) => dispatch({ type: "alt", id: questionId, alt: e.target.value.replace(/\s*\n\s*/g, " ") })}
          />
        </div>
      )}
    </div>
  );
}
