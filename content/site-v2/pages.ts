import type { Lang } from "./types";

/*
  The website's pages beyond the home page, and the lines every page shares (the footer, the
  breadcrumb). Macedonian first, polite form. Every fact here is either on the home page already
  or checked and dated where it is stated (other tools' prices and features).
*/

export type PageKey = "faq" | "alternative" | "about" | "tools" | "ai" | "press";

/** Each page's path in each language. The pairs are each other's hreflang alternates. */
export const pagePaths: Record<PageKey, Record<Lang, string>> = {
  faq: { mk: "/prasanja", en: "/en/faq" },
  alternative: { mk: "/alternativa-na-kahoot", en: "/en/kahoot-alternative" },
  about: { mk: "/za-nas", en: "/en/about" },
  tools: { mk: "/digitalni-alatki-vo-nastavata", en: "/en/digital-tools-for-teaching" },
  ai: { mk: "/vestachka-inteligencija-vo-obrazovanieto", en: "/en/ai-in-education" },
  press: { mk: "/za-mediumi", en: "/en/press" },
};

export const homePaths: Record<Lang, string> = { mk: "/", en: "/en" };

/** When each page's content last changed. Change it only when the words change. */
export const pageUpdated: Record<PageKey | "home", string> = {
  home: "2026-10-31",
  faq: "2026-10-31",
  alternative: "2026-10-31",
  about: "2026-10-31",
  tools: "2026-11-25",
  ai: "2026-11-25",
  press: "2026-11-25",
};

export type QA = { q: string; a: string[] };

export type Section = {
  id: string;
  title: string;
  paras?: string[];
  list?: string[];
  /** Questions under the section heading, each an h3 with its answer. */
  items?: QA[];
  table?: { caption: string; cols: string[]; rows: { label: string; cells: string[] }[]; note: string };
  /** Files and pages to open or download, each with a short note. */
  links?: { label: string; href: string; note?: string; download?: boolean }[];
};

export type ArticleDict = {
  key: PageKey;
  lang: Lang;
  meta: { title: string; description: string };
  /** The page's name in the breadcrumb and the footer. */
  name: string;
  kicker: string;
  title: string;
  lead: string;
  sections: Section[];
  sources?: { label: string; href: string }[];
};

export type ChromeDict = {
  homeName: string;
  breadcrumbLabel: string;
  updated: string;
  sourcesTitle: string;
  /** The plain description of TeacherAid in the footer of every page. */
  definition: string;
  pagesLabel: string;
  privacy: { label: string; href: string };
  terms: { label: string; href: string };
  privacyPolicy: { label: string; href: string };
  book: { title: string; body: string; cta: string; email: string; pilot: string };
  /** The nav's section links point at the home page from every other page. */
  sectionsLabel: string;
  /** The home page's list of the reading pages, before the booking scene. */
  readMore: { kicker: string; title: string };
};

export const chrome: Record<Lang, ChromeDict> = {
  mk: {
    homeName: "Почетна",
    breadcrumbLabel: "Каде сте",
    updated: "Ажурирано",
    sourcesTitle: "Извори",
    definition:
      "TeacherAid е апликација за часот за средни училишта и факултети во Македонија. Од лекцијата на наставникот прави прашања, учениците одговараат на своите телефони, присуството се запишува со скенирање на QR-код, а директорот секој месец добива извештај. Направено во Битола.",
    pagesLabel: "Страници",
    privacy: { label: "Приватност за учениците", href: "/app/privacy" },
    terms: { label: "Услови за користење", href: "/uslovi" },
    privacyPolicy: { label: "Политика за приватност", href: "/privatnost" },
    book: {
      title: "Закажете бесплатен час.",
      body: "Доаѓаме во вашето училиште и со едно одделение водиме вистински час, од скенирањето до списокот на крајот. Вие и наставниците гледате.",
      cta: "Пишете ни",
      email: "hello@teacheraid.education",
      pilot: "Во учебната 2026/27 почнуваме со првите училишта.",
    },
    sectionsLabel: "Делови од почетната страница",
    readMore: { kicker: "Прочитајте повеќе", title: "Пред да ни пишете." },
  },
  en: {
    homeName: "Home",
    breadcrumbLabel: "You are here",
    updated: "Updated",
    sourcesTitle: "Sources",
    definition:
      "TeacherAid is a classroom app for secondary schools and universities in North Macedonia. It turns the teacher's lesson into questions, students answer on their phones, attendance is taken by scanning a QR code, and the director gets a report every month. Made in Bitola.",
    pagesLabel: "Pages",
    privacy: { label: "Privacy for students", href: "/app/privacy" },
    terms: { label: "Terms of Service", href: "/en/terms" },
    privacyPolicy: { label: "Privacy Policy", href: "/en/privacy" },
    book: {
      title: "Book a free lesson.",
      body: "We come to your school and run a real lesson with one class, from the scan to the list at the end. You and your teachers watch.",
      cta: "Write to us",
      email: "hello@teacheraid.education",
      pilot: "We start with the first schools in the 2026/27 school year.",
    },
    sectionsLabel: "Sections of the home page",
    readMore: { kicker: "Read more", title: "Before you write to us." },
  },
};

