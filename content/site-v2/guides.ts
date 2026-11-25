import type { ArticleDict } from "./pages";

/*
  Three comparisons with tools teachers already know (Mentimeter, Wayground, Google Forms) and
  two how-to guides (a quiz from a lesson, attendance with a QR code). Macedonian first.

  Other tools' facts: checked 2026-11-25 on mentimeter.com/plans/education, wayground.com/home/plans
  and Google's Forms help (support.google.com/docs/answer/7032287 and 7634943). Re-check them
  before changing pageUpdated for these pages, and never state a feature their pages do not show.
*/

export const mentimeterMk: ArticleDict = {
  key: "mentimeter",
  lang: "mk",
  meta: {
    title: "Алтернатива на Mentimeter за час на македонски: TeacherAid",
    description:
      "TeacherAid или Mentimeter? Mentimeter е за анкети и прашања за време на презентација. TeacherAid е за целиот час: прашања од вашата лекција на македонски, присуство со QR-код и список за е-Дневник.",
  },
  name: "TeacherAid или Mentimeter",
  kicker: "Алтернатива на Mentimeter",
  title: "TeacherAid или Mentimeter?",
  lead: "Mentimeter ја оживува презентацијата: анкети, облаци од зборови, квиз. TeacherAid е направен за целиот час во македонско училиште. Еве ја разликата, искрено.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Mentimeter е алатка за интерактивни презентации. Додавате слајдови со анкета, облак од зборови, квиз или прашања од публиката, а публиката одговара на своите уреди. Најдобар е кога зборувате пред многу луѓе и сакате веднаш да видите што мислат.",
        "TeacherAid почнува од вашата лекција, а не од слајдовите: од неа прави прашања на македонски, го запишува присуството со QR-код и на крајот на часот ви дава список подготвен за е-Дневник.",
      ],
    },
    {
      id: "sporedba",
      title: "Споредба",
      table: {
        caption: "TeacherAid и Mentimeter, точка по точка",
        cols: ["TeacherAid", "Mentimeter"],
        rows: [
          {
            label: "Направено за",
            cells: ["Целиот час: прашања, присуство, резултати", "Интерактивни презентации: анкети, облаци од зборови, квиз"],
          },
          {
            label: "Прашања",
            cells: ["Од вашата лекција (PDF, Word или неколку реченици), на македонски", "Ги пишувате вие; плановите нудат и Menti AI"],
          },
          {
            label: "Квиз со поени",
            cells: ["Да: 10 поени за точен одговор и до 5 за брзина", "Да: квиз-натпревар со победник на крајот"],
          },
          {
            label: "Присуство",
            cells: ["Да, со QR-код што се менува на секои 30 секунди", "Не е наведено во плановите"],
          },
          {
            label: "Список за е-Дневник",
            cells: ["Да, на крајот на секој час", "Не"],
          },
          {
            label: "Бесплатно",
            cells: ["Првиот час во вашето училиште", "Бесплатен план, до 50 учесници месечно"],
          },
          {
            label: "Цена",
            cells: [
              "За училиштата што продолжуваат, по договор",
              "План за образование: Basic 8,99 USD и Pro 14,99 USD по презентер месечно, со годишна наплата",
            ],
          },
        ],
        note: "Податоците за Mentimeter се од неговата страница со планови за образование, проверени на 25 ноември 2026. Цените се без данок.",
      },
    },
    {
      id: "koga-mentimeter",
      title: "Кога е подобар Mentimeter?",
      paras: [
        "Кога држите предавање или презентација и сакате мислењето на публиката: родителска средба, наставнички совет, голема група на факултет. Облакот од зборови и отворените прашања таму работат одлично, а бесплатниот план е доволен за повремена употреба.",
      ],
    },
    {
      id: "koga-teacheraid",
      title: "Кога е подобар TeacherAid?",
      paras: ["Кога ви треба алатка за секојдневниот час, а не за една презентација:"],
      list: [
        "Не правите слајдови: ја ставате лекцијата и прашањата се готови, со точните одговори и кратко објаснување.",
        "Ништо не стигнува до учениците додека вие не го прегледате.",
        "Присуството е готово со едно скенирање, без прозивка.",
        "На крајот на часот го имате списокот за е-Дневник и прашањата на кои класот најмногу грешеше.",
        "Директорот секој месец добива извештај, без имиња на ученици.",
      ],
    },
    {
      id: "dvete",
      title: "Може ли и двете?",
      paras: [
        "Да. Mentimeter за презентацијата пред родителите или на наставничкиот совет, TeacherAid за часот со класот. Едното не го спречува другото.",
      ],
    },
  ],
  sources: [
    { label: "Mentimeter: планови за образование (mentimeter.com, 25.11.2026)", href: "https://www.mentimeter.com/plans/education" },
  ],
};

