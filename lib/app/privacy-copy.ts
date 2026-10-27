import type { QKey } from "./quiz-copy";
import type { Key } from "./i18n";
import type { Locale } from "./api/types";

/**
 * The words of the privacy notice (`/app/privacy`) and the terms of use (`/app/terms`), in Macedonian (ти form) and English.
 * They are long, so they live here and not in i18n.ts; the short labels of the screens that link to them are in i18n.ts.
 *
 * The notice says what the spec decides and nothing else (spec 7.13, 7.20, 13.4; BR-RET, BR-SEC, BR-ANON, BR-FOC; F-16):
 *  - the school is the controller and TeacherAid the processor, so the notice informs and does not ask for consent (OPEN-24);
 *  - retention is BR-RET-01 (the school year after the one the data was made in), BR-RET-02 (reports without names) and
 *    BR-RET-03 (a leaver, 30 days after the school asks); the notification address goes with the subscription (BR-NOT-05);
 *  - requests go through the school (F-16) and are done by hand; there is no delete button.
 *
 * PROPOSED here, not in the spec, and true only until the owner or a lawyer says otherwise (each is in the handoff docs as
 * PROPOSED or OPEN): alerts are kept like lesson data; the school's office is where a student asks; the list of rights; the
 * right to complain to the Personal Data Protection Agency; that the school informs parents; "no ads and no tracking" (true of
 * the app today: no third-party origin is allowed by the CSP); the contact address (CONTACT_EMAIL).
 *
 * The three lines the app already tells a student at the moment (leaving the quiz, asking the teacher, notifications) are not
 * written again here: a `line` or `qline` block shows the app's own string, so the page and the app can never differ.
 */

export type Block =
  | { p: string }
  | { ul: string[] }
  /** The app's own sentence from i18n.ts, shown as a quote. */
  | { line: Key }
  /** The app's own sentence from quiz-copy.ts, shown as a quote. */
  | { qline: QKey };

export type DocSection = {
  /** The anchor: `/app/privacy#focus` opens at this section. */
  id: string;
  title: string;
  /** 2 for a section, 3 for an item inside the one above it. */
  level: 2 | 3;
  blocks: Block[];
};

export type Doc = {
  title: string;
  /** "Updated {date}" and "Version {version}" are filled in by the page. */
  updated: string;
  version: string;
  jump: string;
  /** The label in front of one of the app's own lines. */
  appSays: string;
  sections: DocSection[];
};

export type PrivacyDoc = Doc & {
  summaryTitle: string;
  summary: string[];
};

