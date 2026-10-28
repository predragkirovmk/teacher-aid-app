"use client";

import { useCallback } from "react";
import { useTeacher, type Locale, type SchoolType } from "./store";

/**
 * Every string of the teacher app. A plain string reads the same everywhere; a { school, uni } pair
 * is worded for a secondary school or a university. Macedonian is the default and uses the polite
 * "Вие". Any string may use {name}-style variables, and always has {students}, {classes} and
 * {teacher} in the wording of the chosen school type.
 */
type Entry = string | { school: string; uni: string };

const en = {
  "skip": "Skip to content",
  "close": "Close",
  "back": "Back",

  "nav.menu": "Menu",
  "nav.main": "Main menu",
  "nav.more": "Settings and help",
  "nav.today": "Today",
  "nav.lessons": "Lessons",
  "nav.classes": { school: "Classes", uni: "Groups" },
  "nav.library": "Library",
  "nav.settings": "Settings",
  "nav.help": "Help",
  "nav.logout": "Sign out",
  "nav.home": "TeacherAid, go to Today",

  "noun.students": { school: "students", uni: "students" },
  "noun.classes": { school: "classes", uni: "groups" },
  "noun.teacher": { school: "teacher", uni: "professor" },

  "user.first": "Marija",
  "user.name": "Marija Petrovska",
  "user.link": "{name}, settings",

  "logout.title": "Do you want to sign out?",
  "logout.stay": "No, stay",
  "logout.confirm": "Yes, sign me out",

  "soon.title": "Coming soon",
  "soon.body": "This part is still being built.",

  "today.title": "Today",
  "today.greet.morning": "Good morning, {name}",
  "today.greet.day": "Good afternoon, {name}",
  "today.greet.evening": "Good evening, {name}",
  "today.greet.neutral": "Welcome, {name}",
  "today.empty.title": "You have no prepared lessons",
  "today.empty.body": "Prepare a lesson ahead of time. When the day comes, you will find it here and can run it with your {students}.",
  "today.empty.cta": "Prepare a lesson",

  "lessons.title": "Lessons",
  "lessons.what": "All your lessons will be here: the prepared ones, the ones you have run and the ones in progress.",
  "lessonsNew.title": "Prepare a lesson",
  "lessonsNew.what": "Here you will add a text or a document, and TeacherAid will suggest short questions for your {students}.",
  "classes.title": { school: "Classes", uni: "Groups" },
  "classes.what": "Here you will see your {classes}, who comes to the lesson and how your {students} answer.",
  "library.title": "Library",
  "library.what": "Your materials and questions will be kept here, so you can use them again.",

  "settings.title": "Settings",
  "settings.who": "{name}, {teacher}",
  "settings.language": "Language",
  "lang.mk": "Македонски",
  "lang.en": "English",
  "settings.school": "Type of institution",
  "settings.school.demo": "Demo setting",
  "settings.school.hint":
    "This changes the words you see, for example “{classes}” and “{students}”. In the real version your institution will set it. For now it is only for trying out.",
  "school.school": "Secondary school",
  "school.university": "University",
  "install.title": "Install on this computer",
  "install.hint": "TeacherAid opens in its own window, like any other program.",
  "install.button": "Install",
  "install.done": "Done. TeacherAid is installed on this computer.",
  "install.steps": "How to install:",
  "install.step1": "Look at the address bar at the top of Chrome or Edge.",
  "install.step2": "On the right side of the bar, click the small install icon (a monitor with a down arrow).",
  "install.step3": "Confirm with “Install”.",
  "install.nothing":
    "Cannot see the icon? Open the browser menu (three dots, top right) and look for “Install”.",

  "help.title": "Help",
  "help.what": "Answers to the most common questions.",
  "help.q1": "How do I prepare a lesson?",
  "help.a1": "On the Today page, press “Prepare a lesson”. This part will be ready soon.",
  "help.q2": "How do my {students} join the lesson?",
  "help.a2": "They scan the QR code with their phones. This is also how attendance is recorded.",
  "help.q3": "Do I need to save my work?",
  "help.a3": "No. Your work saves itself.",
  "help.q4": "How do I install TeacherAid on my computer?",
  "help.a4": "Open Settings and choose “Install on this computer”.",
  "help.contact.title": "Did not find the answer?",
  "help.contact.body": "Write to us and we will help.",
  "help.contact.cta": "Write to us",
  "help.contact.email": "hello@teacheraid.education",

  "signedout.title": "You have signed out",
  "signedout.body": "This is a demo version. Signing in will be added soon.",
  "signedout.cta": "Back to Today",

  "notfound.title": "This page does not exist",
  "notfound.body": "The link may be old or wrong. Go back to the start.",
  "notfound.cta": "Go to Today",

  "error.title": "Something went wrong",
  "error.body": "This screen could not be shown. Please try again. If that does not help, go back to Today.",
  "error.retry": "Try again",
  "error.home": "Go to Today",
} satisfies Record<string, Entry>;

export type Key = keyof typeof en;