export const mentimeterEn: ArticleDict = {
  key: "mentimeter",
  lang: "en",
  meta: {
    title: "A Mentimeter alternative for Macedonian classrooms: TeacherAid",
    description:
      "TeacherAid or Mentimeter? Mentimeter is for polls and questions during a presentation. TeacherAid runs the whole lesson: questions from your own material in Macedonian, QR attendance and a list for e-Dnevnik.",
  },
  name: "TeacherAid or Mentimeter",
  kicker: "Mentimeter alternative",
  title: "TeacherAid or Mentimeter?",
  lead: "Mentimeter brings a presentation to life: polls, word clouds, a quiz. TeacherAid is built for the whole lesson in a Macedonian school. Here is the difference, honestly.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "Mentimeter is a tool for interactive presentations. You add slides with a poll, a word cloud, a quiz or audience questions, and the audience answers on their devices. It is at its best when you speak to many people and want to see at once what they think.",
        "TeacherAid starts from your lesson, not from slides: it makes questions from it in Macedonian, takes attendance with a QR code and gives you a list ready for e-Dnevnik at the end of class.",
      ],
    },
    {
      id: "comparison",
      title: "Comparison",
      table: {
        caption: "TeacherAid and Mentimeter, point by point",
        cols: ["TeacherAid", "Mentimeter"],
        rows: [
          {
            label: "Built for",
            cells: ["The whole lesson: questions, attendance, results", "Interactive presentations: polls, word clouds, a quiz"],
          },
          {
            label: "Questions",
            cells: ["From your lesson (a PDF, Word file or a few sentences), in Macedonian", "You write them; the plans also offer Menti AI"],
          },
          {
            label: "Quiz with points",
            cells: ["Yes: 10 points for a right answer and up to 5 for speed", "Yes: a quiz competition with a winner at the end"],
          },
          {
            label: "Attendance",
            cells: ["Yes, with a QR code that changes every 30 seconds", "Not listed in its plans"],
          },
          {
            label: "List for e-Dnevnik",
            cells: ["Yes, at the end of every lesson", "No"],
          },
          {
            label: "Free",
            cells: ["The first lesson at your school", "A free plan, up to 50 participants a month"],
          },
          {
            label: "Price",
            cells: [
              "For schools that continue, agreed directly",
              "Education plan: Basic USD 8.99 and Pro USD 14.99 per presenter a month, billed yearly",
            ],
          },
        ],
        note: "Mentimeter facts are from its education plans page, checked on 25 November 2026. Prices exclude tax.",
      },
    },
    {
      id: "when-mentimeter",
      title: "When is Mentimeter the better choice?",
      paras: [
        "When you give a talk or a presentation and want the audience's view: a parents' evening, a staff meeting, a large university group. Word clouds and open questions work very well there, and the free plan is enough for occasional use.",
      ],
    },
    {
      id: "when-teacheraid",
      title: "When is TeacherAid the better choice?",
      paras: ["When you need a tool for the everyday lesson, not for one presentation:"],
      list: [
        "You make no slides: you add the lesson and the questions are ready, with the right answers and a short explanation.",
        "Nothing reaches your students until you have checked it.",
        "Attendance is one scan, with no roll call.",
        "At the end of class you have the list for e-Dnevnik and the questions the class got wrong most.",
        "The director gets a report every month, with no student names.",
      ],
    },
    {
      id: "both",
      title: "Can I use both?",
      paras: [
        "Yes. Mentimeter for the presentation to parents or at the staff meeting, TeacherAid for the lesson with the class. One does not stop the other.",
      ],
    },
  ],
  sources: [
    { label: "Mentimeter: education plans (mentimeter.com, 25 Nov 2026)", href: "https://www.mentimeter.com/plans/education" },
  ],
};

