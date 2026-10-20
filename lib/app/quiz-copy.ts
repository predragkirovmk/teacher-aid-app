"use client";

import { useCallback } from "react";
import type { ApiErrorCode } from "./api/errors";
import type { Locale } from "./api/types";
import { errorKey, useT } from "./i18n";
import { useLocale } from "./locale";

/** Text for the live quiz and the profile editor, kept apart from i18n.ts while that file is in flux. */
const en = {
  "q.leave": "Leave the quiz",
  "q.leaveTitle": "Leave the quiz? Points you have earned stay.",
  "q.leaveConfirm": "Leave",
  "q.joined.title": "You're in!",
  "q.joined.sub": "{subject} · {teacher}",
  "q.joined.time": "Attendance recorded at {time}",
  "q.opening": "Opening the quiz",
  "q.live": "Live quiz",
  "q.meta": "{teacher} · {n} questions",
  "q.you": "That's you · tap to edit",
  "q.joinedCount": "classmates joined",
  "q.waitTeacher": "Waiting for the teacher to start",
  "q.keepOpen": "Keep your phone open on this screen.",
  "q.progress": "Question {n} of {total}",
  "q.secondsLeft": "{n} seconds left",
  "q.tfPrompt": "True or false?",
  "q.true": "True",
  "q.false": "False",
  "q.tapHint": "Tap one answer to lock it in",
  "q.locked": "Your answer is locked in",
  "q.answered": "of {total} answered",
  "q.waitNote": "You can't change it now. The result comes when time is up or everyone has answered.",
  "q.right": "Correct!",
  "q.wrong": "Wrong",
  "q.timeout": "Time ran out",
  "q.wrongSub": "Now you know for next time.",
  "q.timeoutSub": "No answer this time. Here is the right one.",
  "q.breakdown": "{base} for the right answer · {bonus} for speed",
  "q.breakdownBase": "{base} for the right answer",
  "q.total": "Points in this quiz",
  "q.correctAnswer": "Correct answer",
  "q.yourAnswer": "Your answer: {letter}, {text}",
  "q.yourAnswerTf": "Your answer: {text}",
  "q.doneOf": "{n} of {total} questions",
  "q.place": "place in the quiz",
  "q.up1": "Up one place",
  "q.upN": "Up {n} places",
  "q.down1": "Down one place",
  "q.downN": "Down {n} places",
  "q.same": "Holding your place",
  "q.board": "Quiz ranking",
  "q.me": "You, {name}",
  "q.next": "Next question soon",
  "q.nextNote": "The teacher sends it when the class is ready.",
  "q.last": "That was the last question",
  "q.lastNote": "The teacher closes the quiz. Your points are saved.",
  "q.home": "Back to Home",
  "q.unknown.title": "Code not recognized",
  "q.unknown.body": "This is not your class QR, or the code has expired. Scan the code on the board now.",
  "q.unknown.cta": "Scan again",
  "q.pts": "{n} pts",

  "p.title": "Profile",
  "p.edit": "Edit",
  "p.editTitle": "Edit profile",
  "p.cancel": "Cancel",
  "p.save": "Save",
  "p.photo": "Add your photo",
  "p.photoChange": "Change photo",
  "p.photoRemove": "Remove photo",
  "p.photoErr": "That file is not a photo we can use.",
  "p.name": "Display name",
  "p.nameHint": "Your classmates see this in the quiz.",
  "p.seen": "Your classmates see this name in the quiz",
  "p.class": "Class",
  "p.school": "School",
  "p.fromSchool": "From your school account, not changed here",
  "p.fromSchoolEdit": "Class and school come from your school account.",
  "p.err.empty": "Enter a name.",
  "p.err.short": "The name needs at least 2 characters.",
  "p.err.chars": "Use letters, spaces and hyphens only.",
  "p.saved": "Profile saved",
  "p.discard": "Discard your changes?",
  "p.discardConfirm": "Discard",
  "p.keep": "Keep editing",
};

type Key = keyof typeof en;

