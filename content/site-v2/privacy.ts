import type { Lang } from "./types";
import { CONTACT, operatorCity, team, type LegalMeta, type TermsDict } from "./terms";

/*
  The privacy policy for teachers, school staff and visitors to the website, in Macedonian (binding) and English. The
  students' own notice is the student app's (/app/privacy, lib/app/privacy-copy.ts); this policy points to it and does
  not repeat it. The website renders this file at /privatnost and /en/privacy, and the lawyer's document is made from it.

  Every statement is what the code or the decided specification does (checked 2026-11-21):
  - the website sets no cookies, loads nothing from another site (its Content-Security-Policy allows none), and has no
    analytics or ads;
  - the early-access form (app/api/early-access, lib/early-access.ts) keeps the email, the time and a short source tag in
    Upstash Redis, and a hash of the IP address for one minute to limit repeated requests;
  - the demo keeps everything in the browser (lib/teacher/api/mock*.ts, localStorage);
  - sign-in is Google or Microsoft only; the account holds a name, an email, the school and the provider;
  - teaching data is stored in the EU and kept as BR-RET-01 to 03; nothing about students goes to the AI (BR-SEC-01, 04).
  Three periods were not in the specification and were set here, for the owner and the lawyer to confirm: the early-access
  list (one year), emails to us (one year after the last message) and a teacher who leaves (30 days, as a student who
  leaves). The server's log period is open (OPEN-29) and is stated as "short, for security", without a number.
*/

export const privacyPaths: Record<Lang, string> = { mk: "/privatnost", en: "/en/privacy" };
export const privacyVersion = "1.0";
/** When the words last changed. Change it, and the version, only when the words change. */
export const privacyUpdated = "2026-11-21";