export const waygroundMk: ArticleDict = {
  key: "wayground",
  lang: "mk",
  meta: {
    title: "Алтернатива на Wayground (Quizizz) на македонски: TeacherAid",
    description:
      "TeacherAid или Wayground, порано Quizizz? Wayground е за квизови и лекции во живо или со свое темпо. TeacherAid е за часот во македонско училиште: прашања од вашата лекција, присуство со QR-код и список за е-Дневник.",
  },
  name: "TeacherAid или Wayground",
  kicker: "Алтернатива на Wayground (Quizizz)",
  title: "TeacherAid или Wayground?",
  lead: "Quizizz од јуни 2025 се вика Wayground. Тоа е голема библиотека квизови и лекции, во живо или за дома. TeacherAid е направен за часот во македонско училиште. Еве ја разликата, искрено.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Wayground нуди квизови, презентации, текстови, картички и видеа што учениците ги решаваат во живо во час или со свое темпо, на пример како домашна работа. Има библиотека готови материјали, а вештачката интелигенција може да создава и прилагодува прашања.",
        "TeacherAid е за часот во училницата: од вашата лекција прави прашања на македонски, го запишува присуството со QR-код и на крајот на часот ви дава список подготвен за е-Дневник.",
      ],
    },
    {
      id: "sporedba",
      title: "Споредба",
      table: {
        caption: "TeacherAid и Wayground, точка по точка",
        cols: ["TeacherAid", "Wayground"],
        rows: [
          {
            label: "Направено за",
            cells: ["Целиот час: прашања, присуство, резултати", "Квизови и лекции, во живо или со свое темпо"],
          },
          {
            label: "Прашања",
            cells: [
              "Од вашата лекција (PDF, Word или неколку реченици), на македонски",
              "Ги пишувате вие, ги земате од библиотеката или ги создава вештачка интелигенција",
            ],
          },
          {
            label: "За дома",
            cells: ["Вежби од она што класот го згреши, ако сакате да ги испратите", "Да, задачи што учениците ги решаваат со свое темпо"],
          },
          {
            label: "Присуство",
            cells: ["Да, со QR-код што се менува на секои 30 секунди", "Не е наведено во плановите"],
          },
          {
            label: "Список за е-Дневник",
            cells: ["Да, на крајот на секој час", "Не"],
          },
          {
            label: "Бесплатно",
            cells: ["Првиот час во вашето училиште", "План Basic, до 100 ученици, со ограничени видови прашања"],
          },
          {
            label: "Цена",
            cells: ["За училиштата што продолжуваат, по договор", "План за училишта и општини, по понуда"],
          },
        ],
        note: "Податоците за Wayground се од неговата страница со планови, проверени на 25 ноември 2026.",
      },
    },
    {
      id: "koga-wayground",
      title: "Кога е подобар Wayground?",
      paras: [
        "Кога ви треба домашна работа што учениците ја решаваат сами, или готов квиз од библиотеката за тема што не сакате да ја подготвувате од почеток. Има и помош за учениците што ја бараат, како читање на глас.",
      ],
    },
    {
      id: "koga-teacheraid",
      title: "Кога е подобар TeacherAid?",
      paras: ["Кога сакате една алатка за часот во училницата:"],
      list: [
        "Прашањата се од вашиот материјал, на македонски, а вие ги прегледувате пред да стигнат до учениците.",
        "Прашањето е на таблата и на секој телефон истовремено, со тајмер, а вие го откривате точниот одговор пред целиот клас.",
        "Присуството е готово со едно скенирање, без прозивка.",
        "На крајот на часот го имате списокот за е-Дневник и прашањата на кои класот најмногу грешеше.",
        "Директорот секој месец добива извештај, без имиња на ученици.",
      ],
    },
    {
      id: "dvete",
      title: "Може ли и двете?",
      paras: [
        "Да. Ако веќе користите Wayground за домашна работа, продолжете. TeacherAid нека го води часот во училницата, а Wayground она што учениците го решаваат дома.",
      ],
    },
  ],
  sources: [
    { label: "Wayground: планови (wayground.com, 25.11.2026)", href: "https://wayground.com/home/plans" },
    {
      label: "THE Journal: Quizizz станува Wayground (24.6.2025)",
      href: "https://thejournal.com/Articles/2025/06/24/Quizizz-Rebrands-as-Wayground-Announces-New-AI-Features.aspx",
    },
  ],
};

