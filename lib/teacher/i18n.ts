"use client";

import { useCallback } from "react";
import { isApiError } from "./api/errors";
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

  "user.link": "{name}, settings",

  "logout.title": "Do you want to sign out?",
  "logout.stay": "No, stay",
  "logout.confirm": "Yes, sign me out",
  "logout.failed": "We could not sign you out. You are still signed in.",

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
  "settings.guide.title": "Getting started guide",
  "settings.guide.hint": "See the three steps of working with TeacherAid again.",
  "settings.guide.cta": "Show the guide again",
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

  "demo.title": "Demo data",
  "demo.hint": "The lessons you prepare here are kept on this computer only. Reset puts the demo school back as it was at the start. Your language and type of institution stay as they are.",
  "demo.reset": "Reset the demo data",
  "demo.confirm.title": "Do you want to reset the demo data?",
  "demo.confirm.body": "The lessons you prepared in this demo will disappear.",
  "demo.confirm.stay": "No, keep them",
  "demo.confirm.yes": "Yes, reset",
  "demo.done": "Done. The demo data is back as it was at the start.",

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
  "help.q5": "I cannot sign in. What should I do?",
  "help.a5": "Sign in with the account from your institution, through Google or Microsoft. If it says the address is not on the list, ask the administrator of your institution to invite it. If nothing helps, write to us.",
  "help.contact.title": "Did not find the answer?",
  "help.contact.body": "Write to us and we will help.",
  "help.contact.cta": "Write to us",
  "help.contact.email": "hello@teacheraid.education",

  "loading": "Loading…",

  "signin.title": "Sign in",
  "signin.sub": "Sign in with the account from your institution.",
  "signin.sub.known": { school: "Sign in with the account from your school.", uni: "Sign in with the account from your faculty." },
  "signin.google": "Sign in with Google",
  "signin.microsoft": "Sign in with Microsoft",
  "signin.opening": "Opening {provider}…",
  "signin.lang": "Language",
  "signin.lang.mk": "МК, Македонски",
  "signin.lang.en": "EN, English",
  "signin.help": "Need help?",
  "signin.note.signed_out": "You have signed out successfully.",
  "signin.note.expired": "We signed you out for your safety. Sign in again.",
  "signin.problem.unknown_email": "This account is not on the list",
  "signin.problem.sign_in_failed": "Signing in did not work",
  "signin.problem.network": "No internet connection",

  "demo.sheet.tag": "Demo",
  "demo.sheet.title": "{provider} sign-in page",
  "demo.sheet.note": "This is only a demo. In the real version, the page of {provider} opens here. Choose what you want to try.",
  "demo.sheet.in": "Sign in as",
  "demo.sheet.veteran": "Marija Petrovska",
  "demo.sheet.veteran.hint": "Has a season of lessons and results.",
  "demo.sheet.novice": "A new {teacher}",
  "demo.sheet.novice.hint": "First time: the guide, and no lessons yet.",
  "demo.sheet.problems": "Or see what happens when something goes wrong",
  "demo.sheet.not_invited": "An account nobody invited",
  "demo.sheet.personal": { school: "A personal account, not the school's", uni: "A personal account, not the faculty's" },
  "demo.sheet.cancelled": "{provider} window cancelled",
  "demo.sheet.offline": "No internet",

  "gate.title": "We could not check your sign-in",
  "gate.body": "You may still be signed in. Check the connection and try again.",

  "public.signin": "Sign in",

  "guide.title": "Welcome",
  "guide.step": "Step {n} of {total}",
  "guide.1.title": "Prepare a lesson",
  "guide.1.body": "Add your material, a plan or a document, or write a few sentences about the topic. TeacherAid suggests 5 to 8 short questions. You read them and change what you like.",
  "guide.2.title": "Hold the lesson",
  "guide.2.body": "Show the QR code on the screen. Your {students} scan it with their phones and join. You send each question when you decide.",
  "guide.3.title": "See who was there and what to repeat",
  "guide.3.body": "At the end you get the list of who was present, for the electronic register, and the questions that most of your {students} got wrong. Your work saves itself.",
  "guide.next": "Next",
  "guide.skip": "Skip the guide",
  "guide.done": "Go to Today",
  "guide.error.title": "We could not carry on",

  "notfound.title": "This page does not exist",
  "notfound.body": "The link may be old or wrong. Go back to the start.",
  "notfound.cta": "Go to Today",

  "error.title": "Something went wrong",
  "error.body": "This screen could not be shown. Please try again. If that does not help, go back to Today.",
  "error.retry": "Try again",
  "error.home": "Go to Today",

  "err.network": "There is no internet connection. Check the connection and try again.",
  "err.invalid_response": "We got an answer we do not understand. Try again. If that does not help, write to us.",
  "err.not_implemented": "This part is still being built.",
  "err.unknown": "Something went wrong. Try again.",
  "err.unauthenticated": "You are not signed in. Sign in and try again.",
  "err.unknown_email": "This address is not on the list of invited teachers. Sign in with the address from your institution, or ask the administrator for an invitation.",
  "err.sign_in_failed": "Signing in did not work or was cancelled. Try again.",
  "err.signed_in_elsewhere": "You have signed in on another computer. Sign in again to carry on here.",
  "err.token_expired": "The code has expired. Use the new code that is shown.",
  "err.not_enrolled": { school: "This student is not in this class.", uni: "This student is not in this group." },
  "err.session_ended": "The lesson has ended and can no longer be changed.",
  "err.already_answered": "The answer has already been sent.",
  "err.limit_reached": "The highest number allowed has been reached.",
  "err.not_found": "We could not find what you are looking for. It may have been deleted. Go back and try again.",
  "err.validation_failed": "Something you entered is not right. Check it and try again.",
  "err.validation_failed.file_type": "Only a PDF or a Word (.docx) document can be added.",
  "err.validation_failed.file_too_large": "The document is larger than 20 MB. Choose a smaller one, or paste the text instead.",
  "err.validation_failed.empty": "The document is empty. Choose another one.",
  "err.validation_failed.no_text": "We found no text in this document (it may be a scan). Paste the text instead, or choose another document.",
  "err.validation_failed.text_too_short": "The text is too short. Write at least a few sentences about the topic.",
  "err.question_closed": "The time for this question has run out.",
  "err.rate_limited": "Too many tries. Wait a moment and try again.",
  "err.rate_limited.wait": "Too many tries. Wait {seconds} seconds and try again.",
  "err.server_error": "We have a problem on our side. Your work is not lost. Try again in a few minutes.",
  "err.generation_failed": "We could not prepare the lesson. Your material is saved. Try again.",
  "err.session_open": { school: "You already have a lesson running for this class. End it first.", uni: "You already have a lesson running for this group. End it first." },
  "err.invalid_state": "That cannot be done at this point in the lesson.",
  "err.question_open": "A question is already open. Close it or skip it first.",
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

  "user.link": "{name}, поставки",

  "logout.title": "Дали сакате да се одјавите?",
  "logout.stay": "Не, остани",
  "logout.confirm": "Да, одјави ме",
  "logout.failed": "Не успеавме да Ве одјавиме. Сè уште сте најавени.",

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
  "settings.guide.title": "Водич за почеток",
  "settings.guide.hint": "Погледнете ги повторно трите чекори за работа со TeacherAid.",
  "settings.guide.cta": "Прикажи го водичот повторно",
  "install.title": "Инсталирај на компјутерот",
  "install.hint": "TeacherAid се отвора во свој прозорец, како секоја друга програма.",
  "install.button": "Инсталирај",
  "install.done": "Готово. TeacherAid е инсталиран на овој компјутер.",
  "install.steps": "Како да инсталирате:",
  "install.step1": "Погледнете ја адресната лента на врвот од Chrome или Edge.",
  "install.step2": "На десната страна од лентата кликнете на малата икона за инсталирање (монитор со стрелка надолу).",
  "install.step3": "Потврдете со „Инсталирај“.",
  "install.nothing": "Не ја гледате иконата? Отворете го менито на прелистувачот (три точки горе десно) и побарајте „Инсталирај“.",

  "demo.title": "Демо податоци",
  "demo.hint": "Лекциите што ги подготвувате тука се чуваат само на овој компјутер. Ресетирањето го враќа демо училиштето како на почеток. Јазикот и типот на установа остануваат.",
  "demo.reset": "Ресетирај ги демо податоците",
  "demo.confirm.title": "Дали сакате да ги ресетирате демо податоците?",
  "demo.confirm.body": "Лекциите што сте ги подготвиле во оваа демо верзија ќе исчезнат.",
  "demo.confirm.stay": "Не, задржи ги",
  "demo.confirm.yes": "Да, ресетирај",
  "demo.done": "Готово. Демо податоците се вратени како на почеток.",

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
  "help.q5": "Не можам да се најавам. Што да правам?",
  "help.a5": "Најавете се со сметката од Вашата установа, преку Google или Microsoft. Ако пишува дека адресата не е на списокот, побарајте од администраторот на Вашата установа да ја покани. Ако ништо не помага, пишете ни.",
  "help.contact.title": "Не го најдовте одговорот?",
  "help.contact.body": "Пишете ни и ќе Ви помогнеме.",
  "help.contact.cta": "Пишете ни",
  "help.contact.email": "hello@teacheraid.education",

  "loading": "Се вчитува…",

  "signin.title": "Најава",
  "signin.sub": "Најавете се со сметката од Вашата установа.",
  "signin.sub.known": { school: "Најавете се со сметката од Вашето училиште.", uni: "Најавете се со сметката од Вашиот факултет." },
  "signin.google": "Најави се со Google",
  "signin.microsoft": "Најави се со Microsoft",
  "signin.opening": "Се отвора {provider}…",
  "signin.lang": "Јазик",
  "signin.lang.mk": "МК, Македонски",
  "signin.lang.en": "EN, English",
  "signin.help": "Потребна е помош?",
  "signin.note.signed_out": "Успешно се одјавивте.",
  "signin.note.expired": "Ве одјавивме поради безбедност. Најавете се повторно.",
  "signin.problem.unknown_email": "Оваа сметка не е на списокот",
  "signin.problem.sign_in_failed": "Најавувањето не успеа",
  "signin.problem.network": "Нема интернет",

  "demo.sheet.tag": "Демо",
  "demo.sheet.title": "Страница за најава на {provider}",
  "demo.sheet.note": "Ова е само демо. Во вистинската верзија тука се отвора страницата на {provider}. Изберете што сакате да пробате.",
  "demo.sheet.in": "Најави се како",
  "demo.sheet.veteran": "Марија Петровска",
  "demo.sheet.veteran.hint": "Има цела сезона лекции и резултати.",
  "demo.sheet.novice": "Нов {teacher}",
  "demo.sheet.novice.hint": "Прв пат: водич и сè уште без лекции.",
  "demo.sheet.problems": "Или видете што се случува кога нешто не е во ред",
  "demo.sheet.not_invited": "Сметка што никој не ја поканил",
  "demo.sheet.personal": { school: "Лична сметка, не од училиштето", uni: "Лична сметка, не од факултетот" },
  "demo.sheet.cancelled": "Откажан прозорец на {provider}",
  "demo.sheet.offline": "Нема интернет",

  "gate.title": "Не успеавме да ја провериме најавата",
  "gate.body": "Можеби сте сè уште најавени. Проверете ја врската и обидете се повторно.",

  "public.signin": "Најави се",

  "guide.title": "Добредојдовте",
  "guide.step": "Чекор {n} од {total}",
  "guide.1.title": "Подгответе лекција",
  "guide.1.body": "Додајте го Вашиот материјал, план или документ, или напишете неколку реченици за темата. TeacherAid предлага од 5 до 8 кратки прашања. Вие ги читате и менувате што сакате.",
  "guide.2.title": "Одржете ја лекцијата",
  "guide.2.body": "Покажете го QR-кодот на екранот. Вашите {students} го скенираат со телефон и се приклучуваат. Секое прашање го испраќате Вие, кога сакате.",
  "guide.3.title": "Видете кој бил присутен и што да се повтори",
  "guide.3.body": "На крајот добивате список на присутните, за електронскиот дневник, и прашањата на кои најмногу од Вашите {students} погрешиле. Вашата работа се зачувува сама.",
  "guide.next": "Следно",
  "guide.skip": "Прескокни го водичот",
  "guide.done": "Оди на Денес",
  "guide.error.title": "Не успеавме да продолжиме",

  "notfound.title": "Оваа страница не постои",
  "notfound.body": "Можеби врската е стара или погрешна. Вратете се на почеток.",
  "notfound.cta": "Оди на Денес",

  "error.title": "Нешто не е во ред",
  "error.body": "Овој екран не можеше да се прикаже. Обидете се повторно. Ако не помогне, вратете се на Денес.",
  "error.retry": "Обиди се повторно",
  "error.home": "Оди на Денес",

  "err.network": "Нема врска со интернет. Проверете ја врската и обидете се повторно.",
  "err.invalid_response": "Добивме одговор што не го разбираме. Обидете се повторно. Ако не помогне, пишете ни.",
  "err.not_implemented": "Овој дел сè уште се гради.",
  "err.unknown": "Нешто не е во ред. Обидете се повторно.",
  "err.unauthenticated": "Не сте најавени. Најавете се и обидете се повторно.",
  "err.unknown_email": "Оваа адреса не е меѓу поканетите наставници. Најавете се со адресата од Вашата установа или побарајте покана од администраторот.",
  "err.sign_in_failed": "Најавувањето не успеа или е откажано. Обидете се повторно.",
  "err.signed_in_elsewhere": "Се најавивте на друг компјутер. Најавете се повторно за да продолжите тука.",
  "err.token_expired": "Кодот истече. Користете го новиот код што се прикажува.",
  "err.not_enrolled": { school: "Овој ученик не е запишан во овој клас.", uni: "Овој студент не е запишан во оваа група." },
  "err.session_ended": "Лекцијата е завршена и повеќе не може да се менува.",
  "err.already_answered": "Одговорот веќе е испратен.",
  "err.limit_reached": "Достигнат е најголемиот дозволен број.",
  "err.not_found": "Не го најдовме тоа што го барате. Можеби е избришано. Вратете се назад и обидете се повторно.",
  "err.validation_failed": "Нешто од внесеното не е во ред. Проверете го и обидете се повторно.",
  "err.validation_failed.file_type": "Може да се додаде само PDF или Word (.docx) документ.",
  "err.validation_failed.file_too_large": "Документот е поголем од 20 MB. Изберете помал или залепете го текстот.",
  "err.validation_failed.empty": "Документот е празен. Изберете друг.",
  "err.validation_failed.no_text": "Во овој документ не најдовме текст (можеби е скениран). Залепете го текстот или изберете друг документ.",
  "err.validation_failed.text_too_short": "Текстот е прекраток. Напишете барем неколку реченици за темата.",
  "err.question_closed": "Времето за ова прашање истече.",
  "err.rate_limited": "Премногу обиди. Почекајте малку и обидете се повторно.",
  "err.rate_limited.wait": "Премногу обиди. Почекајте {seconds} секунди и обидете се повторно.",
  "err.server_error": "Кај нас има проблем. Вашата работа не е изгубена. Обидете се повторно за неколку минути.",
  "err.generation_failed": "Не успеавме да ја подготвиме лекцијата. Вашиот материјал е сочуван. Обидете се повторно.",
  "err.session_open": { school: "Веќе имате лекција во тек за овој клас. Прво завршете ја.", uni: "Веќе имате лекција во тек за оваа група. Прво завршете ја." },
  "err.invalid_state": "Тоа не може да се направи во овој момент од лекцијата.",
  "err.question_open": "Едно прашање е веќе отворено. Прво затворете го или прескокнете го.",
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

/**
 * The words for a failed call. A refused upload says what was wrong with it, a rate limit says how long to wait when the
 * server said, and any other code has its own sentence; anything that is not an ApiError reads as an unknown failure.
 * The cast below is checked: it does not build while an error code has no `err.<code>` entry.
 */
export function errorKey(error: unknown): { key: Key; vars?: Record<string, number> } {
  if (!isApiError(error)) return { key: "err.unknown" };
  const { code, reason, retryAfter } = error;
  if (code === "validation_failed" && reason) return { key: `err.validation_failed.${reason}` };
  if (code === "rate_limited" && retryAfter) return { key: "err.rate_limited.wait", vars: { seconds: retryAfter } };
  return { key: `err.${code}` };
}

export function useT() {
  const { locale, schoolType } = useTeacher();
  const t = useCallback(
    (key: Key, vars?: Record<string, string | number>) => translate(locale, schoolType, key, vars),
    [locale, schoolType],
  );
  /** The words for whatever a call threw. */
  const te = useCallback(
    (error: unknown) => {
      const { key, vars } = errorKey(error);
      return translate(locale, schoolType, key, vars);
    },
    [locale, schoolType],
  );
  return { t, te, locale, schoolType };
}
