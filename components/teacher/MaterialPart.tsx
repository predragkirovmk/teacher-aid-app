"use client";

import { FileTextIcon, PencilLineIcon } from "@phosphor-icons/react";
import { useId, useState, type ChangeEvent, type DragEvent } from "react";
import { LESSON_UPLOAD_EXTENSIONS, TYPED_TEXT_MAX_CHARS } from "@/lib/teacher/lessons";
import { useT } from "@/lib/teacher/i18n";
import { fileSize, type MaterialKind, type MaterialProblem } from "@/lib/teacher/prepare";
import { Choices } from "./Choices";
import { Problem } from "./Problem";

/** `accept` for the file input: the two extensions, and the types a computer may give them. */
const ACCEPT = [...LESSON_UPLOAD_EXTENSIONS, "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].join(",");

/** The problems about the document, and the ones about the typed sentences: each is said under the thing it is about. */
const ABOUT_FILE: readonly MaterialProblem[] = ["no_file", "file_type", "file_too_large", "empty", "no_text", "gone"];
const ABOUT_TEXT: readonly MaterialProblem[] = ["text_none", "text_too_short", "text_too_long"];

/**
 * Part 2, "Материјал": a document or a few typed sentences, as two large choices and, under the one chosen, what it needs.
 * Nothing is chosen at first. The document has a button on a real file input (a file may also be dropped on the area, never
 * only that); once chosen it shows its name and size, with "Избери друг" and "Отстрани". The sentences are an 18px box with a
 * hint and no live count. What is wrong is said under the thing it is about, in words, and the page moves the focus there.
 */
export function MaterialPart({
  kind,
  onKind,
  file,
  onFile,
  text,
  onText,
  problem,
  problemError,
  onWriteInstead,
}: {
  kind: MaterialKind | null;
  onKind: (kind: MaterialKind) => void;
  /** A document chosen now, or one the form holds from before (a cancelled wait), whose size is then not always known. */
  file: { name: string; size: number | null } | null;
  onFile: (file: File | null) => void;
  text: string;
  onText: (text: string) => void;
  problem: MaterialProblem | undefined;
  /** What the API said, for a refusal the form has no words of its own for (`other`). */
  problemError: unknown;
  /** A scan has no text to read: switch this part to typing. */
  onWriteInstead: () => void;
}) {
  const { t, locale } = useT();
  const fileId = useId();
  const textId = useId();
  const hintId = useId();
  const problemId = useId();
  const [over, setOver] = useState(false);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    // Cleared at once, so choosing the same document again (after it was removed) is a change too.
    e.target.value = "";
    if (picked) onFile(picked);
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  };

  // An `other` refusal is about whichever the teacher is doing now.
  const about = (list: readonly MaterialProblem[], mine: MaterialKind) =>
    problem !== undefined && (list.includes(problem) || (problem === "other" && kind === mine));

  return (
    <section className="card prepare__part" aria-labelledby="prepare-2">
      <h2 id="prepare-2">{t("prepare.part2")}</h2>
      <div className="prepare__tiles" data-focus="kind">
        <Choices<MaterialKind>
          name="material"
          labelledBy="prepare-2"
          describedBy={problem === "pick" ? problemId : undefined}
          value={kind}
          onChange={onKind}
          options={[
            { value: "file", label: t("prepare.kind.file"), detail: t("prepare.kind.file.detail") },
            { value: "typed", label: t("prepare.kind.typed"), detail: t("prepare.kind.typed.detail") },
          ]}
        />
      </div>
      {problem === "pick" && <Problem id={problemId}>{t("prepare.problem.pick")}</Problem>}

      {kind === "file" && (
        <div className="prepare__group">
          <div
            className="drop"
            data-over={over}
            data-chosen={file !== null}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            <input
              id={fileId}
              type="file"
              className="sr"
              accept={ACCEPT}
              data-focus="file"
              aria-describedby={about(ABOUT_FILE, "file") ? problemId : undefined}
              onChange={choose}
            />
            {file ? (
              <div className="drop__file">
                <FileTextIcon size={40} aria-hidden="true" />
                <div className="drop__text">
                  <p className="sr">{t("prepare.file.chosen")}</p>
                  <p className="drop__name">{file.name}</p>
                  {file.size !== null && <p className="drop__size">{fileSize(file.size, locale)}</p>}
                </div>
              </div>
            ) : (
              <FileTextIcon size={40} aria-hidden="true" />
            )}
            <div className="drop__actions">
              {/* The label is the button: it opens the file input, which has the focus ring (see .drop). */}
              <label htmlFor={fileId} className="btn btn--secondary btn--big drop__pick">
                {file ? t("prepare.file.other") : t("prepare.file.pick")}
              </label>
              {file && (
                <button type="button" className="btn btn--secondary btn--big" onClick={() => onFile(null)}>
                  {t("prepare.file.remove")}
                </button>
              )}
            </div>
          </div>
          {about(ABOUT_FILE, "file") && <FileProblem problem={problem!} error={problemError} id={problemId} />}
          {problem === "no_text" && (
            <div>
              <button type="button" className="btn btn--secondary" onClick={onWriteInstead}>
                <PencilLineIcon size={24} aria-hidden="true" />
                {t("prepare.write.instead")}
              </button>
            </div>
          )}
          <p className="prepare__hint">{t("prepare.file.rules")}</p>
          <p className="prepare__hint">{t("prepare.file.privacy")}</p>
        </div>
      )}

      {kind === "typed" && (
        <div className="prepare__group">
          <label htmlFor={textId} className="prepare__label">
            <PencilLineIcon size={28} aria-hidden="true" />
            {t("prepare.typed.label")}
          </label>
          <p id={hintId} className="prepare__hint">
            {t("prepare.typed.hint")}
          </p>
          <textarea
            id={textId}
            className="field field--area"
            rows={6}
            data-focus="text"
            value={text}
            maxLength={TYPED_TEXT_MAX_CHARS}
            aria-invalid={about(ABOUT_TEXT, "typed")}
            aria-describedby={about(ABOUT_TEXT, "typed") ? `${hintId} ${problemId}` : hintId}
            onChange={(e) => onText(e.target.value)}
          />
          {/* The box takes no more than the API does, and says so when it has been reached. */}
          <p role="status" className={text.length >= TYPED_TEXT_MAX_CHARS ? "prepare__count" : "sr"}>
            {text.length >= TYPED_TEXT_MAX_CHARS ? t("prepare.typed.max") : ""}
          </p>
          {about(ABOUT_TEXT, "typed") && <TextProblem problem={problem!} error={problemError} id={problemId} />}
        </div>
      )}
    </section>
  );
}

function FileProblem({ problem, error, id }: { problem: MaterialProblem; error: unknown; id: string }) {
  const { t, te } = useT();
  switch (problem) {
    case "no_file":
      return <Problem id={id}>{t("prepare.problem.no_file")}</Problem>;
    case "file_type":
    case "file_too_large":
    case "empty":
    case "no_text":
    case "gone":
      return (
        <Problem id={id} title={t(`prepare.problem.${problem}.title`)}>
          {t(`prepare.problem.${problem}.body`)}
        </Problem>
      );
    default:
      return (
        <Problem id={id} title={t("prepare.fail.other.title")}>
          {te(error)}
        </Problem>
      );
  }
}

function TextProblem({ problem, error, id }: { problem: MaterialProblem; error: unknown; id: string }) {
  const { t, te } = useT();
  if (problem === "text_none") return <Problem id={id}>{t("prepare.problem.text_none")}</Problem>;
  if (problem === "text_too_short" || problem === "text_too_long")
    return (
      <Problem id={id} title={t(`prepare.problem.${problem}.title`)}>
        {t(`prepare.problem.${problem}.body`)}
      </Problem>
    );
  return (
    <Problem id={id} title={t("prepare.fail.other.title")}>
      {te(error)}
    </Problem>
  );
}