const faqMk: ArticleDict = {
  key: "faq",
  lang: "mk",
  meta: {
    title: "Прашања и одговори за TeacherAid: присуство, телефони, податоци",
    description:
      "Сè што наставниците и директорите прашуваат за TeacherAid: како работи присуството со QR-код, дали учениците треба да симнат апликација, дали треба интернет, што е со е-Дневник и чии се податоците.",
  },
  name: "Прашања",
  kicker: "Прашања и одговори",
  title: "Што прашуваат училиштата.",
  lead: "Одговорите на прашањата што ни ги поставуваат наставниците и директорите, секој во неколку реченици.",
  sections: [
    {
      id: "za-teacheraid",
      title: "За TeacherAid",
      items: [
        {
          q: "Што е TeacherAid?",
          a: [
            "TeacherAid е апликација за часот за средни училишта и факултети во Македонија. Наставникот ја додава лекцијата, како PDF, Word или неколку реченици, а TeacherAid подготвува пет до осум прашања со точните одговори и кратко објаснување.",
            "Во час наставникот ги испраќа прашањата од лаптопот, а учениците одговараат на своите телефони. Присуството се запишува кога учениците ќе го скенираат QR-кодот на таблата. Директорот секој месец добива извештај за целото училиште.",
          ],
        },
        {
          q: "За кого е наменет?",
          a: [
            "За наставниците и директорите во средните училишта и за професорите и деканите на факултетите. Наставникот ја користи во час. Директорот не користи ништо: само го добива месечниот извештај. На факултет, извештајот го добива деканот.",
          ],
        },
        {
          q: "На кој јазик е?",
          a: ["На македонски. Прашањата, апликацијата за наставникот и апликацијата за учениците се на македонски јазик."],
        },
        {
          q: "Колку чини?",
          a: [
            "Првиот час е бесплатен: доаѓаме во вашето училиште и водиме вистински час со едно одделение. За училиштата што ќе продолжат, цената ја договараме директно. Пишете ни на hello@teacheraid.education.",
          ],
        },
      ],
    },
    {
      id: "vo-chas",
      title: "Во час",
      items: [
        {
          q: "Дали учениците треба да симнат апликација?",
          a: [
            "Не. Апликацијата за учениците работи во прелистувачот на телефонот. Ако сакаат, со две допирања ја додаваат на почетниот екран и се отвора како секоја друга апликација. Се најавуваат со училишната Google или Microsoft сметка.",
          ],
        },
        {
          q: "Како работи присуството со QR-код?",
          a: [
            "На почетокот на часот таблата покажува QR-код. Ученикот го скенира со телефонот и е запишан како присутен, без прозивка. Кодот се менува на секои 30 секунди, па слика од него испратена дома не работи.",
            "Кога наставникот ќе притисне Крај, го добива целиот список: присутни, задоцнети и отсутни.",
          ],
        },
        {
          q: "Дали TeacherAid запишува во е-Дневник?",
          a: [
            "Не. TeacherAid ви го дава списокот на присутни, задоцнети и отсутни, подготвен за препишување во е-Дневник. Вие одлучувате што ќе запишете.",
          ],
        },
        {
          q: "Што ако ученик нема телефон?",
          a: [
            "Прашањето е на таблата за целиот клас, па ученикот може да го следи и без телефон. Присуството наставникот може да го промени од својата страна.",
          ],
        },
        {
          q: "Дали треба интернет?",
          a: [
            "Да. Лаптопот на наставникот и телефоните на учениците треба да се поврзани, преку училишната мрежа или преку мобилен интернет.",
          ],
        },
        {
          q: "Што е потребно во училницата?",
          a: [
            "Лаптоп за наставникот, проектор или паметна табла за да се гледа таблата, и телефоните на учениците. Ништо не се инсталира на училишните компјутери.",
          ],
        },
        {
          q: "Какви прашања прави TeacherAid?",
          a: [
            "Три вида: избор од понудени одговори, точно или неточно, и одговор со бројка. Секое прашање доаѓа со точниот одговор и кратко објаснување.",
            "Со едно копче ги менувате: полесно, потешко, повеќе прашања или пократки тајмери. Ништо не стигнува до учениците додека вие не го прегледате.",
          ],
        },
        {
          q: "За кои предмети е?",
          a: [
            "Прашањата се прават од материјалот што вие го додавате, па не се врзани за еден предмет. Ако имате лекција, TeacherAid прави прашања од неа.",
          ],
        },
        {
          q: "Како се добиваат поени?",
          a: [
            "За точен одговор ученикот добива 10 поени и до 5 повеќе за брзина. Табелата на класот се менува во живо додека пристигнуваат одговорите.",
          ],
        },
        {
          q: "Можат ли учениците да прашаат нешто анонимно?",
          a: [
            "Да. Учениците можат да ве прашаат она што не би го прашале на глас. Соучениците не гледаат кој прашува. Вие гледате.",
          ],
        },
      ],
    },
    {
      id: "podatoci",
      title: "Податоци и приватност",
      items: [
        {
          q: "Чии се податоците?",
          a: [
            "На училиштето. Училиштето одлучува што се прави со податоците, а TeacherAid ги обработува за него, по договор што го склучуваме со секое училиште и по Законот за заштита на личните податоци, усогласен со европскиот GDPR.",
          ],
        },
        {
          q: "Што чува TeacherAid?",
          a: [
            "Само она што го создава часот: кој бил на час, што одговорил и кои теми му се тешки. Никогаш не чуваме оценки, локација, телефонски броеви или податоци од други апликации. Апликацијата нема реклами и не следи никого.",
          ],
        },
        {
          q: "Што се испраќа до вештачката интелигенција?",
          a: ["Само материјалот на наставникот, од кој се прават прашањата. Имињата на учениците никогаш не се испраќаат."],
        },
        {
          q: "Каде се чуваат податоците и колку долго?",
          a: [
            "Во Европската унија, шифрирани при пренос и при чување, заедно со резервните копии и записите. Податоците од часовите се чуваат до крајот на следната учебна година, па се бришат или стануваат збирови без имиња. Ученик што заминува се брише за 30 дена од барањето на училиштето.",
          ],
        },
        {
          q: "Што гледа директорот?",
          a: [
            "Месечни збирови: колку часови се одржани, колку наставници ја користат апликацијата, какво е присуството и колку ученици одговараат. Без имиња на ученици.",
          ],
        },
      ],
    },
    {
      id: "pochetok",
      title: "Почеток",
      items: [
        {
          q: "Како да почнеме?",
          a: [
            "Пишете ни на hello@teacheraid.education. Доаѓаме во вашето училиште и со едно одделение водиме вистински час, од скенирањето до списокот на крајот, додека вие и наставниците гледате. Во учебната 2026/27 почнуваме со првите училишта.",
          ],
        },
      ],
    },
  ],
};

