"use client";

import { AlertCircle, Lock } from "lucide-react";
import { useId, useState } from "react";
import { Avatar, AVATAR_ICONS } from "@/components/app/Avatar";
import { useUI } from "@/components/app/ui";
import { AVATARS, type AvatarId } from "@/lib/app/avatars";
import { cleanName, NAME_MAX, nameError, useMe } from "@/lib/app/profile";
import { initials } from "@/lib/app/quiz";
import { useQT } from "@/lib/app/quiz-copy";
import { actions } from "@/lib/app/store";

/**
 * Edit the display name and avatar. Save stays off until something changed and the name is
 * valid; the name is checked as you type once you have touched it. Cancel with changes asks
 * before throwing them away.
 */
export function ProfileEditor({ onDone }: { onDone: () => void }) {
  const { t } = useQT();
  const { toast } = useUI();
  const me = useMe();
  const id = useId();
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState<AvatarId>(me.avatar);
  const [touched, setTouched] = useState(false);
  const [asking, setAsking] = useState(false);

  const error = nameError(name);
  const changed = cleanName(name) !== me.name || avatar !== me.avatar;
  const canSave = changed && !error;
  const showError = touched && error;
  const shown = initials(cleanName(name) || me.name);

  const save = () => {
    if (!canSave) return;
    actions.setProfile({ name: cleanName(name), avatar });
    toast(t("p.saved"));
    onDone();
  };

  return (
    <form
      className="pe"
      onSubmit={(e) => {
        e.preventDefault();
        save();
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

      <div className="pe-preview">
        <Avatar key={avatar} avatar={avatar} initials={shown} size={104} className="pe-pop" />
        <span className="t-label muted" id={`${id}-av`}>
          {t("p.avatar")}
        </span>
      </div>

      <div className="pe-grid" role="radiogroup" aria-labelledby={`${id}-av`}>
        {AVATARS.map((a) => {
          const Icon = a === "initials" ? null : AVATAR_ICONS[a];
          return (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={avatar === a}
              aria-label={t(`p.av.${a}`)}
              className="pe-pick"
              onClick={() => setAvatar(a)}
            >
              {Icon ? <Icon size={30} strokeWidth={2} aria-hidden="true" /> : shown}
            </button>
          );
        })}
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
              <AlertCircle size={20} strokeWidth={2} color="var(--yellow)" aria-hidden="true" />
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
        <Lock size={14} strokeWidth={2} aria-hidden="true" />
        {t("p.fromSchoolEdit")}
      </p>
    </form>
  );
}
