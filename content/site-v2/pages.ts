import type { Lang } from "./types";

/*
  The website's pages beyond the home page, and the lines every page shares (the footer, the
  breadcrumb). Macedonian first, polite form. Every fact here is either on the home page already
  or checked and dated where it is stated (other tools' prices and features).
*/

export type PageKey = "faq" | "alternative" | "about";

/** Each page's path in each language. The pairs are each other's hreflang alternates. */
export const pagePaths: Record<PageKey, Record<Lang, string>> = {
  faq: { mk: "/prasanja", en: "/en/faq" },
  alternative: { mk: "/alternativa-na-kahoot", en: "/en/kahoot-alternative" },
  about: { mk: "/za-nas", en: "/en/about" },
};

export const homePaths: Record<Lang, string> = { mk: "/", en: "/en" };

/** When each page's content last changed. Change it only when the words change. */
export const pageUpdated: Record<PageKey | "home", string> = {
  home: "2026-10-31",
  faq: "2026-10-31",
  alternative: "2026-10-31",
  about: "2026-10-31",
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
  book: { title: string; body: string; cta: string; email: string; pilot: string };
  /** The nav's section links point at the home page from every other page. */
  sectionsLabel: string;
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
    book: {
      title: "Закажете бесплатен час.",
      body: "Доаѓаме во вашето училиште и со едно одделение водиме вистински час, од скенирањето до списокот на крајот. Вие и наставниците гледате.",
      cta: "Пишете ни",
      email: "hello@teacheraid.education",
      pilot: "Во учебната 2026/27 почнуваме со првите училишта.",
    },
    sectionsLabel: "Делови од почетната страница",
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
    book: {
      title: "Book a free lesson.",
      body: "We come to your school and run a real lesson with one class, from the scan to the list at the end. You and your teachers watch.",
      cta: "Write to us",
      email: "hello@teacheraid.education",
      pilot: "We start with the first schools in the 2026/27 school year.",
    },
    sectionsLabel: "Sections of the home page",
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

export const pages: Record<PageKey, Record<Lang, ArticleDict>> = {
  faq: { mk: faqMk, en: faqEn },
  alternative: { mk: alternativeMk, en: alternativeEn },
  about: { mk: aboutMk, en: aboutEn },
};

export const pageOrder: PageKey[] = ["faq", "alternative", "about"];