const mk: Record<Key, string> = {
  "q.leave": "Напушти го квизот",
  "q.leaveTitle": "Да го напуштиш квизот? Освоените поени остануваат.",
  "q.leaveConfirm": "Напушти",
  "q.joined.title": "Тука си!",
  "q.joined.sub": "{subject} · {teacher}",
  "q.joined.time": "Присуството е забележано во {time}",
  "q.opening": "Квизот се отвора",
  "q.live": "Квиз во живо",
  "q.meta": "{teacher} · {n} прашања",
  "q.you": "Тоа си ти · допри за уредување",
  "q.joinedCount": "соученици влегоа",
  "q.waitTeacher": "Чекаме наставникот да почне",
  "q.keepOpen": "Остави го телефонот отворен на овој екран.",
  "q.progress": "Прашање {n} од {total}",
  "q.secondsLeft": "Уште {n} секунди",
  "q.tfPrompt": "Точно или неточно?",
  "q.true": "Точно",
  "q.false": "Неточно",
  "q.tapHint": "Допри еден одговор за да го заклучиш",
  "q.locked": "Твојот одговор е заклучен",
  "q.answered": "од {total} одговорија",
  "q.waitNote": "Одговорот не може да се смени. Резултатот стига кога ќе заврши времето или кога сите ќе одговорат.",
  "q.right": "Точно!",
  "q.wrong": "Неточно",
  "q.timeout": "Времето истече",
  "q.wrongSub": "Сега го знаеш за следниот пат.",
  "q.timeoutSub": "Овој пат без одговор. Еве го точниот.",
  "q.breakdown": "{base} за точен одговор · {bonus} за брзина",
  "q.breakdownBase": "{base} за точен одговор",
  "q.total": "Поени во квизот",
  "q.correctAnswer": "Точен одговор",
  "q.yourAnswer": "Твој одговор: {letter}, {text}",
  "q.yourAnswerTf": "Твој одговор: {text}",
  "q.doneOf": "{n} од {total} прашања",
  "q.place": "место во квизот",
  "q.up1": "Едно место нагоре",
  "q.upN": "{n} места нагоре",
  "q.down1": "Едно место надолу",
  "q.downN": "{n} места надолу",
  "q.same": "Го држиш местото",
  "q.board": "Поредок во квизот",
  "q.me": "Ти, {name}",
  "q.next": "Следното прашање наскоро",
  "q.nextNote": "Наставникот го пушта кога класот е спремен.",
  "q.last": "Тоа беше последното прашање",
  "q.lastNote": "Наставникот го затвора квизот. Поените се зачувани.",
  "q.home": "Назад на почетна",
  "q.unknown.title": "Кодот не е препознаен",
  "q.unknown.body": "Ова не е QR кодот на часот, или кодот истекол. Скенирај го кодот што е на таблата сега.",
  "q.unknown.cta": "Скенирај пак",
  "q.pts": "{n} поени",

  "p.title": "Профил",
  "p.edit": "Уреди",
  "p.editTitle": "Уреди профил",
  "p.cancel": "Откажи",
  "p.save": "Зачувај",
  "p.photo": "Додај своја фотографија",
  "p.photoChange": "Промени фотографија",
  "p.photoRemove": "Отстрани фотографија",
  "p.photoErr": "Оваа датотека не е фотографија што можеме да ја користиме.",
  "p.name": "Прикажано име",
  "p.nameHint": "Ова го гледаат соучениците во квизот.",
  "p.seen": "Ова име го гледаат соучениците во квизот",
  "p.class": "Клас",
  "p.school": "Училиште",
  "p.fromSchool": "Од училишната сметка, не се менува тука",
  "p.fromSchoolEdit": "Класот и училиштето доаѓаат од училишната сметка.",
  "p.err.empty": "Внеси име.",
  "p.err.short": "Името треба да има најмалку 2 знаци.",
  "p.err.chars": "Користи само букви, празни места и цртичка.",
  "p.saved": "Профилот е зачуван",
  "p.discard": "Да ги отфрлиш промените?",
  "p.discardConfirm": "Отфрли",
  "p.keep": "Продолжи",
};

export const dictionaries: Record<Locale, Record<Key, string>> = { en, mk };

export type QKey = Key;

export function useQT() {
  const locale = useLocale();
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => {
      let out = dictionaries[locale][key];
      if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
      return out;
    },
    [locale],
  );
  return { t, locale };
}

/** Codes that mean "this is not a code that opens your class's quiz". */
const NOT_A_CODE: readonly ApiErrorCode[] = ["token_expired", "not_found", "not_enrolled"];

/** The title and body for a join that failed: the code-not-recognized page, or what went wrong. */
export function useJoinFailureCopy() {
  const { t } = useQT();
  const { t: tt } = useT();
  return (code?: ApiErrorCode) =>
    !code || NOT_A_CODE.includes(code)
      ? { title: t("q.unknown.title"), body: t("q.unknown.body"), cta: t("q.unknown.cta") }
      : { title: tt("error.title"), body: tt(errorKey(code)), cta: t("q.unknown.cta") };
}