export const waygroundEn: ArticleDict = {
  key: "wayground",
  lang: "en",
  meta: {
    title: "A Wayground (Quizizz) alternative for Macedonian classrooms: TeacherAid",
    description:
      "TeacherAid or Wayground, formerly Quizizz? Wayground is for quizzes and lessons, live or self-paced. TeacherAid runs the lesson in a Macedonian school: questions from your material, QR attendance and a list for e-Dnevnik.",
  },
  name: "TeacherAid or Wayground",
  kicker: "Wayground (Quizizz) alternative",
  title: "TeacherAid or Wayground?",
  lead: "Since June 2025 Quizizz has been called Wayground. It is a large library of quizzes and lessons, live or for homework. TeacherAid is built for the lesson in a Macedonian school. Here is the difference, honestly.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "Wayground offers quizzes, presentations, passages, flashcards and videos that students do live in class or at their own pace, for example as homework. It has a library of ready-made material, and its AI can create and adapt questions.",
        "TeacherAid is for the lesson in the classroom: it makes questions from your lesson in Macedonian, takes attendance with a QR code and gives you a list ready for e-Dnevnik at the end of class.",
      ],
    },
    {
      id: "comparison",
      title: "Comparison",
      table: {
        caption: "TeacherAid and Wayground, point by point",
        cols: ["TeacherAid", "Wayground"],
        rows: [
          {
            label: "Built for",
            cells: ["The whole lesson: questions, attendance, results", "Quizzes and lessons, live or self-paced"],
          },
          {
            label: "Questions",
            cells: [
              "From your lesson (a PDF, Word file or a few sentences), in Macedonian",
              "You write them, take them from the library, or AI creates them",
            ],
          },
          {
            label: "Homework",
            cells: ["Practice on what the class got wrong, if you choose to send it", "Yes, activities students do at their own pace"],
          },
          {
            label: "Attendance",
            cells: ["Yes, with a QR code that changes every 30 seconds", "Not listed in its plans"],
          },
          {
            label: "List for e-Dnevnik",
            cells: ["Yes, at the end of every lesson", "No"],
          },
          {
            label: "Free",
            cells: ["The first lesson at your school", "The Basic plan, up to 100 students, with limited question types"],
          },
          {
            label: "Price",
            cells: ["For schools that continue, agreed directly", "A plan for schools and districts, by quote"],
          },
        ],
        note: "Wayground facts are from its plans page, checked on 25 November 2026.",
      },
    },
    {
      id: "when-wayground",
      title: "When is Wayground the better choice?",
      paras: [
        "When you want homework students do on their own, or a ready-made quiz from the library for a topic you do not want to prepare from scratch. It also has support for students who need it, such as read aloud.",
      ],
    },
    {
      id: "when-teacheraid",
      title: "When is TeacherAid the better choice?",
      paras: ["When you want one tool for the lesson in the classroom:"],
      list: [
        "The questions come from your own material, in Macedonian, and you check them before they reach your students.",
        "The question is on the board and on every phone at once, with a timer, and you reveal the right answer to the whole class.",
        "Attendance is one scan, with no roll call.",
        "At the end of class you have the list for e-Dnevnik and the questions the class got wrong most.",
        "The director gets a report every month, with no student names.",
      ],
    },
    {
      id: "both",
      title: "Can I use both?",
      paras: [
        "Yes. If you already use Wayground for homework, keep it. Let TeacherAid run the lesson in the classroom, and Wayground what students do at home.",
      ],
    },
  ],
  sources: [
    { label: "Wayground: plans (wayground.com, 25 Nov 2026)", href: "https://wayground.com/home/plans" },
    {
      label: "THE Journal: Quizizz rebrands as Wayground (24 Jun 2025)",
      href: "https://thejournal.com/Articles/2025/06/24/Quizizz-Rebrands-as-Wayground-Announces-New-AI-Features.aspx",
    },
  ],
};