const faqEn: ArticleDict = {
  key: "faq",
  lang: "en",
  meta: {
    title: "TeacherAid FAQ: attendance, phones, data and e-Dnevnik",
    description:
      "What teachers and school directors ask about TeacherAid: how QR attendance works, whether students need to download an app, whether it needs the internet, how it relates to e-Dnevnik, and who owns the data.",
  },
  name: "FAQ",
  kicker: "Questions and answers",
  title: "What schools ask us.",
  lead: "Answers to the questions teachers and directors ask us, each in a few sentences.",
  sections: [
    {
      id: "about-teacheraid",
      title: "About TeacherAid",
      items: [
        {
          q: "What is TeacherAid?",
          a: [
            "TeacherAid is a classroom app for secondary schools and universities in North Macedonia. The teacher adds the lesson, as a PDF, a Word file or a few sentences, and TeacherAid prepares five to eight questions with the right answers and a short explanation.",
            "In class the teacher sends the questions from a laptop and students answer on their phones. Attendance is taken when students scan the QR code on the board. Every month the director gets a report on the whole school.",
          ],
        },
        {
          q: "Who is it for?",
          a: [
            "Teachers and directors in secondary schools, and professors and deans at universities. The teacher uses it in class. The director uses nothing: they just receive the monthly report. At a university, the dean gets the report.",
          ],
        },
        {
          q: "What language is it in?",
          a: ["Macedonian. The questions, the teacher app and the student app are all in Macedonian."],
        },
        {
          q: "How much does it cost?",
          a: [
            "The first lesson is free: we come to your school and run a real lesson with one class. For schools that continue, we agree the price directly. Write to us at hello@teacheraid.education.",
          ],
        },
      ],
    },
    {
      id: "in-class",
      title: "In class",
      items: [
        {
          q: "Do students have to download an app?",
          a: [
            "No. The student app runs in the phone's browser. If they like, two taps add it to the home screen, and it opens like any other app. Students sign in with their school Google or Microsoft account.",
          ],
        },
        {
          q: "How does QR attendance work?",
          a: [
            "At the start of the lesson the board shows a QR code. The student scans it with their phone and is marked present, with no roll call. The code changes every 30 seconds, so a photo of it sent home does not work.",
            "When the teacher presses End, they get the full list: present, late and absent.",
          ],
        },
        {
          q: "Does TeacherAid write to e-Dnevnik?",
          a: [
            "No. TeacherAid gives you the list of present, late and absent students, ready to copy into e-Dnevnik, the national class register. You decide what goes in.",
          ],
        },
        {
          q: "What if a student has no phone?",
          a: [
            "The question is on the board for the whole class, so the student can follow it without a phone. The teacher can change the student's attendance from their side.",
          ],
        },
        {
          q: "Does it need the internet?",
          a: ["Yes. The teacher's laptop and the students' phones need a connection, through the school network or mobile data."],
        },
        {
          q: "What does the classroom need?",
          a: [
            "A laptop for the teacher, a projector or smart board so the class can see the board, and the students' phones. Nothing is installed on the school's computers.",
          ],
        },
        {
          q: "What kind of questions does TeacherAid make?",
          a: [
            "Three kinds: multiple choice, true or false, and a number. Each question comes with the right answer and a short explanation.",
            "One button changes them: easier, harder, more questions or shorter timers. Nothing reaches your students until you have checked it.",
          ],
        },
        {
          q: "Which subjects is it for?",
          a: [
            "The questions are made from the material you add, so they are not tied to one subject. If you have a lesson, TeacherAid makes questions from it.",
          ],
        },
        {
          q: "How do students earn points?",
          a: ["A right answer earns 10 points and up to 5 more for speed. The class table moves live as the answers come in."],
        },
        {
          q: "Can students ask something anonymously?",
          a: ["Yes. Students can ask you what they would never ask out loud. Classmates do not see who is asking. You do."],
        },
      ],
    },
    {
      id: "data",
      title: "Data and privacy",
      items: [
        {
          q: "Who owns the data?",
          a: [
            "The school. The school decides what is done with the data, and TeacherAid processes it for the school, under an agreement we sign with each one and under North Macedonia's Law on Personal Data Protection, which follows the EU's GDPR.",
          ],
        },
        {
          q: "What does TeacherAid keep?",
          a: [
            "Only what the lesson makes: who was there, what they answered and which topics they find hard. We never keep grades, location, phone numbers or data from other apps. The app has no ads and tracks no one.",
          ],
        },
        {
          q: "What is sent to the AI?",
          a: ["Only the teacher's material, which the questions are made from. Student names are never sent."],
        },
        {
          q: "Where is the data stored, and for how long?",
          a: [
            "In the European Union, encrypted in transit and at rest, along with backups and logs. Lesson data is kept until the end of the next school year, then deleted or turned into totals without names. A student who leaves is deleted within 30 days of the school's request.",
          ],
        },
        {
          q: "What does the director see?",
          a: [
            "Monthly totals: how many lessons were held, how many teachers use the app, what attendance looks like and how many students answer. No student names.",
          ],
        },
      ],
    },
    {
      id: "start",
      title: "Getting started",
      items: [
        {
          q: "How do we start?",
          a: [
            "Write to us at hello@teacheraid.education. We come to your school and run a real lesson with one class, from the scan to the list at the end, while you and your teachers watch. We start with the first schools in the 2026/27 school year.",
          ],
        },
      ],
    },
  ],
};

// Other tools' facts: checked 2026-10-31 on kahoot.com/schools/plans and mentimeter.com/plans.
// Re-check before changing pageUpdated.alternative.
const alternativeMk: ArticleDict = {
  key: "alternative",
  lang: "mk",
  meta: {
    title: "Алтернатива на Kahoot за час на македонски: TeacherAid",
    description:
      "TeacherAid или Kahoot? Kahoot е квиз-игра за десет минути. TeacherAid е за целиот час: прашања од вашата лекција на македонски, присуство со QR-код, список за е-Дневник и месечен извештај за директорот.",
  },
  name: "TeacherAid или Kahoot",
  kicker: "Алтернатива на Kahoot",
  title: "TeacherAid или Kahoot?",
  lead: "Kahoot е квиз-игра, одлична за десет минути повторување. TeacherAid е направен за целиот час во македонско училиште. Еве ја разликата, искрено.",
  sections: [
    {
      id: "kratko",
      title: "Накратко",
      paras: [
        "Kahoot е игра со квиз во живо: наставникот пушта прашања, учениците одговараат на своите уреди, а на крајот има победник. Прашањата ги подготвувате сами или ги земате од библиотеката.",
        "TeacherAid од вашата лекција прави прашања на македонски, го запишува присуството кога учениците ќе скенираат QR-код, на крајот на часот ви дава список подготвен за е-Дневник, а директорот секој месец добива извештај за целото училиште.",
      ],
    },
    {
      id: "sporedba",
      title: "Споредба",
      table: {
        caption: "TeacherAid, Kahoot и Mentimeter, точка по точка",
        cols: ["TeacherAid", "Kahoot", "Mentimeter"],
        rows: [
          {
            label: "Направено за",
            cells: ["Целиот час: прашања, присуство, резултати", "Квиз-игра во живо", "Анкети и прашања за време на презентација"],
          },
          {
            label: "Прашања од вашата лекција",
            cells: ["Да, од PDF, Word или неколку реченици, на македонски", "Ги пишувате вие или ги земате од библиотеката", "Ги пишувате вие"],
          },
          {
            label: "Присуство",
            cells: ["Да, со QR-код што се менува на секои 30 секунди", "Не е наведено во плановите", "Не е наведено во плановите"],
          },
          {
            label: "Список за е-Дневник",
            cells: ["Да, на крајот на секој час", "Не", "Не"],
          },
          {
            label: "Извештај за директорот",
            cells: ["Да, PDF секој месец, без имиња на ученици", "Извештаи за наставникот", "Не е наведено во плановите"],
          },
          {
            label: "Цена",
            cells: [
              "Првиот час е бесплатен; за училиштата што продолжуваат, по договор",
              "По наставник, од 3 USD месечно со годишна наплата (Bronze, до 50 учесници)",
              "По презентер, од 11,99 USD месечно со годишна наплата (Basic); посебни понуди за образование",
            ],
          },
        ],
        note: "Податоците за Kahoot и Mentimeter се од нивните страници за цени, проверени на 31 октомври 2026. Цените се без данок.",
      },
    },
    {
      id: "koga-kahoot",
      title: "Кога е подобар Kahoot?",
      paras: [
        "Кога ви треба брза игра за повторување, а присуството и извештаите не ви требаат. Kahoot има голема библиотека готови квизови и многу ученици веќе го знаат. Ако тоа ви е доволно, тоа е добар избор.",
      ],
    },
    {
      id: "koga-teacheraid",
      title: "Кога е подобар TeacherAid?",
      paras: ["Кога сакате една алатка за целиот час, а не пет:"],
      list: [
        "Прашањата ги прави од вашиот материјал, на македонски, а вие ги прегледувате пред да стигнат до учениците.",
        "Присуството е готово со едно скенирање, без прозивка.",
        "На крајот на часот го имате списокот за е-Дневник и прашањата на кои класот најмногу грешеше.",
        "Директорот секој месец добива извештај, без да учи нова апликација.",
        "Податоците се на училиштето и се чуваат во Европската унија.",
      ],
    },
    {
      id: "dvete",
      title: "Може ли и двете?",
      paras: [
        "Да. TeacherAid не ве спречува да пуштите Kahoot. Ако веќе користите Kahoot за повторување на крајот на неделата, можете да продолжите, а TeacherAid да го води секојдневниот час.",
      ],
    },
    {
      id: "drugi",
      title: "А Wayground (порано Quizizz) и Mentimeter?",
      paras: [
        "Quizizz го смени името во Wayground во јуни 2025. Тоа е алатка за квизови и лекции што учениците ги решаваат во живо или со свое темпо. Mentimeter е за анкети, облаци од зборови и прашања за време на презентација.",
        "Двете се добри алатки за дел од часот. TeacherAid е направен за целиот час во македонско училиште: од лекцијата до присуството и извештајот.",
      ],
    },
  ],
  sources: [
    { label: "Kahoot: планови за училишта (kahoot.com, 31.10.2026)", href: "https://kahoot.com/schools/plans/" },
    { label: "Mentimeter: планови (mentimeter.com, 31.10.2026)", href: "https://www.mentimeter.com/plans" },
    {
      label: "THE Journal: Quizizz станува Wayground (24.6.2025)",
      href: "https://thejournal.com/Articles/2025/06/24/Quizizz-Rebrands-as-Wayground-Announces-New-AI-Features.aspx",
    },
  ],
};