const mk: TermsDict = {
  lang: "mk",
  meta: {
    title: "Политика за приватност | TeacherAid",
    description: "Како TeacherAid ги обработува личните податоци на наставниците, на училиштата и на посетителите на веб-страницата.",
  },
  name: "Политика за приватност",
  kicker: "Правни информации",
  title: "Политика за приватност",
  lead: "Кои лични податоци ги обработуваме за наставниците, за училиштата и за посетителите на веб-страницата, зошто, колку долго и какви права имате. За учениците важи посебното Известување за приватност во апликацијата.",
  versionLabel: "Верзија",
  updatedLabel: "Важи од",
  contentsLabel: "Содржина",
  summaryTitle: "Кратко",
  summary: [
    "За податоците од наставата одлучува училиштето. Ние ги обработуваме само по негово упатство.",
    "Веб-страницата нема колачиња, нема аналитика и нема реклами.",
    "Се најавувате со Google или Microsoft. Не чуваме лозинки.",
    "Вештачката интелигенција добива само материјалот за часот, никогаш имиња, е-пошта или списоци на ученици.",
    "Податоците од апликациите се чуваат во Европската унија и се шифрирани.",
    `Не ги продаваме податоците. За вашите права пишете ни на ${CONTACT} или прашајте го училиштето.`,
  ],
  sections: [
    {
      id: "who",
      title: "1. Кои сме и што опфаќа оваа политика",
      blocks: [
        {
          p: `1.1. TeacherAid го води тим од физички лица од ${operatorCity.mk}, Република Северна Македонија: ${team.join(", ")} (во натамошниот текст: „TeacherAid“, „ние“). Е-пошта: ${CONTACT}.`,
        },
        {
          p: "1.2. Оваа политика опфаќа: наставниците и другиот персонал на училиштето што ја користат Наставничката апликација (/teacher), посетителите на веб-страницата teacheraid.education, оние што се пријавуваат за ран пристап, оние што ни пишуваат, и корисниците на Демото.",
        },
        {
          p: "1.3. За учениците важи посебно Известување за приватност, напишано за нив, во Ученичката апликација (teacheraid.education/app/privacy).",
        },
        { p: "1.4. Се применува Законот за заштита на личните податоци на Република Северна Македонија." },
      ],
    },
    {
      id: "roles",
      title: "2. Кој одлучува за податоците",
      blocks: [
        {
          p: "2.1. Училиштето е контролор на податоците што се создаваат во наставата: сметките на наставниците и учениците, часовите, одговорите, резултатите и присуството. TeacherAid е обработувач: ги обработува само по упатство на училиштето, според писмен Договор за обработка.",
        },
        {
          p: "2.2. TeacherAid е контролор за: посетите на веб-страницата, пријавите за ран пристап, пораките што ни ги праќате, и белешките потребни за безбедноста на Услугата.",
        },
        { p: "2.3. Google и Microsoft се посебни контролори за вашата сметка кај нив. За тоа важат нивните политики за приватност." },
      ],
    },
    {
      id: "teachers",
      title: "3. Податоци за наставниците",
      blocks: [
        { p: "3.1. Кога се најавувате, од Google или Microsoft добиваме:" },
        { ul: ["вашето име и презиме;", "вашата е-пошта;", "кој давател го користите (Google или Microsoft) и ознаката на сметката кај него."] },
        { p: "3.2. Од училиштето или од системот знаеме во кое училиште работите и каква е вашата улога (наставник)." },
        { p: "3.3. Додека ја користите апликацијата, се чува:" },
        {
          ul: [
            "она што го подготвувате: текст, тема, прикачени датотеки (PDF, Word), нацрти и зачувани часови со прашања;",
            "часовите што ги водите: кога почнале и завршиле, и одговорите, резултатите и присуството на учениците;",
            "прашањата што учениците ви ги пишале;",
            "дали сте го завршиле водичот при првото користење.",
          ],
        },
        {
          p: "3.4. Во материјалот за часот не внесувајте лични податоци за ученици или за други лица. Ако материјалот сепак содржи такви податоци, тие се обработуваат само за да се подготви часот.",
        },
      ],
    },
    {
      id: "ai",
      title: "4. Вештачка интелигенција",
      blocks: [
        {
          p: "4.1. Кога подготвувате час, текстот, темата или датотеката што ја давате, заедно со нашите упатства, се праќаат до давателот на вештачка интелигенција (Claude, од Anthropic) за да се направи нацрт.",
        },
        { p: "4.2. Не праќаме имиња, е-пошта ни списоци на ученици. Не праќаме ни ваши податоци за контакт." },
        {
          p: "4.3. Избираме даватели чии договорни услови не дозволуваат податоците од нашите барања да се користат за тренирање на нивните модели. Давателот и местото на обработка се наведени во Договорот за обработка со училиштето.",
        },
        { p: "4.4. Вештачката интелигенција не донесува одлуки за вас или за учениците. Нацртот го прегледувате и го одобрувате вие." },
      ],
    },
    {
      id: "students",
      title: "5. Податоци за учениците",
      blocks: [
        {
          p: "5.1. Што се обработува за учениците (присуство, одговори, резултати, вежбање, прашања до наставникот, излегување од квизот, известувања), зошто и колку долго, е опишано во Известувањето за приватност за учениците (teacheraid.education/app/privacy). Таму е и тоа што гледа наставникот, а што не.",
        },
        { p: "5.2. Како наставник гледате податоци само за учениците на вашите часови. Користете ги само за наставата." },
      ],
    },
    {
      id: "website",
      title: "6. Веб-страницата",
      blocks: [
        {
          p: "6.1. Веб-страницата не поставува колачиња, не вчитува ништо од други сајтови, нема аналитика, нема реклами и нема копчиња на социјални мрежи.",
        },
        {
          p: "6.2. Како и секој сервер, хостингот на веб-страницата при секое барање добива технички податоци: IP-адреса, прелистувач, страница и време. Тие служат за испорака на страницата и за безбедност, и се чуваат кратко.",
        },
        { p: "6.3. Ако се пријавите за ран пристап, ги чуваме:" },
        {
          ul: [
            "вашата е-пошта;",
            "времето на пријавата;",
            "кратка ознака од каде дошла пријавата, ако ја има во врската (на пример од настан).",
          ],
        },
        {
          p: "6.4. За да спречиме злоупотреба на формуларот, за една минута чуваме отпечаток (hash) од IP-адресата, не самата адреса. Потоа се брише.",
        },
        { p: "6.5. Ако ни пишете на е-пошта, ја чуваме пораката и вашата адреса за да ви одговориме." },
      ],
    },
    {
      id: "demo",
      title: "7. Демото и меморијата на прелистувачот",
      blocks: [
        {
          p: "7.1. Демото (teacheraid.education/teacher и /app) работи со измислени податоци што се чуваат само во вашиот прелистувач. Тие не ни се праќаат. Ги бришете со бришење на податоците на сајтот во прелистувачот.",
        },
        {
          p: "7.2. Вистинската апликација во прелистувачот ги чува само поставките што ѝ требаат (на пример јазикот) и, кога сте најавени, едно колаче за сесијата, неопходно за да останете најавени. Нема колачиња за следење.",
        },
      ],
    },
    {
      id: "basis",
      title: "8. Зошто и врз која основа",
      blocks: [
        {
          ul: [
            "Податоците од наставата: за да ја дадеме Услугата на училиштето, по негово упатство и според Договорот за обработка. Основата ја одредува училиштето.",
            "Пријавата за ран пристап: вашата согласност, која можете да ја повлечете во секое време со порака до нас.",
            "Пораките до нас: за да одговориме на вашето барање.",
            "Техничките податоци и белешките за безбедност: нашиот легитимен интерес Услугата да работи безбедно и да спречиме злоупотреба.",
            "Кога закон бара да чуваме или да дадеме податоци: исполнување на законска обврска.",
          ],
        },
        { p: "8.1. Не ги продаваме податоците, не ги користиме за реклами и не правиме профили за маркетинг." },
      ],
    },
    {
      id: "recipients",
      title: "9. Кој ги гледа податоците",
      blocks: [
        { p: "9.1. Членовите на тимот на TeacherAid, само колку што им е потребно за да ја дадат и заштитат Услугата." },
        { p: "9.2. Вашето училиште, според својот договор со нас." },
        { p: "9.3. Надворешни даватели што работат за нас и само по наше упатство:" },
        {
          ul: [
            "Vercel: хостинг на веб-страницата и на апликациите;",
            "Upstash: базата во која се чуваат пријавите за ран пристап;",
            "давателот на вештачка интелигенција (точка 4);",
            "давателот на серверот и базата на апликациите, во Европската унија, наведен во Договорот за обработка.",
          ],
        },
        { p: "9.4. Надлежни органи, само кога закон тоа го бара." },
      ],
    },
    {
      id: "where",
      title: "10. Каде се чуваат",
      blocks: [
        { p: "10.1. Податоците од апликациите (сметки, часови, резултати) се чуваат во Европската унија." },
        {
          p: "10.2. Некои даватели (на пример Vercel и Upstash) се компании од Соединетите Американски Држави. Кога податоците излегуваат надвор од Северна Македонија, тоа го правиме само со заштитите што ги бара законот.",
        },
      ],
    },
    {
      id: "retention",
      title: "11. Колку долго",
      blocks: [
        {
          ul: [
            "Податоците од часовите: до крајот на учебната година по онаа во која настанале; потоа ги бришеме или ги претвораме во збирни податоци без имиња.",
            "Сметката на наставникот: додека училиштето ја користи Услугата. Кога наставникот ќе замине, ја бришеме во рок од 30 дена од барањето на училиштето.",
            "Кога училиштето ќе престане да ја користи Услугата: како во Условите за користење (точка 19.5), најдоцна 60 дена по крајот.",
            "Пријавата за ран пристап: додека не побарате да ја избришеме, а најдолго една година од пријавата.",
            "Пораките до нас: една година по последната порака, освен ако се потребни за спор.",
            "Техничките податоци на серверот: кратко, само колку што е потребно за безбедност.",
            "Резервните копии истекуваат по утврден распоред.",
          ],
        },
      ],
    },
    {
      id: "security",
      title: "12. Безбедност",
      blocks: [
        {
          p: "12.1. Ги штитиме податоците со шифрирање при пренос и при чување, со пристап само за лицата што мора да работат со нив, со најавување без лозинки кај нас, и со резервни копии со утврден рок.",
        },
        {
          p: "12.2. Ако дојде до повреда на безбедноста на податоците, го известуваме училиштето најдоцна 48 часа откако ќе дознаеме. За податоците за кои ние сме контролор, ја известуваме Агенцијата за заштита на личните податоци во рокот што го пропишува законот и, кога законот тоа го бара, и вас.",
        },
      ],
    },
    {
      id: "rights",
      title: "13. Вашите права",
      blocks: [
        { p: "13.1. Имате право:" },
        {
          ul: [
            "да знаете дали ги обработуваме вашите податоци и да добиете копија;",
            "да побарате исправка на неточни податоци;",
            "да побарате бришење;",
            "да побарате ограничување на обработката;",
            "да ги добиете вашите податоци во формат што може да се чита на компјутер;",
            "да се спротивставите на обработка врз основа на легитимен интерес;",
            "да ја повлечете согласноста во секое време, без да влијае на она што е направено пред тоа.",
          ],
        },
        {
          p: `13.2. За податоците од наставата, барањето го поднесувате до училиштето, а ние му помагаме. За другите податоци пишете ни на ${CONTACT}. Одговараме во рокот што го пропишува законот.`,
        },
        {
          p: "13.3. Имате право да поднесете барање до Агенцијата за заштита на личните податоци (azlp.mk) ако мислите дека вашите податоци се обработуваат спротивно на законот.",
        },
      ],
    },
    {
      id: "children",
      title: "14. Деца",
      blocks: [
        {
          p: "14.1. Веб-страницата и Наставничката апликација не се наменети за деца. Децата ја користат само Ученичката апликација, во наставата што ја организира училиштето, и за нив важи Известувањето за приватност за учениците.",
        },
      ],
    },
    {
      id: "decisions",
      title: "15. Автоматско одлучување",
      blocks: [{ p: "15.1. Не донесуваме одлуки за вас или за учениците само со автоматска обработка, ниту правиме профили што имаат правно или слично значајно дејство." }],
    },
    {
      id: "changes",
      title: "16. Измени",
      blocks: [
        {
          p: "16.1. Ако ја измениме оваа политика, ја објавуваме новата верзија на оваа страница со број и датум. За значајна измена ги известуваме училиштата по е-пошта пред таа да почне да важи.",
        },
      ],
    },
    {
      id: "contact",
      title: "17. Контакт",
      blocks: [{ p: `TeacherAid: ${team.join(", ")}. ${operatorCity.mk}, Република Северна Македонија. Е-пошта: ${CONTACT}.` }],
    },
  ],
};