export const formsMk: ArticleDict = {
  key: "forms",
  lang: "mk",
  meta: {
    title: "Google Forms или TeacherAid: квиз во час и присуство",
    description:
      "Google Forms е бесплатен и одличен за тест и домашна работа. TeacherAid е за прашања во живо во час: прашањето е на таблата и на секој телефон, присуството е со QR-код, а списокот за е-Дневник е готов на крајот.",
  },
  name: "TeacherAid или Google Forms",
  kicker: "Google Forms или TeacherAid",
  title: "Google Forms или TeacherAid?",
  lead: "Многу наставници веќе прават тестови во Google Forms, и тоа е добар избор. Еве за што е подобар, а за што е направен TeacherAid.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Google Forms е бесплатен формулар што го отворате со Google сметка. Кога ќе го претворите во квиз, му давате точни одговори и поени, а Forms сам ги бодува прашањата со точен одговор. Учениците го решаваат секој за себе, а вие резултатите ги гледате откако ќе предадат.",
        "TeacherAid е за часот во живо: прашањето е на таблата и на секој телефон истовремено, со тајмер, одговорите пристигнуваат пред вас, а присуството се запишува со QR-код.",
      ],
    },
    {
      id: "sporedba",
      title: "Споредба",
      table: {
        caption: "TeacherAid и Google Forms, точка по точка",
        cols: ["TeacherAid", "Google Forms"],
        rows: [
          {
            label: "Направено за",
            cells: ["Прашања во живо за време на часот", "Формулари, анкети и тестови што секој ги решава сам"],
          },
          {
            label: "Прашања",
            cells: [
              "Од вашата лекција (PDF, Word или неколку реченици), со точниот одговор и објаснување",
              "Ги пишувате вие; точен одговор може да има кај шест вида прашања, на пример избор или краток одговор",
            ],
          },
          {
            label: "Во живо",
            cells: ["Да: прашањето е на таблата и на секој телефон, со тајмер", "Не: резултатите се гледаат по предавањето"],
          },
          {
            label: "Резултати",
            cells: [
              "Прашањата на кои класот најмногу грешеше, и страница за секој клас",
              "Резиме: прашања што најчесто се грешат, просек, медијана и распон на поените",
            ],
          },
          {
            label: "Присуство",
            cells: ["Да, со QR-код што се менува на секои 30 секунди", "Не е алатка за присуство; врската до формулар работи од секаде"],
          },
          {
            label: "Цена",
            cells: ["Првиот час е бесплатен; за училиштата што продолжуваат, по договор", "Бесплатно со Google сметка"],
          },
        ],
        note: "Податоците за Google Forms се од помошните страници на Google, проверени на 25 ноември 2026.",
      },
    },
    {
      id: "koga-forms",
      title: "Кога е подобар Google Forms?",
      paras: [
        "За писмен тест, домашна работа или анкета за родителите: кога секој треба да одговара сам, со свое темпо, и кога ви требаат подолги одговори. Оценките можете да ги објавите веднаш или откако ќе ги прегледате. На Chromebook што го управува училиштето, заклучениот режим не дозволува ученикот да отвора други страници за време на тестот.",
      ],
    },
    {
      id: "koga-teacheraid",
      title: "Кога е подобар TeacherAid?",
      paras: ["Кога сакате прашањата да бидат дел од часот, а не тест по него:"],
      list: [
        "Не пишувате прашања: ја ставате лекцијата и тие се готови, а вие ги прегледувате.",
        "Целиот клас одговара истовремено, а вие веднаш гледате кој разбрал.",
        "Го откривате точниот одговор пред целиот клас и разговарате за најчестата грешка додека сите се таму.",
        "Присуството е готово со едно скенирање и не може да се пополни од дома.",
        "На крајот на часот го имате списокот за е-Дневник.",
      ],
    },
    {
      id: "dvete",
      title: "Може ли и двете?",
      paras: [
        "Да, и така е најдобро. TeacherAid за часот, Google Forms за тестот на крајот на темата или за домашна работа.",
      ],
    },
  ],
  sources: [
    { label: "Google: Креирање и оценување квизови со Google Forms (support.google.com, 25.11.2026)", href: "https://support.google.com/docs/answer/7032287" },
    { label: "Google: Заклучен режим за квизови (support.google.com, 25.11.2026)", href: "https://support.google.com/docs/answer/7634943" },
  ],
};

export const formsEn: ArticleDict = {
  key: "forms",
  lang: "en",
  meta: {
    title: "Google Forms or TeacherAid: quizzes in class and attendance",
    description:
      "Google Forms is free and great for tests and homework. TeacherAid is for live questions in class: the question is on the board and on every phone, attendance is a QR scan, and the list for e-Dnevnik is ready at the end.",
  },
  name: "TeacherAid or Google Forms",
  kicker: "Google Forms or TeacherAid",
  title: "Google Forms or TeacherAid?",
  lead: "Many teachers already make tests in Google Forms, and it is a good choice. Here is what it is better at, and what TeacherAid is built for.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "Google Forms is a free form you open with a Google account. When you turn it into a quiz, you give it the right answers and points, and Forms scores the questions that have an answer key. Students do it on their own, and you see the results after they submit.",
        "TeacherAid is for the live lesson: the question is on the board and on every phone at once, with a timer, the answers arrive in front of you, and attendance is taken with a QR code.",
      ],
    },
    {
      id: "comparison",
      title: "Comparison",
      table: {
        caption: "TeacherAid and Google Forms, point by point",
        cols: ["TeacherAid", "Google Forms"],
        rows: [
          {
            label: "Built for",
            cells: ["Live questions during the lesson", "Forms, surveys and tests each student does alone"],
          },
          {
            label: "Questions",
            cells: [
              "From your lesson (a PDF, Word file or a few sentences), with the right answer and an explanation",
              "You write them; six question types can have an answer key, such as multiple choice or short answer",
            ],
          },
          {
            label: "Live",
            cells: ["Yes: the question is on the board and on every phone, with a timer", "No: you see the results after students submit"],
          },
          {
            label: "Results",
            cells: [
              "The questions the class got wrong most, and a page for each class",
              "A summary: frequently missed questions, the average, median and range of scores",
            ],
          },
          {
            label: "Attendance",
            cells: ["Yes, with a QR code that changes every 30 seconds", "Not an attendance tool; a link to a form works from anywhere"],
          },
          {
            label: "Price",
            cells: ["The first lesson is free; for schools that continue, agreed directly", "Free with a Google account"],
          },
        ],
        note: "Google Forms facts are from Google's help pages, checked on 25 November 2026.",
      },
    },
    {
      id: "when-forms",
      title: "When is Google Forms the better choice?",
      paras: [
        "For a written test, homework or a survey for parents: when each student should answer alone, at their own pace, and when you need longer answers. You can release grades at once or after you review them. On Chromebooks the school manages, locked mode stops a student from opening other pages during the test.",
      ],
    },
    {
      id: "when-teacheraid",
      title: "When is TeacherAid the better choice?",
      paras: ["When you want questions to be part of the lesson, not a test after it:"],
      list: [
        "You write no questions: you add the lesson and they are ready, and you check them.",
        "The whole class answers at once, and you see at once who understood.",
        "You reveal the right answer to the whole class and talk about the most common mistake while everyone is there.",
        "Attendance is one scan and cannot be filled in from home.",
        "At the end of class you have the list for e-Dnevnik.",
      ],
    },
    {
      id: "both",
      title: "Can I use both?",
      paras: [
        "Yes, and that works best. TeacherAid for the lesson, Google Forms for the test at the end of a topic or for homework.",
      ],
    },
  ],
  sources: [
    { label: "Google: Create and grade quizzes with Google Forms (support.google.com, 25 Nov 2026)", href: "https://support.google.com/docs/answer/7032287" },
    { label: "Google: Use locked mode for quizzes (support.google.com, 25 Nov 2026)", href: "https://support.google.com/docs/answer/7634943" },
  ],
};