const alternativeEn: ArticleDict = {
  key: "alternative",
  lang: "en",
  meta: {
    title: "A Kahoot alternative for Macedonian classrooms: TeacherAid",
    description:
      "TeacherAid or Kahoot? Kahoot is a ten-minute quiz game. TeacherAid runs the whole lesson: questions from your own material in Macedonian, QR attendance, a list for e-Dnevnik and a monthly report for the director.",
  },
  name: "TeacherAid or Kahoot",
  kicker: "Kahoot alternative",
  title: "TeacherAid or Kahoot?",
  lead: "Kahoot is a quiz game, great for ten minutes of review. TeacherAid is built for the whole lesson in a Macedonian school. Here is the difference, honestly.",
  sections: [
    {
      id: "short",
      title: "In short",
      paras: [
        "Kahoot is a live quiz game: the teacher plays the questions, students answer on their devices, and there is a winner at the end. You write the questions yourself or take them from the library.",
        "TeacherAid makes questions in Macedonian from your lesson, takes attendance when students scan a QR code, gives you a list ready for e-Dnevnik at the end of class, and sends the director a monthly report on the whole school.",
      ],
    },
    {
      id: "comparison",
      title: "Comparison",
      table: {
        caption: "TeacherAid, Kahoot and Mentimeter, point by point",
        cols: ["TeacherAid", "Kahoot", "Mentimeter"],
        rows: [
          {
            label: "Built for",
            cells: ["The whole lesson: questions, attendance, results", "A live quiz game", "Polls and questions during a presentation"],
          },
          {
            label: "Questions from your lesson",
            cells: ["Yes, from a PDF, Word file or a few sentences, in Macedonian", "You write them or take them from the library", "You write them"],
          },
          {
            label: "Attendance",
            cells: ["Yes, with a QR code that changes every 30 seconds", "Not listed in its plans", "Not listed in its plans"],
          },
          {
            label: "List for e-Dnevnik",
            cells: ["Yes, at the end of every lesson", "No", "No"],
          },
          {
            label: "Report for the director",
            cells: ["Yes, a PDF every month, with no student names", "Reports for the teacher", "Not listed in its plans"],
          },
          {
            label: "Price",
            cells: [
              "The first lesson is free; for schools that continue, agreed directly",
              "Per teacher, from USD 3 a month billed yearly (Bronze, up to 50 participants)",
              "Per presenter, from USD 11.99 a month billed yearly (Basic); separate education offers",
            ],
          },
        ],
        note: "Kahoot and Mentimeter facts are from their own pricing pages, checked on 31 October 2026. Prices exclude tax.",
      },
    },
    {
      id: "when-kahoot",
      title: "When is Kahoot the better choice?",
      paras: [
        "When you want a quick review game and need neither attendance nor reports. Kahoot has a large library of ready-made quizzes and many students already know it. If that is enough for you, it is a good choice.",
      ],
    },
    {
      id: "when-teacheraid",
      title: "When is TeacherAid the better choice?",
      paras: ["When you want one tool for the whole lesson, not five:"],
      list: [
        "It makes the questions from your own material, in Macedonian, and you check them before they reach your students.",
        "Attendance is one scan, with no roll call.",
        "At the end of class you have the list for e-Dnevnik and the questions the class got wrong most.",
        "The director gets a report every month without learning a new app.",
        "The data belongs to the school and stays in the European Union.",
      ],
    },
    {
      id: "both",
      title: "Can I use both?",
      paras: [
        "Yes. TeacherAid does not stop you from playing a Kahoot. If you already use Kahoot for a review at the end of the week, keep it, and let TeacherAid run the everyday lesson.",
      ],
    },
    {
      id: "others",
      title: "What about Wayground (formerly Quizizz) and Mentimeter?",
      paras: [
        "Quizizz renamed itself Wayground in June 2025. It is a tool for quizzes and lessons that students do live or at their own pace. Mentimeter is for polls, word clouds and questions during a presentation.",
        "Both are good tools for part of a lesson. TeacherAid is built for the whole lesson in a Macedonian school: from the lesson to attendance and the report.",
      ],
    },
  ],
  sources: [
    { label: "Kahoot: plans for schools (kahoot.com, 31 Oct 2026)", href: "https://kahoot.com/schools/plans/" },
    { label: "Mentimeter: plans (mentimeter.com, 31 Oct 2026)", href: "https://www.mentimeter.com/plans" },
    {
      label: "THE Journal: Quizizz rebrands as Wayground (24 Jun 2025)",
      href: "https://thejournal.com/Articles/2025/06/24/Quizizz-Rebrands-as-Wayground-Announces-New-AI-Features.aspx",
    },
  ],
};