const en: TermsDict = {
  lang: "en",
  meta: {
    title: "Privacy Policy | TeacherAid",
    description: "How TeacherAid processes the personal data of teachers, schools and visitors to the website.",
  },
  name: "Privacy Policy",
  kicker: "Legal",
  title: "Privacy Policy",
  lead: "Which personal data we process about teachers, schools and visitors to the website, why, for how long, and what rights you have. Students have their own privacy notice in the app.",
  versionLabel: "Version",
  updatedLabel: "In force from",
  contentsLabel: "Contents",
  summaryTitle: "In short",
  summary: [
    "The school decides about the data created in teaching. We process it only on its instructions.",
    "The website has no cookies, no analytics and no ads.",
    "You sign in with Google or Microsoft. We keep no passwords.",
    "The AI receives only the lesson material, never names, email addresses or class lists of students.",
    "The apps' data is stored in the European Union and encrypted.",
    `We do not sell data. For your rights, write to ${CONTACT} or ask your school.`,
  ],
  sections: [
    {
      id: "who",
      title: "1. Who we are and what this policy covers",
      blocks: [
        {
          p: `1.1. TeacherAid is run by a team of natural persons from ${operatorCity.en}, Republic of North Macedonia: ${team.join(", ")} ("TeacherAid", "we"). Email: ${CONTACT}.`,
        },
        {
          p: "1.2. This policy covers: teachers and other school staff who use the Teacher App (/teacher), visitors to the website teacheraid.education, people who sign up for early access, people who write to us, and users of the Demo.",
        },
        { p: "1.3. Students have a separate privacy notice, written for them, in the Student App (teacheraid.education/app/privacy)." },
        { p: "1.4. The Law on Personal Data Protection of the Republic of North Macedonia applies." },
      ],
    },
    {
      id: "roles",
      title: "2. Who decides about the data",
      blocks: [
        {
          p: "2.1. The school is the controller of the data created in teaching: teachers' and students' accounts, lessons, answers, results and attendance. TeacherAid is the processor: it processes that data only on the school's instructions, under a written Data Processing Agreement.",
        },
        { p: "2.2. TeacherAid is the controller for: visits to the website, early-access sign-ups, messages you send us, and the records needed to keep the Service secure." },
        { p: "2.3. Google and Microsoft are separate controllers for your account with them. Their own privacy policies apply." },
      ],
    },
    {
      id: "teachers",
      title: "3. Data about teachers",
      blocks: [
        { p: "3.1. When you sign in, we receive from Google or Microsoft:" },
        { ul: ["your name;", "your email address;", "which provider you use (Google or Microsoft) and the account's identifier there."] },
        { p: "3.2. From the school or the system we know which school you work at and your role (teacher)." },
        { p: "3.3. While you use the app, we keep:" },
        {
          ul: [
            "what you prepare: text, a topic, uploaded files (PDF, Word), drafts and saved lessons with questions;",
            "the lessons you run: when they started and ended, and the students' answers, results and attendance;",
            "the questions students wrote to you;",
            "whether you have finished the guide on first use.",
          ],
        },
        {
          p: "3.4. Do not put personal data about students or other people in lesson material. If the material contains such data anyway, it is processed only to prepare the lesson.",
        },
      ],
    },
    {
      id: "ai",
      title: "4. Artificial intelligence",
      blocks: [
        {
          p: "4.1. When you prepare a lesson, the text, topic or file you give, together with our instructions, is sent to the AI provider (Claude, by Anthropic) to make a draft.",
        },
        { p: "4.2. We do not send names, email addresses or class lists of students. We do not send your contact details either." },
        {
          p: "4.3. We choose providers whose contract terms do not allow the data in our requests to be used to train their models. The provider and where it processes the data are named in the Data Processing Agreement with the school.",
        },
        { p: "4.4. The AI makes no decisions about you or the students. You review and approve the draft." },
      ],
    },
    {
      id: "students",
      title: "5. Data about students",
      blocks: [
        {
          p: "5.1. What is processed about students (attendance, answers, results, practice, questions to the teacher, leaving the quiz, notifications), why and for how long is described in the students' privacy notice (teacheraid.education/app/privacy). It also says what the teacher sees and what not.",
        },
        { p: "5.2. As a teacher you see data only about the students in your lessons. Use it only for teaching." },
      ],
    },
    {
      id: "website",
      title: "6. The website",
      blocks: [
        { p: "6.1. The website sets no cookies, loads nothing from other sites, and has no analytics, no ads and no social media buttons." },
        {
          p: "6.2. Like any server, the website's hosting receives technical data with every request: IP address, browser, page and time. It is used to deliver the page and for security, and kept briefly.",
        },
        { p: "6.3. If you sign up for early access, we keep:" },
        { ul: ["your email address;", "the time you signed up;", "a short tag saying where the sign-up came from, if the link carried one (for example an event)."] },
        { p: "6.4. To stop abuse of the form, we keep a hash of the IP address, not the address itself, for one minute. Then it is deleted." },
        { p: "6.5. If you email us, we keep the message and your address to answer you." },
      ],
    },
    {
      id: "demo",
      title: "7. The Demo and browser storage",
      blocks: [
        {
          p: "7.1. The Demo (teacheraid.education/teacher and /app) runs on made-up data kept only in your browser. It is not sent to us. You remove it by clearing the site's data in your browser.",
        },
        {
          p: "7.2. The real app keeps in the browser only the settings it needs (for example the language) and, while you are signed in, one session cookie, needed to keep you signed in. There are no tracking cookies.",
        },
      ],
    },
    {
      id: "basis",
      title: "8. Why, and on what basis",
      blocks: [
        {
          ul: [
            "Data created in teaching: to provide the Service to the school, on its instructions and under the Data Processing Agreement. The school sets the legal basis.",
            "Early-access sign-up: your consent, which you can withdraw at any time by writing to us.",
            "Messages to us: to answer your request.",
            "Technical data and security records: our legitimate interest in running the Service securely and preventing abuse.",
            "Where a law requires us to keep or give data: compliance with a legal obligation.",
          ],
        },
        { p: "8.1. We do not sell data, use it for ads, or build marketing profiles." },
      ],
    },
    {
      id: "recipients",
      title: "9. Who sees the data",
      blocks: [
        { p: "9.1. Members of the TeacherAid team, only as far as they need to provide and protect the Service." },
        { p: "9.2. Your school, under its agreement with us." },
        { p: "9.3. Outside providers working for us and only on our instructions:" },
        {
          ul: [
            "Vercel: hosting of the website and the apps;",
            "Upstash: the database that keeps early-access sign-ups;",
            "the AI provider (point 4);",
            "the provider of the apps' server and database, in the European Union, named in the Data Processing Agreement.",
          ],
        },
        { p: "9.4. Competent authorities, only when a law requires it." },
      ],
    },
    {
      id: "where",
      title: "10. Where it is kept",
      blocks: [
        { p: "10.1. The apps' data (accounts, lessons, results) is kept in the European Union." },
        {
          p: "10.2. Some providers (for example Vercel and Upstash) are companies from the United States. When data leaves North Macedonia, we do so only with the safeguards the law requires.",
        },
      ],
    },
    {
      id: "retention",
      title: "11. How long",
      blocks: [
        {
          ul: [
            "Lesson data: until the end of the school year after the one it was created in; then we delete it or turn it into totals without names.",
            "A teacher's account: while the school uses the Service. When a teacher leaves, we delete it within 30 days of the school's request.",
            "When the school stops using the Service: as in the Terms of Service (point 19.5), at the latest 60 days after the end.",
            "Early-access sign-up: until you ask us to delete it, and at most one year from signing up.",
            "Messages to us: one year after the last message, unless needed for a dispute.",
            "Technical data on the server: briefly, only as long as needed for security.",
            "Backups expire on a fixed schedule.",
          ],
        },
      ],
    },
    {
      id: "security",
      title: "12. Security",
      blocks: [
        {
          p: "12.1. We protect data with encryption in transit and at rest, access only for the people who must work with it, sign-in without passwords kept by us, and backups kept for a fixed period.",
        },
        {
          p: "12.2. If there is a personal data breach, we tell the school no later than 48 hours after we learn of it. For data we control, we notify the Personal Data Protection Agency within the period the law sets and, where the law requires, you as well.",
        },
      ],
    },
    {
      id: "rights",
      title: "13. Your rights",
      blocks: [
        { p: "13.1. You have the right to:" },
        {
          ul: [
            "know whether we process your data and get a copy;",
            "have inaccurate data corrected;",
            "have data deleted;",
            "have processing restricted;",
            "receive your data in a machine-readable format;",
            "object to processing based on legitimate interest;",
            "withdraw consent at any time, without affecting what was done before.",
          ],
        },
        {
          p: `13.2. For data created in teaching, you make the request to the school, and we help it. For other data, write to us at ${CONTACT}. We answer within the period the law sets.`,
        },
        {
          p: "13.3. You have the right to file a request with the Personal Data Protection Agency (azlp.mk) if you believe your data is processed contrary to the law.",
        },
      ],
    },
    {
      id: "children",
      title: "14. Children",
      blocks: [
        {
          p: "14.1. The website and the Teacher App are not meant for children. Children use only the Student App, in teaching organised by the school, and the students' privacy notice applies to them.",
        },
      ],
    },
    {
      id: "decisions",
      title: "15. Automated decisions",
      blocks: [{ p: "15.1. We make no decisions about you or students by automated processing alone, and build no profiles with legal or similarly significant effects." }],
    },
    {
      id: "changes",
      title: "16. Changes",
      blocks: [
        {
          p: "16.1. If we change this policy, we publish the new version on this page with a number and a date. For a significant change we tell schools by email before it takes effect.",
        },
      ],
    },
    {
      id: "contact",
      title: "17. Contact",
      blocks: [{ p: `TeacherAid: ${team.join(", ")}. ${operatorCity.en}, Republic of North Macedonia. Email: ${CONTACT}.` }],
    },
  ],
};

export const privacy: Record<Lang, TermsDict> = { mk, en };
export const privacyLegal: LegalMeta = { key: "privacy", paths: privacyPaths, version: privacyVersion, updated: privacyUpdated };