const mk: Record<Key, Entry> = {
  "skip": "Прескокни кон содржината",
  "close": "Затвори",
  "back": "Назад",

  "nav.menu": "Мени",
  "nav.main": "Главно мени",
  "nav.more": "Поставки и помош",
  "nav.today": "Денес",
  "nav.lessons": "Лекции",
  "nav.classes": { school: "Класови", uni: "Групи" },
  "nav.library": "Библиотека",
  "nav.settings": "Поставки",
  "nav.help": "Помош",
  "nav.logout": "Одјави се",
  "nav.home": "TeacherAid, оди на Денес",

  "noun.students": { school: "ученици", uni: "студенти" },
  "noun.classes": { school: "класови", uni: "групи" },
  "noun.teacher": { school: "наставник", uni: "професор" },

  "user.first": "Марија",
  "user.name": "Марија Петровска",
  "user.link": "{name}, поставки",

  "logout.title": "Дали сакате да се одјавите?",
  "logout.stay": "Не, остани",
  "logout.confirm": "Да, одјави ме",

  "soon.title": "Наскоро",
  "soon.body": "Овој дел сè уште се гради.",

  "today.title": "Денес",
  "today.greet.morning": "Добро утро, {name}",
  "today.greet.day": "Добар ден, {name}",
  "today.greet.evening": "Добра вечер, {name}",
  "today.greet.neutral": "Добредојдовте, {name}",
  "today.empty.title": "Немате подготвени лекции",
  "today.empty.body": "Подгответе лекција однапред. Кога ќе дојде денот, ќе ја најдете тука и ќе можете да ја одржите со Вашите {students}.",
  "today.empty.cta": "Подготви лекција",

  "lessons.title": "Лекции",
  "lessons.what": "Тука ќе ги најдете сите Ваши лекции: подготвените, одржаните и оние што се во тек.",
  "lessonsNew.title": "Подготви лекција",
  "lessonsNew.what": "Тука ќе додадете текст или документ, а TeacherAid ќе предложи кратки прашања за Вашите {students}.",
  "classes.title": { school: "Класови", uni: "Групи" },
  "classes.what": "Тука ќе ги видите Вашите {classes}, кој доаѓа на час и како одговараат Вашите {students}.",
  "library.title": "Библиотека",
  "library.what": "Тука ќе се чуваат Вашите материјали и прашања, за да можете повторно да ги користите.",

  "settings.title": "Поставки",
  "settings.who": "{name}, {teacher}",
  "settings.language": "Јазик",
  "lang.mk": "Македонски",
  "lang.en": "English",
  "settings.school": "Тип на установа",
  "settings.school.demo": "Демо поставка",
  "settings.school.hint":
    "Ова ги менува зборовите што ги гледате, на пример „{classes}“ и „{students}“. Во вистинската верзија тоа ќе го одреди Вашата установа. Засега е само за проба.",
  "school.school": "Средно училиште",
  "school.university": "Факултет",
  "install.title": "Инсталирај на компјутерот",
  "install.hint": "TeacherAid се отвора во свој прозорец, како секоја друга програма.",
  "install.button": "Инсталирај",
  "install.done": "Готово. TeacherAid е инсталиран на овој компјутер.",
  "install.steps": "Како да инсталирате:",
  "install.step1": "Погледнете ја адресната лента на врвот од Chrome или Edge.",
  "install.step2": "На десната страна од лентата кликнете на малата икона за инсталирање (монитор со стрелка надолу).",
  "install.step3": "Потврдете со „Инсталирај“.",
  "install.nothing": "Не ја гледате иконата? Отворете го менито на прелистувачот (три точки горе десно) и побарајте „Инсталирај“.",

  "help.title": "Помош",
  "help.what": "Одговори на најчестите прашања.",
  "help.q1": "Како да подготвам лекција?",
  "help.a1": "На страницата „Денес“ притиснете „Подготви лекција“. Овој дел наскоро ќе биде готов.",
  "help.q2": "Како се приклучуваат Вашите {students} на часот?",
  "help.a2": "Го скенираат QR-кодот со својот телефон. Така се бележи и присуството.",
  "help.q3": "Дали треба да ја зачувам работата?",
  "help.a3": "Не. Вашата работа се зачувува сама.",
  "help.q4": "Како да го инсталирам TeacherAid на компјутерот?",
  "help.a4": "Отворете ги Поставките и изберете „Инсталирај на компјутерот“.",
  "help.contact.title": "Не го најдовте одговорот?",
  "help.contact.body": "Пишете ни и ќе Ви помогнеме.",
  "help.contact.cta": "Пишете ни",
  "help.contact.email": "hello@teacheraid.education",

  "signedout.title": "Се одјавивте",
  "signedout.body": "Ова е демо верзија. Најавувањето ќе се додаде наскоро.",
  "signedout.cta": "Врати се на Денес",

  "notfound.title": "Оваа страница не постои",
  "notfound.body": "Можеби врската е стара или погрешна. Вратете се на почеток.",
  "notfound.cta": "Оди на Денес",

  "error.title": "Нешто не е во ред",
  "error.body": "Овој екран не можеше да се прикаже. Обидете се повторно. Ако не помогне, вратете се на Денес.",
  "error.retry": "Обиди се повторно",
  "error.home": "Оди на Денес",
};

export const dictionaries: Record<Locale, Record<Key, Entry>> = { en, mk };

function pick(locale: Locale, schoolType: SchoolType, key: Key): string {
  const entry = dictionaries[locale][key];
  return typeof entry === "string" ? entry : entry[schoolType === "school" ? "school" : "uni"];
}

export function translate(locale: Locale, schoolType: SchoolType, key: Key, vars?: Record<string, string | number>) {
  const all: Record<string, string | number> = {
    students: pick(locale, schoolType, "noun.students"),
    classes: pick(locale, schoolType, "noun.classes"),
    teacher: pick(locale, schoolType, "noun.teacher"),
    ...vars,
  };
  return pick(locale, schoolType, key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in all ? String(all[name]) : whole));
}

export function useT() {
  const { locale, schoolType } = useTeacher();
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => translate(locale, schoolType, key, vars),
    [locale, schoolType],
  );
  return { t, locale, schoolType };
}