const aboutMk: ArticleDict = {
  key: "about",
  lang: "mk",
  meta: {
    title: "За TeacherAid: апликација за часот, направена во Битола",
    description:
      "TeacherAid е мал тим од Битола што прави апликација за часот за средните училишта и факултетите во Македонија. Почнавме на Startup Weekend Bitola во септември 2026.",
  },
  name: "За нас",
  kicker: "За нас",
  title: "Секој час да почнува со прашање.",
  lead: "TeacherAid е мал тим од Битола. Правиме апликација за часот за средните училишта и факултетите во Македонија.",
  sections: [
    {
      id: "pochetok",
      title: "Како почнавме",
      paras: [
        "Почнавме на Startup Weekend Bitola, од 11 до 13 септември 2026, со едно прашање: зошто толку часови почнуваат исто, со наставник што зборува и триесет глави наведнати кон телефоните?",
        "Нашиот одговор е телефонот да стане дел од лекцијата. Наставникот поставува прашање, секој ученик одговара, а наставникот веднаш гледа кој разбрал.",
      ],
    },
    {
      id: "shto-pravime",
      title: "Што правиме",
      paras: [
        "TeacherAid од лекцијата на наставникот прави прашања на македонски. Во час наставникот ги испраќа од лаптопот, учениците одговараат на своите телефони, а присуството се запишува со едно скенирање на QR-код. На крајот на часот наставникот добива список подготвен за е-Дневник, а директорот секој месец добива извештај за целото училиште.",
      ],
    },
    {
      id: "zoshto-prashanja",
      title: "Зошто прашања во час",
      paras: [
        "Обидот да се одговори, дури и кога одговорот е погрешен, помага подоцна да се запомни. Истражувачите тоа го нарекуваат ефект на претходно тестирање (Richland, Kornell и Kao, 2009).",
        "Грешките направени со самодоверба полесно се поправаат кога ученикот веднаш го види точниот одговор (Metcalfe, 2017). Затоа TeacherAid го открива точниот одговор пред целиот клас, со кратко објаснување.",
      ],
    },
    {
      id: "pravila",
      title: "Како работиме",
      list: [
        "Наставникот одлучува. Ништо не стигнува до учениците додека наставникот не го прегледа, а TeacherAid не запишува во е-Дневник.",
        "Податоците се на училиштето. Ги обработуваме за него, по договор и по Законот за заштита на личните податоци, и ги чуваме во Европската унија.",
        "Директорот нема ништо да учи. Извештајот сам стигнува на е-пошта.",
        "Без реклами и без следење.",
      ],
    },
    {
      id: "kontakt",
      title: "Каде сме",
      paras: [
        "Во Битола, Македонија. Пишете ни на hello@teacheraid.education. Во учебната 2026/27 почнуваме со првите училишта, а првиот час во секое училиште е бесплатен.",
      ],
    },
  ],
  sources: [
    {
      label: "Richland, Kornell и Kao (2009). The pretesting effect. Journal of Experimental Psychology: Applied, 15(3), 243–257.",
      href: "https://doi.org/10.1037/a0016496",
    },
    {
      label: "Metcalfe (2017). Learning from errors. Annual Review of Psychology, 68, 465–489.",
      href: "https://doi.org/10.1146/annurev-psych-010416-044022",
    },
  ],
};

const aboutEn: ArticleDict = {
  key: "about",
  lang: "en",
  meta: {
    title: "About TeacherAid: a classroom app made in Bitola",
    description:
      "TeacherAid is a small team from Bitola making a classroom app for secondary schools and universities in North Macedonia. We started at Startup Weekend Bitola in September 2026.",
  },
  name: "About",
  kicker: "About us",
  title: "Every class starts with a question.",
  lead: "TeacherAid is a small team from Bitola. We make a classroom app for secondary schools and universities in North Macedonia.",
  sections: [
    {
      id: "start",
      title: "How we started",
      paras: [
        "We started at Startup Weekend Bitola, 11 to 13 September 2026, with one question: why do so many lessons start the same way, with a teacher talking and thirty heads bent over their phones?",
        "Our answer is to make the phone part of the lesson. The teacher asks a question, every student answers, and the teacher sees at once who understood.",
      ],
    },
    {
      id: "what",
      title: "What we make",
      paras: [
        "TeacherAid turns the teacher's lesson into questions in Macedonian. In class the teacher sends them from a laptop, students answer on their phones, and attendance is taken with one scan of a QR code. At the end of class the teacher gets a list ready for e-Dnevnik, and every month the director gets a report on the whole school.",
      ],
    },
    {
      id: "why",
      title: "Why questions in class",
      paras: [
        "Trying to answer, even when the answer is wrong, helps students remember later. Researchers call it the pretesting effect (Richland, Kornell and Kao, 2009).",
        "Mistakes made with confidence are corrected more readily when the student sees the right answer straight away (Metcalfe, 2017). That is why TeacherAid reveals the right answer to the whole class, with a short explanation.",
      ],
    },
    {
      id: "rules",
      title: "How we work",
      list: [
        "The teacher decides. Nothing reaches students until the teacher has checked it, and TeacherAid never writes to e-Dnevnik.",
        "The data belongs to the school. We process it for the school, under an agreement and North Macedonia's Law on Personal Data Protection, and keep it in the European Union.",
        "The director has nothing to learn. The report arrives by email on its own.",
        "No ads and no tracking.",
      ],
    },
    {
      id: "contact",
      title: "Where we are",
      paras: [
        "In Bitola, North Macedonia. Write to us at hello@teacheraid.education. We start with the first schools in the 2026/27 school year, and the first lesson in every school is free.",
      ],
    },
  ],
  sources: [
    {
      label: "Richland, Kornell and Kao (2009). The pretesting effect. Journal of Experimental Psychology: Applied, 15(3), 243–257.",
      href: "https://doi.org/10.1037/a0016496",
    },
    {
      label: "Metcalfe (2017). Learning from errors. Annual Review of Psychology, 68, 465–489.",
      href: "https://doi.org/10.1146/annurev-psych-010416-044022",
    },
  ],
};