const privacyEn: PrivacyDoc = {
  title: "Privacy notice",
  updated: "Updated {date}",
  version: "Version {version}",
  jump: "Jump to",
  appSays: "The app tells you this when it matters:",
  summaryTitle: "The short version",
  summary: [
    "Your school decides how your data is used. TeacherAid runs the app for your school.",
    "Your teacher sees your answers, your questions and when you leave the quiz during a question. Your classmates don't.",
    "The app has no ads and no tracking, and it can't see your other apps.",
    "You can ask for a copy of your data or for it to be deleted. You ask your school, and the school asks us.",
    "We keep lesson data until the end of the next school year. Then we delete it or turn it into totals without names.",
  ],
  sections: [
    {
      id: "who",
      title: "Who is responsible",
      level: 2,
      blocks: [
        {
          p: "Your school is responsible for your data. It decides what the app is used for and why. TeacherAid runs the app for your school, under the contract the two of them have.",
        },
        { p: "If you are not yet an adult, your school also tells your parents or guardians about the app. If they have questions, they can ask the school office." },
        {
          p: "At a university, read \"school\" as your faculty, \"teacher\" as your professor, \"class\" as your study group, \"school office\" as the faculty office and \"headmaster\" as the dean.",
        },
        { p: "The law behind this is North Macedonia's Law on Personal Data Protection (ЗЗЛП), which follows the EU's GDPR." },
      ],
    },
    {
      id: "collected",
      title: "What we collect and why",
      level: 2,
      blocks: [{ p: "This is everything the app keeps about you, one thing at a time, and why." }],
    },
    {
      id: "account",
      title: "Your school account",
      level: 3,
      blocks: [
        {
          p: "Your full name, school email, class and school. They come from the list of students your school gives us. We use them to sign you in and to put you in the right class. You can't change them in the app.",
        },
      ],
    },
    {
      id: "profile",
      title: "Display name and photo",
      level: 3,
      blocks: [
        {
          p: "Optional. In Profile you can pick a display name and add a photo. Your classmates see the name you pick in the quiz. We use the photo as your picture in the app. You can remove both whenever you want.",
        },
      ],
    },
    {
      id: "attendance",
      title: "Attendance",
      level: 3,
      blocks: [
        {
          p: "When you scan the class QR code, we record that you are at that lesson, and the time. Your teacher sees it. The headmaster only gets monthly totals without names. The camera reads the code on your phone. We don't save or send any pictures.",
        },
      ],
    },
    {
      id: "answers",
      title: "Answers and points",
      level: 3,
      blocks: [
        {
          p: "Each answer you give in a quiz, whether it was right, how long it took, and your points. We use them to score the quiz, show you your results, and let your teacher see how the class is doing. Your teacher sees your answers. Your classmates see only your name, your points and your place on the class board.",
        },
      ],
    },
    {
      id: "topics",
      title: "Results by topic",
      level: 3,
      blocks: [
        {
          p: "We add up your right and wrong answers by topic, lesson after lesson, so you can see how you're doing and your teacher can see who needs help. Only you and your teacher see them. TeacherAid doesn't give grades. Your teacher decides what counts.",
        },
      ],
    },
    {
      id: "ask",
      title: "Questions to your teacher",
      level: 3,
      blocks: [
        { p: "When you ask your teacher a question, we keep the text with your name." },
        { qline: "ask.honest" },
        { p: "No other student can see it, and the school office can't either. It is deleted with the rest of that lesson's data." },
      ],
    },
    {
      id: "focus",
      title: "Leaving the quiz",
      level: 3,
      blocks: [
        { qline: "fair.note" },
        {
          p: "In detail: this only happens while a question is open. If the quiz page is hidden or you switch to something else for more than a moment, we record when it happened and during which question. We don't know what you do outside the quiz: not which app, not which website. Nothing is recorded between questions. The app tells you about this first. Your teacher sees it. Nobody blocks you or punishes you for it.",
        },
      ],
    },
    {
      id: "practice",
      title: "Practice questions",
      level: 3,
      blocks: [
        {
          p: "Your answers to practice questions. Your teacher sees whether a set is finished and its score. Your classmates don't see them.",
        },
      ],
    },
    {
      id: "alerts",
      title: "Alerts and notifications",
      level: 3,
      blocks: [
        {
          p: "The app keeps a list of alerts for you, like new results and practice sets. If you turn on notifications, your browser gives us an address for sending them to this phone. It is the only thing that identifies your phone.",
        },
        { line: "push.ask.body" },
        {
          p: "On a locked screen a notification never shows your points or your name. It travels through the notification service of your browser or phone maker, for example Apple or Google.",
        },
      ],
    },
    {
      id: "signin",
      title: "Signing in",
      level: 3,
      blocks: [
        {
          p: "You sign in with your school's Google or Microsoft account. The sign-in itself happens at Google or Microsoft, so we never see your password. After that the app keeps a sign-in cookie on your phone so you stay signed in. It is the only cookie we use: there are no cookies for ads, statistics or tracking. You can be signed in on one phone at a time. If you sign in on another, the first one is signed out.",
        },
      ],
    },
    {
      id: "not-collected",
      title: "What we don't collect",
      level: 3,
      blocks: [
        {
          p: "Your grades, your phone number or home address, your location, your contacts, or anything from your other apps. Apart from the address for notifications, nothing identifies your phone. The app has no ads and no tracking tools.",
        },
      ],
    },
    {
      id: "sees",
      title: "Who sees what",
      level: 2,
      blocks: [],
    },
    {
      id: "sees-teacher",
      title: "Your teacher",
      level: 3,
      blocks: [
        {
          p: "Your answers and points, your results by topic, your attendance, your practice results, the questions you ask, and when you leave the quiz during a question. Only for the lessons they teach you.",
        },
      ],
    },
    {
      id: "sees-class",
      title: "Your classmates",
      level: 3,
      blocks: [
        {
          p: "Your name, your points and your place on the class board, and the badges you earn. They never see your answers, your questions, your results, your attendance or when you leave the quiz.",
        },
      ],
    },
    {
      id: "sees-admin",
      title: "The school office",
      level: 3,
      blocks: [
        {
          p: "The class lists and your school account details, and how often teachers use the app. Never your answers, questions or results by topic.",
        },
      ],
    },
    {
      id: "sees-head",
      title: "The headmaster",
      level: 3,
      blocks: [{ p: "A monthly report with totals, without names." }],
    },
    {
      id: "sees-staff",
      title: "TeacherAid staff",
      level: 3,
      blocks: [
        {
          p: "They have no standing access. They get access only when your school reports a problem, for a short, limited time. Every look is logged on TeacherAid's side.",
        },
      ],
    },
    {
      id: "sees-other",
      title: "Other services",
      level: 3,
      blocks: [
        {
          p: "AI helps teachers prepare lessons from their own material or a topic they type. It never receives your name, your email or the class list. Your data is stored in the European Union and is encrypted while it travels and while it is stored.",
        },
      ],
    },
    {
      id: "keep",
      title: "How long we keep it",
      level: 2,
      blocks: [
        {
          ul: [
            "Lesson data (attendance, answers, results by topic, practice, questions to your teacher, leaving the quiz, and your alerts): until the end of the school year after the one it was made in. Then we delete it or turn it into totals without names.",
            "If you leave the school: your school asks us, and we delete everything about you within {days} days.",
            "Monthly reports: kept as totals without names.",
            "The address for notifications: until you turn notifications off or sign out.",
            "When data is deleted, the copies in backups expire on a fixed schedule.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Your rights",
      level: 2,
      blocks: [
        {
          p: "You can ask your school to show you your data and give you a copy, to fix what is wrong, to delete it, or to limit how it is used or object to it.",
        },
        {
          p: "There is no button for this in the app. You ask your school, at the school office or through your teacher. The school then sends TeacherAid a written request. We do it by hand and keep a record of the request.",
        },
        { p: "If you think your data is handled wrongly, you can complain to the Personal Data Protection Agency of North Macedonia (azlp.mk)." },
        { p: "Your parents or guardians can talk to the school about this too. You can see what we hold in [Your data](/app/data)." },
      ],
    },
    {
      id: "contact",
      title: "Contact",
      level: 2,
      blocks: [
        {
          p: "Start with your school: the school office, or the teacher who uses TeacherAid. For questions about the app itself: [{email}](mailto:{email}).",
        },
      ],
    },
    {
      id: "phone",
      title: "What is saved on your phone",
      level: 2,
      blocks: [
        { p: "The app saves a few things on your phone so it works with a weak signal:" },
        {
          ul: [
            "Answers you gave without a connection, until they are sent.",
            "Your practice questions, so you can do them without a connection.",
            "The app's pages and files, so it opens without a connection. They hold none of your data.",
            "The sign-in cookie.",
            "Your language, and small notes: which intros you have seen, who signed in last on this phone (a code, not a name), your notifications choice, and times you left the quiz that are not sent yet.",
          ],
        },
        {
          p: "If you sign out, answers that are not sent yet stay on the phone and are sent when you sign in again. If someone else uses this phone, clear it first: Profile, then [Your data](/app/data), then Clear data on this phone.",
        },
      ],
    },
    {
      id: "changes",
      title: "Changes",
      level: 2,
      blocks: [{ p: "If this notice changes in a way that matters, the app shows you a short screen the next time you open it." }],
    },
  ],
};

const privacyMk: PrivacyDoc = {
  title: "Известување за приватност",
  updated: "Ажурирано на {date}",
  version: "Верзија {version}",
  jump: "Скокни до",
  appSays: "Апликацијата ти го кажува ова кога е важно:",
  summaryTitle: "Накратко",
  summary: [
    "Твоето училиште одлучува како се користат твоите податоци. TeacherAid ја води апликацијата за училиштето.",
    "Наставникот ги гледа твоите одговори, твоите прашања и кога ќе излезеш од квизот додека трае прашање. Соучениците не ги гледаат.",
    "Апликацијата нема реклами, не те следи и не ги гледа другите апликации на твојот телефон.",
    "Можеш да побараш копија од твоите податоци или да се избришат. Го бараш од училиштето, а училиштето ни се обраќа нам.",
    "Податоците од часовите ги чуваме до крајот на следната училишна година. Потоа ги бришеме или ги претвораме во збирови без имиња.",
  ],
  sections: [
    {
      id: "who",
      title: "Кој е одговорен",
      level: 2,
      blocks: [
        {
          p: "Училиштето е одговорно за твоите податоци. Тоа одлучува за што и зошто се користи апликацијата. TeacherAid ја води апликацијата за училиштето, според договорот што го имаат.",
        },
        { p: "Ако не си сѐ уште полнолетен, училиштето ги известува и твоите родители или старатели за апликацијата. Ако имаат прашања, можат да се обратат во училишната канцеларија." },
        {
          p: "На универзитет, „училиште“ читај го како твојот факултет, „наставник“ како професор, „клас“ како студиска група, „училишна канцеларија“ како факултетска канцеларија и „директор“ како декан.",
        },
        { p: "Законот зад ова е Законот за заштита на личните податоци на Северна Македонија (ЗЗЛП), кој е усогласен со GDPR на ЕУ." },
      ],
    },
    {
      id: "collected",
      title: "Што собираме и зошто",
      level: 2,
      blocks: [{ p: "Ова е сѐ што апликацијата чува за тебе, едно по едно, и зошто." }],
    },
    {
      id: "account",
      title: "Твојата училишна сметка",
      level: 3,
      blocks: [
        {
          p: "Твоето име и презиме, училишната е-пошта, класот и училиштето. Доаѓаат од списокот на ученици што ни го дава училиштето. Ги користиме за да те најавиме и да те ставиме во вистинскиот клас. Во апликацијата не можеш да ги менуваш.",
        },
      ],
    },
    {
      id: "profile",
      title: "Прикажано име и фотографија",
      level: 3,
      blocks: [
        {
          p: "Незадолжително. Во Профил можеш да одбереш прикажано име и да додадеш фотографија. Соучениците го гледаат името што ќе го одбереш во квизот. Фотографијата ја користиме како твоја слика во апликацијата. Можеш да ги отстраниш двете кога сакаш.",
        },
      ],
    },
    {
      id: "attendance",
      title: "Присуство",
      level: 3,
      blocks: [
        {
          p: "Кога ќе го скенираш QR кодот на часот, запишуваме дека присуствуваш на тој час и во кое време. Го гледа наставникот. Директорот добива само месечни збирови без имиња. Камерата го чита кодот на твојот телефон. Не зачувуваме и не испраќаме никакви слики.",
        },
      ],
    },
    {
      id: "answers",
      title: "Одговори и поени",
      level: 3,
      blocks: [
        {
          p: "Секој одговор во квиз, дали е точен, за колку време е даден и твоите поени. Ги користиме за да го бодуваме квизот, да ти ги покажеме резултатите и наставникот да види како оди класот. Наставникот ги гледа твоите одговори. Соучениците го гледаат само твоето име, поените и местото на листата на класот.",
        },
      ],
    },
    {
      id: "topics",
      title: "Резултати по теми",
      level: 3,
      blocks: [
        {
          p: "Ги собираме твоите точни и неточни одговори по теми, час по час, за да видиш како напредуваш и за наставникот да види кому му треба помош. Ги гледате само ти и наставникот. TeacherAid не дава оценки: наставникот одлучува што се брои.",
        },
      ],
    },
    {
      id: "ask",
      title: "Прашања до наставникот",
      level: 3,
      blocks: [
        { p: "Кога го прашуваш наставникот, го чуваме текстот со твоето име." },
        { qline: "ask.honest" },
        { p: "Ниту еден друг ученик не може да го види, ниту училишната канцеларија. Се брише заедно со другите податоци од тој час." },
      ],
    },
    {
      id: "focus",
      title: "Излегување од квизот",
      level: 3,
      blocks: [
        { qline: "fair.note" },
        {
          p: "Подетално: ова се случува само додека има отворено прашање. Ако страницата на квизот се скрие или преминеш на нешто друго подолго од миг, запишуваме кога се случило и во кое прашање. Не знаеме што правиш надвор од квизот: ни која апликација, ни кој сајт. Меѓу прашањата не се запишува ништо. Апликацијата прво ти го кажува ова. Наставникот го гледа тоа. Никој не те блокира и не те казнува за тоа.",
        },
      ],
    },
    {
      id: "practice",
      title: "Прашања за вежбање",
      level: 3,
      blocks: [
        {
          p: "Твоите одговори на прашањата за вежбање. Наставникот гледа дали вежбањето е завршено и колку е резултатот. Соучениците не ги гледаат.",
        },
      ],
    },
    {
      id: "alerts",
      title: "Известувања",
      level: 3,
      blocks: [
        {
          p: "Апликацијата чува список со известувања за тебе, како нови резултати и прашања за вежбање. Ако вклучиш известувања, прелистувачот ни дава адреса на која можеме да ги испраќаме на овој телефон. Тоа е единственото нешто што го препознава твојот телефон.",
        },
        { line: "push.ask.body" },
        {
          p: "На заклучен екран известувањето никогаш не ги прикажува твоите поени или твоето име. Минува низ услугата за известувања на твојот прелистувач или на производителот на телефонот, на пример Apple или Google.",
        },
      ],
    },
    {
      id: "signin",
      title: "Најавување",
      level: 3,
      blocks: [
        {
          p: "Се најавуваш со училишната Google или Microsoft сметка. Самото најавување се случува кај Google или Microsoft, па ние никогаш не ја гледаме твојата лозинка. Потоа апликацијата чува колаче за најавата на твојот телефон за да останеш најавен. Тоа е единственото колаче што го користиме: нема колачиња за реклами, статистика или следење. Може да си најавен на еден телефон одеднаш: ако се најавиш на друг, првиот се одјавува.",
        },
      ],
    },
    {
      id: "not-collected",
      title: "Што не собираме",
      level: 3,
      blocks: [
        {
          p: "Твоите оценки, телефонскиот број или домашната адреса, локацијата, контактите, ниту нешто од другите апликации. Освен адресата за известувања, ништо не го означува твојот телефон. Во апликацијата нема реклами и нема алатки за следење.",
        },
      ],
    },
    {
      id: "sees",
      title: "Кој што гледа",
      level: 2,
      blocks: [],
    },
    {
      id: "sees-teacher",
      title: "Твојот наставник",
      level: 3,
      blocks: [
        {
          p: "Твоите одговори и поени, резултатите по теми, присуството, резултатите од вежбањето, прашањата што му ги поставуваш и кога излегуваш од квизот додека трае прашање. Само за часовите што ти ги држи.",
        },
      ],
    },
    {
      id: "sees-class",
      title: "Твоите соученици",
      level: 3,
      blocks: [
        {
          p: "Твоето име, поените и местото на листата на класот, и значките што ги освојуваш. Никогаш не ги гледаат твоите одговори, прашања, резултати, присуство или кога излегуваш од квизот.",
        },
      ],
    },
    {
      id: "sees-admin",
      title: "Училишната канцеларија",
      level: 3,
      blocks: [
        {
          p: "Списоците на класовите и податоците од твојата училишна сметка, и колку често наставниците ја користат апликацијата. Никогаш твоите одговори, прашања или резултати по теми.",
        },
      ],
    },
    {
      id: "sees-head",
      title: "Директорот",
      level: 3,
      blocks: [{ p: "Месечен извештај со збирови, без имиња." }],
    },
    {
      id: "sees-staff",
      title: "Тимот на TeacherAid",
      level: 3,
      blocks: [
        {
          p: "Немаат постојан пристап. Пристап добиваат само кога училиштето ќе пријави проблем, на кратко и ограничено време. Секое гледање се запишува кај TeacherAid.",
        },
      ],
    },
    {
      id: "sees-other",
      title: "Други услуги",
      level: 3,
      blocks: [
        {
          p: "Вештачка интелигенција им помага на наставниците да подготват часови од сопствен материјал или од тема што ја впишуваат. Таа никогаш не го добива твоето име, твојата е-пошта или списокот на класот. Податоците се чуваат во Европската Унија и се шифрирани при пренос и при чување.",
        },
      ],
    },
    {
      id: "keep",
      title: "Колку долго ги чуваме",
      level: 2,
      blocks: [
        {
          ul: [
            "Податоците од часовите (присуство, одговори, резултати по теми, вежбање, прашања до наставникот, излегувања од квизот и твоите известувања): до крајот на училишната година што доаѓа по онаа во која настанале. Потоа ги бришеме или ги претвораме во збирови без имиња.",
            "Ако го напуштиш училиштето: училиштето ни бара, а ние го бришеме сѐ за тебе во рок од {days} дена.",
            "Месечни извештаи: се чуваат како збирови без имиња.",
            "Адресата за известувања: додека не ги исклучиш известувањата или не се одјавиш.",
            "Кога се бришат податоци, копиите во резервните копии истекуваат по фиксен распоред.",
          ],
        },
      ],
    },
    {
      id: "rights",
      title: "Твоите права",
      level: 2,
      blocks: [
        {
          p: "Можеш да побараш од училиштето да ти ги покаже податоците и да ти даде копија, да се поправи она што е погрешно, да се избришат, или да се ограничи начинот на користење или да приговориш на него.",
        },
        {
          p: "Во апликацијата нема копче за ова. Го бараш од училиштето, во канцеларијата или преку наставникот. Училиштето потоа му праќа писмено барање на TeacherAid. Ние го извршуваме рачно и го запишуваме барањето.",
        },
        { p: "Ако мислиш дека со твоите податоци се постапува погрешно, можеш да поднесеш жалба до Агенцијата за заштита на личните податоци на Северна Македонија (azlp.mk)." },
        { p: "И твоите родители или старатели можат да разговараат со училиштето за ова. Што чуваме за тебе можеш да видиш во [Твоите податоци](/app/data)." },
      ],
    },
    {
      id: "contact",
      title: "Контакт",
      level: 2,
      blocks: [
        {
          p: "Прво обрати се во училиштето: во училишната канцеларија или кај наставникот што ја користи апликацијата TeacherAid. За прашања за самата апликација: [{email}](mailto:{email}).",
        },
      ],
    },
    {
      id: "phone",
      title: "Што е зачувано на твојот телефон",
      level: 2,
      blocks: [
        { p: "Апликацијата зачувува неколку работи на телефонот за да работи и кога сигналот е слаб:" },
        {
          ul: [
            "Одговори дадени без врска, додека не се испратат.",
            "Твоите прашања за вежбање, за да можеш да ги решаваш и без врска.",
            "Страниците и датотеките на апликацијата, за да се отвора и без врска. Во нив нема твои податоци.",
            "Колачето за најавата.",
            "Твојот јазик и мали белешки: кои воведи се веќе прикажани, кој последен се најавил на овој телефон (шифра, не име), изборот за известувања и времињата на излегување од квизот што сѐ уште не се испратени.",
          ],
        },
        {
          p: "Ако се одјавиш, одговорите што не се испратени остануваат на телефонот и се испраќаат кога повторно ќе се најавиш. Ако телефонот го користи некој друг, прво исчисти го: Профил, па [Твоите податоци](/app/data), па Исчисти ги податоците на овој телефон.",
        },
      ],
    },
    {
      id: "changes",
      title: "Промени",
      level: 2,
      blocks: [{ p: "Ако известувањето се промени на начин што е важен, апликацијата ќе ти прикаже краток екран следниот пат кога ќе ја отвориш." }],
    },
  ],
};

const termsEn: Doc = {
  title: "Terms of use",
  updated: "Updated {date}",
  version: "Version {version}",
  jump: "Jump to",
  appSays: "The app tells you this when it matters:",
  sections: [
    {
      id: "intro",
      title: "What this is",
      level: 2,
      blocks: [{ p: "These are the rules for using TeacherAid in your school. They are short. At a university, read \"school\" as your faculty and \"teacher\" as your professor." }],
    },
    {
      id: "who",
      title: "Who can use it",
      level: 2,
      blocks: [
        { p: "TeacherAid is for students your school has added. You sign in with your school's Google or Microsoft account. The account is yours: don't share your sign-in with anyone." },
      ],
    },
    {
      id: "yourself",
      title: "Be yourself",
      level: 2,
      blocks: [{ p: "Use only your own account. Don't sign in as another student, and don't answer for someone else." }],
    },
    {
      id: "respect",
      title: "Be respectful",
      level: 2,
      blocks: [
        {
          p: "Questions to your teacher reach them with your name on them. Keep them kind and about the lesson. No insults, threats or jokes at someone else's expense.",
        },
      ],
    },
    {
      id: "qr",
      title: "Keep the class code in class",
      level: 2,
      blocks: [
        {
          p: "The QR code on the board is for the students in that lesson. Don't photograph it, share it or send it to anyone who isn't in the room. Checking in from outside the lesson isn't allowed.",
        },
      ],
    },
    {
      id: "fair",
      title: "Play fair",
      level: 2,
      blocks: [{ p: "Don't use tricks to get points or to see answers early, and don't try to break the app or overload it." }],
    },
    {
      id: "problems",
      title: "If something doesn't work",
      level: 2,
      blocks: [{ p: "Tell your teacher. The app is never the reason you are marked absent." }],
    },
    {
      id: "broken",
      title: "If the rules are broken",
      level: 2,
      blocks: [{ p: "Your school decides what happens, following its own school rules." }],
    },
    {
      id: "data",
      title: "Your data",
      level: 2,
      blocks: [{ p: "How the app uses your data is in the [Privacy notice](/app/privacy)." }],
    },
    {
      id: "changes",
      title: "Changes",
      level: 2,
      blocks: [
        {
          p: "These rules can change. If they do, the app shows you the new version. Questions: the school office, or [{email}](mailto:{email}).",
        },
      ],
    },
  ],
};

const termsMk: Doc = {
  title: "Услови за користење",
  updated: "Ажурирано на {date}",
  version: "Верзија {version}",
  jump: "Скокни до",
  appSays: "Апликацијата ти го кажува ова кога е важно:",
  sections: [
    {
      id: "intro",
      title: "Што е ова",
      level: 2,
      blocks: [{ p: "Ова се правилата за користење на TeacherAid во твоето училиште. Кратки се. На универзитет, „училиште“ читај го како факултет, а „наставник“ како професор." }],
    },
    {
      id: "who",
      title: "Кој може да ја користи",
      level: 2,
      blocks: [
        { p: "TeacherAid е за ученици што училиштето ги додало. Се најавуваш со училишната Google или Microsoft сметка. Сметката е твоја: не ја споделувај најавата со никого." },
      ],
    },
    {
      id: "yourself",
      title: "Биди ти",
      level: 2,
      blocks: [{ p: "Користи само своја сметка. Не се најавувај како друг ученик и не одговарај наместо некој друг." }],
    },
    {
      id: "respect",
      title: "Пиши љубезно",
      level: 2,
      blocks: [
        {
          p: "Прашањата до наставникот стигнуваат до него со твоето име. Пиши љубезно и за часот. Без навреди, закани или шеги на сметка на други.",
        },
      ],
    },
    {
      id: "qr",
      title: "Кодот од таблата останува во училницата",
      level: 2,
      blocks: [
        {
          p: "QR кодот на таблата е за учениците што се на тој час. Не го фотографирај, не го споделувај и не го праќај на некој што не е во училницата. Пријавување на присуство однадвор не е дозволено.",
        },
      ],
    },
    {
      id: "fair",
      title: "Играј фер",
      level: 2,
      blocks: [{ p: "Не користи трикови за поени или за да ги видиш одговорите однапред, и не се обидувај да ја расипеш или да ја преоптовариш апликацијата." }],
    },
    {
      id: "problems",
      title: "Ако нешто не работи",
      level: 2,
      blocks: [{ p: "Кажи му на наставникот. Апликацијата никогаш не е причина да бидеш означен како отсутен." }],
    },
    {
      id: "broken",
      title: "Ако правилата се прекршат",
      level: 2,
      blocks: [{ p: "Училиштето одлучува што се случува, според своите училишни правила." }],
    },
    {
      id: "data",
      title: "Твоите податоци",
      level: 2,
      blocks: [{ p: "Како апликацијата ги користи твоите податоци пишува во [Известувањето за приватност](/app/privacy)." }],
    },
    {
      id: "changes",
      title: "Промени",
      level: 2,
      blocks: [
        {
          p: "Правилата можат да се променат. Ако се променат, апликацијата ќе ти ја прикаже новата верзија. Прашања: училишната канцеларија или [{email}](mailto:{email}).",
        },
      ],
    },
  ],
};

export const PRIVACY: Record<Locale, PrivacyDoc> = { en: privacyEn, mk: privacyMk };
export const TERMS: Record<Locale, Doc> = { en: termsEn, mk: termsMk };
