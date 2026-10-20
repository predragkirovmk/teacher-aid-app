"use client";

import { CameraIcon, LockIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useId, useRef, useState } from "react";
import { Avatar } from "@/components/app/Avatar";
import { useUI } from "@/components/app/ui";
import { saveProfile } from "@/lib/app/api/hooks";
import { toApiError } from "@/lib/app/api/errors";
import type { PhotoUpload } from "@/lib/app/api/types";
import { errorKey, useT } from "@/lib/app/i18n";
import { cleanName, NAME_MAX, nameError, PHOTO_MAX_BYTES, useSelf } from "@/lib/app/profile";
import { initials } from "@/lib/app/quiz";
import { useQT } from "@/lib/app/quiz-copy";

/** Centre-crop to a square and shrink to a small JPEG: the file the API takes, and a preview to show at once. */
async function toPhoto(file: File, size = 256): Promise<PhotoUpload> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob || blob.size > PHOTO_MAX_BYTES) throw new Error("photo too large");
  return { blob, preview: canvas.toDataURL("image/jpeg", 0.85) };
}

/**
 * Edit the display name and profile photo. Save stays off until something changed and the name is
 * valid; the name is checked as you type once you have touched it. Cancel with changes asks
 * before throwing them away.
 */
export function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { t } = useQT();
  const { t: tt } = useT();
  const { toast } = useUI();
  const me = useSelf();
  const id = useId();
  const [name, setName] = useState(me.name);
  // undefined keeps the photo the student has, null removes it, an upload replaces it.
  const [picked, setPicked] = useState<PhotoUpload | null | undefined>(undefined);
  const photo = picked === undefined ? me.photo : (picked?.preview ?? null);
  const [photoError, setPhotoError] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const [asking, setAsking] = useState(false);

  const error = nameError(name);
  const changed = cleanName(name) !== me.name || photo !== me.photo;
  const canSave = changed && !error && !saving;
  const showError = touched && error;
  const shown = initials(cleanName(name) || me.name);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPicked(await toPhoto(file));
      setPhotoError(false);
    } catch {
      setPhotoError(true);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await saveProfile({
        // Only what changed goes to the API.
        displayName: cleanName(name) !== me.name ? cleanName(name) : undefined,
        photo: photo !== me.photo ? (picked ?? null) : undefined,
      });
    } catch (e) {
      toast(tt(errorKey(toApiError(e).code)));
      setSaving(false);
      return;
    }
    toast(t("p.saved"));
    onDone();
  };

  return (
    <form
      className="pe"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="pe-bar">
        <button type="button" className="pe-bar__text" onClick={() => (changed ? setAsking(true) : onDone())}>
          {t("p.cancel")}
        </button>
        <h2 className="pe-bar__title">{t("p.editTitle")}</h2>
        <button type="submit" className="btn btn--primary pe-bar__save" disabled={!canSave}>
          {t("p.save")}
        </button>
      </div>

      {asking && (
        <div className="pe-ask" role="alert">
          <span className="t-label">{t("p.discard")}</span>
          <div className="pe-ask__btns">
            <button type="button" className="btn btn--ghost" onClick={() => setAsking(false)}>
              {t("p.keep")}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onDone}>
              {t("p.discardConfirm")}
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void pickPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="pe-preview">
        <button type="button" className="pe-photo-btn" aria-label={photo ? t("p.photoChange") : t("p.photo")} onClick={() => fileRef.current?.click()}>
          <Avatar key={`${!!photo}`} photo={photo} initials={shown} size={128} className="pe-pop" />
          <span className="pe-photo-badge" aria-hidden="true">
            <CameraIcon size={20} weight="fill" />
          </span>
        </button>
        <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
          <CameraIcon size={20} aria-hidden="true" />
          {photo ? t("p.photoChange") : t("p.photo")}
        </button>
        {photo && (
          <button type="button" className="btn btn--ghost" onClick={() => setPicked(null)}>
            <TrashIcon size={20} aria-hidden="true" />
            {t("p.photoRemove")}
          </button>
        )}
        {photoError && (
          <span className="pe-err" role="alert">
            <WarningCircleIcon size={20} color="var(--yellow)" aria-hidden="true" />
            {t("p.photoErr")}
          </span>
        )}
      </div>

      <div className="pe-field">
        <label htmlFor={`${id}-name`} className="t-label">
          {t("p.name")}
        </label>
        <input
          id={`${id}-name`}
          className="pe-input"
          value={name}
          maxLength={NAME_MAX}
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="done"
          spellCheck={false}
          aria-invalid={!!showError}
          aria-describedby={`${id}-help`}
          onChange={(e) => {
            setName(e.target.value);
            setTouched(true);
          }}
          onBlur={() => setTouched(true)}
        />
        <div className="pe-help" id={`${id}-help`}>
          {showError ? (
            <span className="pe-err">
              <WarningCircleIcon size={20} color="var(--yellow)" aria-hidden="true" />
              {t(`p.err.${error}`)}
            </span>
          ) : (
            <span className="t-cap">{t("p.nameHint")}</span>
          )}
          <span className="t-cap" aria-hidden="true">
            {Array.from(name).length}/{NAME_MAX}
          </span>
        </div>
      </div>

      <p className="t-cap pe-lock">
        <LockIcon size={14} aria-hidden="true" />
        {t("p.fromSchoolEdit")}
      </p>
    </form>
  );
}