// The two guides answer what teachers in Macedonia actually type into Google (autocomplete, hl=mk,
// 2026-11-24): "дигитални алатки во наставата" and "вештачка интелигенција во образованието".
// Other tools' prices are the ones on the comparison page, checked 2026-10-31.
const toolsMk: ArticleDict = {
  key: "tools",
  lang: "mk",
  meta: {
    title: "Дигитални алатки во наставата: водич за наставници во Македонија",
    description:
      "Кои дигитални алатки ги има наставникот во Македонија и за што служи секоја: е-Дневник, EDUINO, Kahoot, Mentimeter, Google и Microsoft Forms, вештачка интелигенција и TeacherAid. Со пет прашања за избор.",
  },
  name: "Дигитални алатки",
  kicker: "Водич за наставници",
  title: "Дигитални алатки во наставата.",
  lead: "Наставникот во Македонија денес има повеќе алатки отколку време да ги пробува. Еве ги подредени по тоа што прават и што бараат од вас и од учениците.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Секоја алатка решава еден дел од работата. е-Дневник ја води службената евиденција, EDUINO нуди материјали, Google и Microsoft служат за споделување и тестови, а алатките за квиз и анкета го оживуваат часот. Ниедна не мора да ги замени другите.",
        "Подобро е една алатка што ја користите секој ден, отколку пет што ги пробавте по еднаш.",
      ],
    },
    {
      id: "nacionalni",
      title: "Националните алатки",
      items: [
        {
          q: "Што е е-Дневник?",
          a: [
            "е-Дневник е националниот електронски дневник: во него се внесуваат присуството и оценките на учениците. Тоа е службената евиденција на училиштето и ниедна алатка за часот не ја заменува.",
          ],
        },
        {
          q: "Што е EDUINO?",
          a: [
            "EDUINO е националната платформа за дигитално учење. Во март 2020 UNICEF, заедно со Министерството за образование и наука и Бирото за развој на образованието, ја отвори нејзината е-училница, со видео-часови и активности за учење.",
            "EDUINO е библиотека на материјали. Добро е место за подготовка и за домашна работа, но не е алатка за водење на часот во живо.",
          ],
        },
      ],
    },
    {
      id: "vo-chas",
      title: "Алатки за во часот",
      items: [
        {
          q: "Квиз-игри: Kahoot и Wayground",
          a: [
            "Kahoot е квиз-игра во живо: прашањата се на таблата, учениците одговараат на своите уреди, а на крајот има победник. Wayground, порано Quizizz, нуди квизови што учениците ги решаваат во живо или со свое темпо. Двете се добри за десет минути повторување.",
            "Прашањата ги пишувате сами или ги земате од библиотеката. Платените планови на Kahoot за наставник почнуваат од 3 USD месечно со годишна наплата (проверено на 31 октомври 2026).",
          ],
        },
        {
          q: "Анкети за време на предавање: Mentimeter",
          a: [
            "Mentimeter е за анкети, облаци од зборови и прашања од публиката. Корисен е кога сакате брзо да видите што мисли целиот клас, без оценување.",
          ],
        },
        {
          q: "Тестови и формулари: Google Forms и Microsoft Forms",
          a: [
            "За тест или анкета што учениците ги решаваат сами, во час или дома. Ги отворате со училишната Google или Microsoft сметка. Не се за прашања во живо: резултатите ги гледате откако учениците ќе предадат.",
          ],
        },
        {
          q: "Целиот час: TeacherAid",
          a: [
            "TeacherAid од вашата лекција прави прашања на македонски, вие ги испраќате од лаптопот, а учениците одговараат на своите телефони. Присуството се запишува со скенирање на QR-код, а на крајот го имате списокот за е-Дневник. Ништо не стигнува до учениците додека вие не го прегледате.",
          ],
        },
      ],
    },
    {
      id: "vestachka-inteligencija",
      title: "Вештачка интелигенција за подготовка",
      paras: [
        "Алатките како ChatGPT можат да предложат прашања, објаснувања или полесна и потешка верзија на задача. Заштедуваат време, но грешат со сигурен тон: проверете сè пред да стигне до учениците.",
        "Никогаш не внесувајте имиња, оценки или други лични податоци на ученици во јавна алатка за вештачка интелигенција. Повеќе за ова во водичот за вештачката интелигенција во образованието.",
      ],
    },
    {
      id: "izbor",
      title: "Како да изберете: пет прашања",
      list: [
        "Дали алатката и прашањата се на македонски?",
        "Што треба да имаат учениците: апликација, сметка, телефон, интернет?",
        "Каде одат податоците на учениците? Училиштето одговара за нив според Законот за заштита на личните податоци.",
        "Кој плаќа, наставникот или училиштето, и колку?",
        "Колку време бара подготовката пред секој час?",
      ],
    },
  ],
  sources: [
    {
      label: "UNICEF: Нова дигитална платформа за учење од далечина (март 2020)",
      href: "https://www.unicef.org/northmacedonia/press-releases/new-digital-learning-platform-launched-support-distance-learning-children",
    },
    { label: "Kahoot: планови за училишта (kahoot.com, 31.10.2026)", href: "https://kahoot.com/schools/plans/" },
    { label: "Mentimeter: планови (mentimeter.com, 31.10.2026)", href: "https://www.mentimeter.com/plans" },
  ],
};

const toolsEn: ArticleDict = {
  key: "tools",
  lang: "en",
  meta: {
    title: "Digital tools for teaching: a guide for teachers in North Macedonia",
    description:
      "The digital tools a teacher in North Macedonia has, and what each is for: e-Dnevnik, EDUINO, Kahoot, Mentimeter, Google and Microsoft Forms, AI and TeacherAid. With five questions for choosing.",
  },
  name: "Digital tools",
  kicker: "A guide for teachers",
  title: "Digital tools for teaching.",
  lead: "A teacher in North Macedonia has more tools today than time to try them. Here they are, sorted by what they do and what they ask of you and your students.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "Each tool does one part of the job. e-Dnevnik keeps the official record, EDUINO offers materials, Google and Microsoft are for sharing and tests, and quiz and poll tools bring the lesson to life. None of them has to replace the others.",
        "One tool you use every day beats five you tried once.",
      ],
    },
    {
      id: "national",
      title: "The national tools",
      items: [
        {
          q: "What is e-Dnevnik?",
          a: [
            "e-Dnevnik is the national electronic class register: attendance and grades are entered in it. It is the school's official record, and no classroom tool replaces it.",
          ],
        },
        {
          q: "What is EDUINO?",
          a: [
            "EDUINO is the national digital learning platform. In March 2020 UNICEF, with the Ministry of Education and Science and the Bureau for Development of Education, opened its e-classroom, with video lessons and learning activities.",
            "EDUINO is a library of materials. It is a good place for preparation and homework, but not a tool for running a live lesson.",
          ],
        },
      ],
    },
    {
      id: "in-class",
      title: "Tools for the lesson",
      items: [
        {
          q: "Quiz games: Kahoot and Wayground",
          a: [
            "Kahoot is a live quiz game: the questions are on the board, students answer on their devices, and there is a winner at the end. Wayground, formerly Quizizz, offers quizzes students do live or at their own pace. Both are good for ten minutes of review.",
            "You write the questions yourself or take them from the library. Kahoot's paid teacher plans start at USD 3 a month, billed yearly (checked on 31 October 2026).",
          ],
        },
        {
          q: "Polls during a lecture: Mentimeter",
          a: [
            "Mentimeter is for polls, word clouds and questions from the audience. It is useful when you want to see quickly what the whole class thinks, without grading.",
          ],
        },
        {
          q: "Tests and forms: Google Forms and Microsoft Forms",
          a: [
            "For a test or survey students do on their own, in class or at home. You open them with the school's Google or Microsoft account. They are not for live questions: you see the results after students hand in.",
          ],
        },
        {
          q: "The whole lesson: TeacherAid",
          a: [
            "TeacherAid turns your lesson into questions in Macedonian, you send them from your laptop, and students answer on their phones. Attendance is taken with one scan of a QR code, and at the end you have the list for e-Dnevnik. Nothing reaches your students until you have checked it.",
          ],
        },
      ],
    },
    {
      id: "ai",
      title: "AI for preparation",
      paras: [
        "Tools like ChatGPT can suggest questions, explanations, or an easier and a harder version of a task. They save time, but they are wrong in a confident voice: check everything before it reaches your students.",
        "Never type students' names, grades or other personal data into a public AI tool. More on this in the guide to AI in education.",
      ],
    },
    {
      id: "choosing",
      title: "How to choose: five questions",
      list: [
        "Are the tool and its questions in Macedonian?",
        "What do students need: an app, an account, a phone, the internet?",
        "Where does students' data go? The school is answerable for it under the Law on Personal Data Protection.",
        "Who pays, the teacher or the school, and how much?",
        "How much preparation does each lesson take?",
      ],
    },
  ],
  sources: [
    {
      label: "UNICEF: New digital learning platform launched to support distance learning (March 2020)",
      href: "https://www.unicef.org/northmacedonia/press-releases/new-digital-learning-platform-launched-support-distance-learning-children",
    },
    { label: "Kahoot: plans for schools (kahoot.com, 31 Oct 2026)", href: "https://kahoot.com/schools/plans/" },
    { label: "Mentimeter: plans (mentimeter.com, 31 Oct 2026)", href: "https://www.mentimeter.com/plans" },
  ],
};