export const quizMk: ArticleDict = {
  key: "quiz",
  lang: "mk",
  meta: {
    title: "Како да направите квиз од лекцијата: водич за наставници",
    description:
      "Како да направите добар квиз од денешната лекција: колку прашања, какви, како да ги напишете погрешните одговори и кога да прашувате. Со или без вештачка интелигенција, и со TeacherAid за пет минути.",
  },
  name: "Квиз од лекцијата",
  kicker: "Водич за наставници",
  title: "Како да направите квиз од лекцијата.",
  lead: "Добар квиз не е тест на крајот на часот. Тоа е неколку прашања што ви кажуваат, додека уште има време, кој разбрал, а кој не.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "Пет до осум прашања од денешната лекција. Секое проверува една работа. Погрешните одговори се грешките што учениците навистина ги прават. По секое прашање го откривате точниот одговор и кратко објаснувате зошто.",
      ],
    },
    {
      id: "zoshto",
      title: "Зошто прашања во текот на часот?",
      paras: [
        "Затоа што прашањето не само што мери, туку и учи. Обидот да се одговори, дури и погрешно, помага подобро да се запамети точниот одговор кога ќе дојде. Грешката што веднаш се поправа учи повеќе од грешката што никој не ја видел.",
        "Затоа прашувајте во текот на часот, а не само на крајот: на почетокот, за да видите што знаат, и по секој дел од лекцијата.",
      ],
    },
    {
      id: "chekori",
      title: "Чекор по чекор",
      list: [
        "Изберете три до четири работи што учениците мора да ги знаат по часот.",
        "За секоја напишете едно или две прашања. Едно прашање, една работа.",
        "Погрешните одговори нека бидат вистински грешки: она што учениците го мешаат, погрешната пресметка, честата заблуда.",
        "Мешајте видови: избор од понудени одговори, точно или неточно, одговор со бројка.",
        "До секој точен одговор напишете една реченица зошто е точен.",
        "Тајмерот нека биде пократок за препознавање, подолг за пресметка.",
        "Во час: прашајте, почекајте сите да одговорат, па откријте го точниот одговор и разговарајте за најчестиот погрешен.",
      ],
    },
    {
      id: "greshki",
      title: "Чести грешки",
      list: [
        "Прашања-стапици. Квизот проверува дали разбрале, не дали внимавале на еден збор.",
        "Одговори како „сите од наведените“ или „ниту едно“. Учениците погодуваат по обликот, не по знаењето.",
        "Долг текст. Прашањето се чита на телефон, па нека биде кратко.",
        "Сите прашања на крајот на часот. Тогаш нема време да се поправи она што не е јасно.",
      ],
    },
    {
      id: "vestachka-inteligencija",
      title: "А со вештачка интелигенција?",
      paras: [
        "Алатките како ChatGPT можат да предложат прашања од вашиот текст за неколку секунди. Проверете го секое прашање и секој одговор: вештачката интелигенција понекогаш греши со сигурен тон. Никогаш не внесувајте имиња или оценки на ученици.",
      ],
    },
    {
      id: "so-teacheraid",
      title: "Како се прави со TeacherAid?",
      list: [
        "Додадете ја лекцијата: PDF, Word или неколку реченици за темата.",
        "TeacherAid подготвува пет до осум прашања, со точните одговори и кратко објаснување, на македонски.",
        "Со едно копче ги менувате: полесно, потешко, повеќе прашања или пократки тајмери.",
        "Ги прегледувате. Ништо не стигнува до учениците пред тоа.",
        "Во час, со еден клик прашањето е на таблата и на секој телефон, а вие го откривате точниот одговор пред целиот клас.",
        "По часот ги гледате прашањата на кои класот најмногу грешеше и, ако сакате, му праќате вежби од нив.",
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

export const quizEn: ArticleDict = {
  key: "quiz",
  lang: "en",
  meta: {
    title: "How to make a quiz from your lesson: a guide for teachers",
    description:
      "How to make a good quiz from today's lesson: how many questions, which kinds, how to write the wrong answers and when to ask. With or without AI, and with TeacherAid in five minutes.",
  },
  name: "A quiz from your lesson",
  kicker: "A guide for teachers",
  title: "How to make a quiz from your lesson.",
  lead: "A good quiz is not a test at the end of class. It is a few questions that tell you, while there is still time, who understood and who did not.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "Five to eight questions from today's lesson. Each checks one thing. The wrong answers are the mistakes students really make. After each question you reveal the right answer and say briefly why.",
      ],
    },
    {
      id: "why",
      title: "Why ask questions during the lesson?",
      paras: [
        "Because a question does not only measure, it teaches. Trying to answer, even wrongly, helps students remember the right answer better when it comes. A mistake corrected at once teaches more than one nobody saw.",
        "So ask during the lesson, not only at the end: at the start, to see what they know, and after each part of the lesson.",
      ],
    },
    {
      id: "steps",
      title: "Step by step",
      list: [
        "Choose the three or four things students must know after the lesson.",
        "Write one or two questions for each. One question, one thing.",
        "Make the wrong answers real mistakes: what students mix up, the wrong calculation, the common misconception.",
        "Mix the kinds: multiple choice, true or false, a number answer.",
        "Next to each right answer, write one sentence on why it is right.",
        "Keep the timer shorter for recognising, longer for calculating.",
        "In class: ask, wait for everyone to answer, then reveal the right answer and talk about the most common wrong one.",
      ],
    },
    {
      id: "mistakes",
      title: "Common mistakes",
      list: [
        "Trick questions. A quiz checks whether they understood, not whether they caught one word.",
        "Answers like \"all of the above\" or \"none of these\". Students guess from the shape, not from what they know.",
        "Long text. The question is read on a phone, so keep it short.",
        "All the questions at the end of class. Then there is no time to fix what is unclear.",
      ],
    },
    {
      id: "ai",
      title: "And with AI?",
      paras: [
        "Tools like ChatGPT can suggest questions from your text in seconds. Check every question and every answer: AI is sometimes wrong in a confident tone. Never enter students' names or grades.",
      ],
    },
    {
      id: "with-teacheraid",
      title: "How is it done with TeacherAid?",
      list: [
        "Add the lesson: a PDF, a Word file or a few sentences about the topic.",
        "TeacherAid prepares five to eight questions, with the right answers and a short explanation, in Macedonian.",
        "One button changes them: easier, harder, more questions or shorter timers.",
        "You check them. Nothing reaches your students before that.",
        "In class, one click puts the question on the board and on every phone, and you reveal the right answer to the whole class.",
        "After class you see the questions the class got wrong most and, if you like, send the class practice on them.",
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

export const attendanceMk: ArticleDict = {
  key: "attendance",
  lang: "mk",
  meta: {
    title: "Присуство со QR-код во час: како работи и на што да внимавате",
    description:
      "Како се зема присуство со QR-код: ученикот скенира код на таблата и е запишан, без прозивка. Зошто кодот треба да се менува, што ако ученик нема телефон и како списокот стигнува до е-Дневник.",
  },
  name: "Присуство со QR-код",
  kicker: "Водич за наставници",
  title: "Присуство со QR-код.",
  lead: "Прозивката одзема минути од секој час. Со QR-код присуството е готово додека учениците седнуваат. Еве како работи и на што да внимавате.",
  sections: [
    {
      id: "nakratko",
      title: "Накратко",
      paras: [
        "На почетокот на часот таблата покажува QR-код. Секој ученик го скенира со телефонот и е запишан како присутен. Кодот се менува на секои 30 секунди, па работи само во училницата.",
      ],
    },
    {
      id: "kako",
      title: "Како работи со TeacherAid?",
      list: [
        "Го почнувате часот, а таблата го покажува QR-кодот.",
        "Ученикот го скенира со камерата на телефонот. Најавен е со училишната Google или Microsoft сметка, па не пишува ништо.",
        "Запишан е како присутен, без прозивка.",
        "Кодот се менува на секои 30 секунди.",
        "Кога ќе притиснете Крај, го добивате целиот список: присутни, задоцнети и отсутни, подготвен за препишување во е-Дневник.",
      ],
    },
    {
      id: "zoshto-se-menuva",
      title: "Зошто кодот мора да се менува?",
      paras: [
        "Кодот што не се менува може да се фотографира и да се испрати на другар што не е на час. Истото важи за врска до формулар: работи од секаде. Кодот што се менува на секои 30 секунди е застарен пред сликата да стигне дома.",
      ],
    },
    {
      id: "prashanja",
      title: "Прашања",
      items: [
        {
          q: "Што ако ученик нема телефон?",
          a: ["Наставникот го менува присуството од својата страна. Прашањата се на таблата, па ученикот го следи часот и без телефон."],
        },
        {
          q: "Дали треба интернет?",
          a: ["Да. Лаптопот на наставникот и телефоните на учениците треба да се поврзани, преку училишната мрежа или преку мобилен интернет."],
        },
        {
          q: "Дали TeacherAid запишува во е-Дневник?",
          a: ["Не. Ви го дава списокот, подготвен за препишување во е-Дневник. Вие одлучувате што ќе запишете."],
        },
        {
          q: "Дали се чува локацијата на ученикот?",
          a: ["Не. TeacherAid никогаш не чува локација. Чува само кој бил на час, што одговорил и кои теми му се тешки."],
        },
      ],
    },
    {
      id: "bez-teacheraid",
      title: "А без апликација?",
      paras: [
        "Прозивката е сигурна, но бавна. Листот за потпис оди од клупа до клупа и се потпишува и за другарот. Формулар на Google работи и од дома. Ако земате присуство со QR-код, без разлика со која алатка, проверете дали кодот се менува и каде одат податоците на учениците: училиштето одговара за нив според Законот за заштита на личните податоци.",
      ],
    },
  ],
};

export const attendanceEn: ArticleDict = {
  key: "attendance",
  lang: "en",
  meta: {
    title: "QR code attendance in class: how it works and what to watch for",
    description:
      "How attendance with a QR code works: a student scans a code on the board and is marked present, with no roll call. Why the code must change, what if a student has no phone, and how the list gets to e-Dnevnik.",
  },
  name: "QR code attendance",
  kicker: "A guide for teachers",
  title: "Attendance with a QR code.",
  lead: "Roll call takes minutes from every lesson. With a QR code, attendance is done while students sit down. Here is how it works and what to watch for.",
  sections: [
    {
      id: "in-short",
      title: "In short",
      paras: [
        "At the start of class the board shows a QR code. Each student scans it with their phone and is marked present. The code changes every 30 seconds, so it only works in the classroom.",
      ],
    },
    {
      id: "how",
      title: "How does it work with TeacherAid?",
      list: [
        "You start the lesson, and the board shows the QR code.",
        "The student scans it with the phone's camera. They are signed in with the school Google or Microsoft account, so they type nothing.",
        "They are marked present, with no roll call.",
        "The code changes every 30 seconds.",
        "When you press End, you get the whole list: present, late and absent, ready to copy into e-Dnevnik.",
      ],
    },
    {
      id: "why-it-changes",
      title: "Why must the code change?",
      paras: [
        "A code that never changes can be photographed and sent to a friend who is not in class. The same goes for a link to a form: it works from anywhere. A code that changes every 30 seconds is out of date before the picture gets home.",
      ],
    },
    {
      id: "questions",
      title: "Questions",
      items: [
        {
          q: "What if a student has no phone?",
          a: ["The teacher changes the attendance from their side. The questions are on the board, so the student can follow the lesson without a phone."],
        },
        {
          q: "Does it need the internet?",
          a: ["Yes. The teacher's laptop and the students' phones need to be connected, through the school network or mobile data."],
        },
        {
          q: "Does TeacherAid write to e-Dnevnik?",
          a: ["No. It gives you the list, ready to copy into e-Dnevnik. You decide what to enter."],
        },
        {
          q: "Is the student's location stored?",
          a: ["No. TeacherAid never stores location. It keeps only who was in class, what they answered and which topics they find hard."],
        },
      ],
    },
    {
      id: "without-teacheraid",
      title: "And without an app?",
      paras: [
        "Roll call is reliable but slow. A sign-in sheet goes from desk to desk and gets signed for a friend too. A Google form works from home as well. If you take attendance with a QR code, whatever the tool, check that the code changes and where students' data goes: the school is responsible for it under the Law on Personal Data Protection.",
      ],
    },
  ],
};