const aiMk: ArticleDict = {
  key: "ai",
  lang: "mk",
  meta: {
    title: "Вештачка интелигенција во образованието: што може во час, а што не",
    description:
      "Што може вештачката интелигенција за наставникот, каде греши, како да ги заштитите податоците на учениците и зошто прашањата во час помагаат во учењето. Водич за наставници во Македонија.",
  },
  name: "Вештачка интелигенција",
  kicker: "Водич за наставници",
  title: "Вештачката интелигенција во часот.",
  lead: "Вештачката интелигенција може да ви заштеди време за подготовка. Не може да го замени наставникот, и не смее да ги добие податоците на учениците. Еве каде е границата.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Вештачката интелигенција е добра во предлагање: прашања, објаснувања, верзии на задача. Лоша е во знаење што е точно за вашиот клас. Затоа наставникот одлучува, а алатката помага.",
      ],
    },
    {
      id: "shto-moze",
      title: "Што може за наставникот",
      list: [
        "Од вашиот материјал да предложи прашања, со точните одговори и кратко објаснување.",
        "Да направи полесна и потешка верзија на исто прашање, за класови што се на различно ниво.",
        "Да предложи прашање за почетокот на часот, пред да ја предавате темата.",
        "Да објасни тежок поим со други зборови, кога првото објаснување не стигнало до сите.",
      ],
    },
    {
      id: "shto-ne-moze",
      title: "Што не може",
      list: [
        "Не знае кога греши. Може да напише погрешен факт со ист сигурен тон како и точниот. Проверете сè пред да стигне до учениците.",
        "Не ги познава вашите ученици: што разбрале вчера, кој молчи, кој се мачи.",
        "Не одлучува наместо вас. Наставникот бира што ќе се праша, кога и како.",
      ],
    },
    {
      id: "podatoci",
      title: "Податоците на учениците",
      paras: [
        "Никогаш не внесувајте имиња, оценки или други лични податоци на ученици во јавна алатка за вештачка интелигенција. Училиштето одговара за податоците на учениците според Законот за заштита на личните податоци, кој го следи европскиот GDPR.",
        "Пред училиштето да избере алатка, нека праша: каде се чуваат податоците, дали остануваат во Европската унија, дали се користат за обучување модели и кој може да ги види.",
      ],
    },
    {
      id: "prashanja",
      title: "Зошто прашањата во час помагаат",
      paras: [
        "Обидот да се одговори, дури и кога одговорот е погрешен, помага подоцна да се запомни. Истражувачите тоа го нарекуваат ефект на претходно тестирање (Richland, Kornell и Kao, 2009).",
        "Грешките направени со самодоверба полесно се поправаат кога ученикот веднаш го види точниот одговор (Metcalfe, 2017). Затоа е важно прашањето да стигне до секој ученик, а точниот одговор да се открие пред целиот клас.",
      ],
    },
    {
      id: "teacheraid",
      title: "Како TeacherAid ја користи вештачката интелигенција",
      list: [
        "Прашањата се прават само од материјалот што наставникот го додава.",
        "Имињата на учениците никогаш не се испраќаат до вештачката интелигенција.",
        "Ништо не стигнува до учениците додека наставникот не го прегледа.",
        "Податоците, резервните копии и записите остануваат во Европската унија.",
      ],
    },
  ],
  sources: [
    {
      label: "Richland, Kornell и Kao (2009). The pretesting effect. Journal of Experimental Psychology: Applied, 15(3), 243–257.",
      href: "https://doi.org/10.1037/a0016496",
    },
    {
      label: "Metcalfe (2017). Learning from errors. Annual Review of Psychology, 68, 465–489.",
      href: "https://doi.org/10.1146/annurev-psych-010416-044022",
    },
  ],
};

const aiEn: ArticleDict = {
  key: "ai",
  lang: "en",
  meta: {
    title: "AI in education: what it can do in a lesson, and what it can't",
    description:
      "What AI can do for a teacher, where it goes wrong, how to protect students' data, and why questions in class help students learn. A guide for teachers in North Macedonia.",
  },
  name: "AI in education",
  kicker: "A guide for teachers",
  title: "AI in the lesson.",
  lead: "AI can save you preparation time. It cannot replace the teacher, and it must not get students' data. Here is where the line is.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "AI is good at suggesting: questions, explanations, versions of a task. It is bad at knowing what is true for your class. So the teacher decides, and the tool helps.",
      ],
    },
    {
      id: "can",
      title: "What it can do for a teacher",
      list: [
        "Suggest questions from your material, with the right answers and a short explanation.",
        "Make an easier and a harder version of the same question, for classes at different levels.",
        "Suggest a question for the start of the lesson, before you teach the topic.",
        "Explain a hard idea in other words, when the first explanation did not reach everyone.",
      ],
    },
    {
      id: "cannot",
      title: "What it cannot do",
      list: [
        "It does not know when it is wrong. It can state a false fact in the same confident voice as a true one. Check everything before it reaches your students.",
        "It does not know your students: what they understood yesterday, who stays quiet, who is struggling.",
        "It does not decide for you. The teacher chooses what to ask, when and how.",
      ],
    },
    {
      id: "data",
      title: "Students' data",
      paras: [
        "Never type students' names, grades or other personal data into a public AI tool. The school is answerable for students' data under North Macedonia's Law on Personal Data Protection, which follows the EU's GDPR.",
        "Before a school chooses a tool, it should ask: where is the data stored, does it stay in the European Union, is it used to train models, and who can see it.",
      ],
    },
    {
      id: "questions",
      title: "Why questions in class help",
      paras: [
        "Trying to answer, even when the answer is wrong, helps students remember later. Researchers call it the pretesting effect (Richland, Kornell and Kao, 2009).",
        "Mistakes made with confidence are corrected more readily when the student sees the right answer straight away (Metcalfe, 2017). That is why it matters that the question reaches every student, and that the right answer is revealed to the whole class.",
      ],
    },
    {
      id: "teacheraid",
      title: "How TeacherAid uses AI",
      list: [
        "Questions are made only from the material the teacher adds.",
        "Students' names are never sent to the AI.",
        "Nothing reaches students until the teacher has checked it.",
        "Data, backups and logs stay in the European Union.",
      ],
    },
  ],
  sources: [
    {
      label: "Richland, Kornell and Kao (2009). The pretesting effect. Journal of Experimental Psychology: Applied, 15(3), 243–257.",
      href: "https://doi.org/10.1037/a0016496",
    },
    {
      label: "Metcalfe (2017). Learning from errors. Annual Review of Psychology, 68, 465–489.",
      href: "https://doi.org/10.1146/annurev-psych-010416-044022",
    },
  ],
};


// The press page makes writing about TeacherAid, and linking to it, a five-minute job for a
// journalist, a school or an organiser. Links from other sites are what the site lacks most
// (brain: Areas/website/ranking-plan.md). Only facts already on the site; no names (decided
// 2026-10-31).
const pressMk: ArticleDict = {
  key: "press",
  lang: "mk",
  meta: {
    title: "TeacherAid за медиуми: факти, лого и слики",
    description:
      "Сè што ви треба за да напишете за TeacherAid: краток и подолг опис, факти, логоа, слики од апликацијата и контакт. Апликација за часот од Битола, за средни училишта и факултети во Македонија.",
  },
  name: "За медиуми",
  kicker: "За медиуми, училишта и организатори",
  title: "Пишувате за TeacherAid?",
  lead: "Тука е сè што ви треба: опис во една реченица и во еден пасус, фактите, логоата и сликите од апликацијата. Слободно користете ги.",
  sections: [
    {
      id: "edna-recenica",
      title: "Во една реченица",
      paras: [
        "TeacherAid е апликација за часот од Битола: од лекцијата на наставникот прави прашања, учениците одговараат на своите телефони, а присуството се запишува со едно скенирање.",
      ],
    },
    {
      id: "pasus",
      title: "Во еден пасус",
      paras: [
        "TeacherAid е апликација за часот за средни училишта и факултети во Македонија. Наставникот ја додава лекцијата, како PDF, Word или неколку реченици, а TeacherAid подготвува прашања на македонски со точните одговори и кратко објаснување. Во час наставникот ги испраќа од лаптопот, учениците одговараат на своите телефони, а присуството се запишува кога ќе го скенираат QR-кодот на таблата. На крајот на часот наставникот го има списокот за е-Дневник, а директорот секој месец добива извештај. Податоците се на училиштето и се чуваат во Европската унија.",
      ],
    },
    {
      id: "fakti",
      title: "Факти",
      list: [
        "Почеток: Startup Weekend Bitola, 11 до 13 септември 2026.",
        "Седиште: Битола, Македонија.",
        "За кого: наставници и директори во средните училишта, професори и декани на факултетите.",
        "Јазик: македонски.",
        "Првите училишта: учебната 2026/27. Првиот час во секое училиште е бесплатен.",
        "Веб-страница: teacheraid.education. Контакт: hello@teacheraid.education.",
      ],
    },
    {
      id: "logo",
      title: "Лого и слики",
      paras: ["Логоата и сликите од апликацијата се слободни за објавување во текст за TeacherAid. Ве молиме не ги менувајте боите и обликот на логото."],
      links: [
        { label: "Сите логоа (ZIP, 22 датотеки)", href: "/brand/teacheraid-logo-kit.zip", note: "SVG и PNG, во боја, црно, бело", download: true },
        { label: "Лого, SVG", href: "/brand/teacheraid-logo-ink.svg", download: true },
        { label: "Икона на апликацијата, PNG 1024 × 1024", href: "/brand/teacheraid-app-icon-square.png", download: true },
        { label: "Апликацијата за наставникот", href: "/site-v2/screens/t-today-mk-1800.webp", note: "слика од екранот, 1800 пиксели" },
        { label: "Апликацијата за ученикот", href: "/site-v2/screens/s-question-mk-780.webp", note: "слика од екранот, прашање од лекцијата" },
      ],
    },
    {
      id: "vrska",
      title: "Врска до нас",
      paras: [
        "Ако пишувате за нас, ве молиме ставете врска до teacheraid.education. Името TeacherAid лесно се меша со англиското „teacher aide“, па врската им помага на читателите да не најдат.",
      ],
    },
    {
      id: "kontakt",
      title: "Контакт",
      paras: [
        "За разговор, прашања или да дојдете на час: hello@teacheraid.education.",
      ],
    },
  ],
};

const pressEn: ArticleDict = {
  key: "press",
  lang: "en",
  meta: {
    title: "TeacherAid press kit: facts, logos and images",
    description:
      "Everything you need to write about TeacherAid: a short and a longer description, facts, logos, app screenshots and contact. A classroom app from Bitola for secondary schools and universities in North Macedonia.",
  },
  name: "Press",
  kicker: "For media, schools and organisers",
  title: "Writing about TeacherAid?",
  lead: "Here is everything you need: a description in one sentence and in one paragraph, the facts, the logos and screenshots of the app. Feel free to use them.",
  sections: [
    {
      id: "one-sentence",
      title: "In one sentence",
      paras: [
        "TeacherAid is a classroom app from Bitola: it turns the teacher's lesson into questions, students answer on their phones, and attendance is taken with one scan.",
      ],
    },
    {
      id: "paragraph",
      title: "In one paragraph",
      paras: [
        "TeacherAid is a classroom app for secondary schools and universities in North Macedonia. The teacher adds the lesson, as a PDF, a Word file or a few sentences, and TeacherAid prepares questions in Macedonian with the right answers and a short explanation. In class the teacher sends them from a laptop, students answer on their phones, and attendance is taken when they scan the QR code on the board. At the end of class the teacher has the list for e-Dnevnik, and every month the director gets a report. The data belongs to the school and stays in the European Union.",
      ],
    },
    {
      id: "facts",
      title: "Facts",
      list: [
        "Started: Startup Weekend Bitola, 11 to 13 September 2026.",
        "Based in: Bitola, North Macedonia.",
        "For: teachers and directors in secondary schools, professors and deans at universities.",
        "Language: Macedonian.",
        "First schools: the 2026/27 school year. The first lesson in every school is free.",
        "Website: teacheraid.education. Contact: hello@teacheraid.education.",
      ],
    },
    {
      id: "logos",
      title: "Logos and images",
      paras: ["The logos and app screenshots are free to publish in a piece about TeacherAid. Please do not change the logo's colours or shape."],
      links: [
        { label: "All logos (ZIP, 22 files)", href: "/brand/teacheraid-logo-kit.zip", note: "SVG and PNG, colour, black, white", download: true },
        { label: "Logo, SVG", href: "/brand/teacheraid-logo-ink.svg", download: true },
        { label: "App icon, PNG 1024 × 1024", href: "/brand/teacheraid-app-icon-square.png", download: true },
        { label: "The teacher app", href: "/site-v2/screens/t-today-en-1800.webp", note: "screenshot, 1800 pixels" },
        { label: "The student app", href: "/site-v2/screens/s-question-en-780.webp", note: "screenshot, a question from the lesson" },
      ],
    },
    {
      id: "link",
      title: "Linking to us",
      paras: [
        "If you write about us, please link to teacheraid.education. The name TeacherAid is easily confused with the English \"teacher aide\", so the link helps readers find us.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paras: [
        "For an interview, questions or to sit in on a lesson: hello@teacheraid.education.",
      ],
    },
  ],
};

export const pages: Record<PageKey, Record<Lang, ArticleDict>> = {
  faq: { mk: faqMk, en: faqEn },
  alternative: { mk: alternativeMk, en: alternativeEn },
  about: { mk: aboutMk, en: aboutEn },
  tools: { mk: toolsMk, en: toolsEn },
  ai: { mk: aiMk, en: aiEn },
  press: { mk: pressMk, en: pressEn },
};

export const pageOrder: PageKey[] = ["faq", "alternative", "tools", "ai", "about", "press"];
