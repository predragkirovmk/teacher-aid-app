import type { Opener, Question, Text } from "../../quiz";
import type { SubjectId } from "./data";

/**
 * The lessons the mock "teachers" run. Each is what a lesson would be in the real product: a title and
 * prepared questions with their right answers. The scripted session (session.ts) plays one through the
 * same snapshots and events the API will send; the scoring below is the PROPOSED rule of spec 8
 * (BR-PTS-02, BR-PTS-04): 10 for a right answer plus up to 5 for speed.
 */

export type Quiz = { subject: SubjectId; title: Text; opener: Opener; questions: Question[] };

const t = (mk: string, en: string): Text => ({ mk, en });

/** The live quizzes, one for each subject with a class QR. */
export const QUIZZES: Partial<Record<SubjectId, Quiz>> = {
  physics: {
    subject: "physics",
    title: t("Њутнови закони", "Newton's laws"),
    opener: {
      id: "po",
      kind: "prediction",
      text: t(
        "Тешка и лесна топка паѓаат од иста висина во вакуум. Која ќе удри прва?",
        "A heavy ball and a light ball fall from the same height in a vacuum. Which hits the ground first?",
      ),
      options: [t("Тешката", "The heavy one"), t("Лесната", "The light one"), t("Истовремено", "Both at the same time")],
      answer: 2,
      reasons: [
        t("Без воздух нема отпор, па сè паѓа исто.", "With no air there is no drag, so everything falls the same."),
        t("Тешката е повлечена посилно, но и потешка за движење.", "The heavy one is pulled harder, but it is also harder to move."),
        t("Го видов тоа на Месечината, перото и чеканот паднаа заедно.", "I saw it on the Moon: the feather and the hammer landed together."),
        t("Мислам дека тешката е побрза, секогаш е така.", "I think the heavy one is faster, it always is."),
        t("Забрзувањето не зависи од масата.", "Acceleration doesn't depend on mass."),
      ],
    },
    questions: [
      {
        id: "p1",
        kind: "mc",
        text: t(
          "Што се случува со тело кога збирот на силите што делуваат на него е нула?",
          "What happens to a body when the forces acting on it add up to zero?",
        ),
        options: [
          t("Се забрзува во насока на најголемата сила", "It speeds up in the direction of the largest force"),
          t("Мирува или се движи рамномерно праволиниски", "It stays at rest or moves in a straight line at constant speed"),
          t("Постепено забавува и запира", "It slows down and stops"),
          t("Се движи по кружна патека", "It moves in a circle"),
        ],
        answer: 1,
      },
      {
        id: "p2",
        kind: "tf",
        text: t("Масата на телото е помала на Месечината отколку на Земјата.", "A body has less mass on the Moon than on Earth."),
        answer: 1,
      },
      {
        id: "p3",
        kind: "num",
        text: t(
          "Тело се движи со 10 m/s и запира за 4 s. Колкаво е забрзувањето?",
          "A body moving at 10 m/s stops in 4 s. What is its acceleration?",
        ),
        answer: "-2.5",
        tolerance: 0.1,
        unit: "m/s²",
        allowNegative: true,
      },
      {
        id: "p4",
        kind: "tf",
        text: t("Кога туркаш ѕид, и ѕидот те турка тебе со иста сила.", "When you push a wall, the wall pushes back on you with the same force."),
        answer: 0,
      },
      {
        id: "p5",
        kind: "mc",
        text: t("Која величина е мерка за инертноста на телото?", "Which quantity measures a body's inertia?"),
        options: [t("Брзината", "Speed"), t("Тежината", "Weight"), t("Масата", "Mass"), t("Волуменот", "Volume")],
        answer: 2,
      },
    ],
  },
  math: {
    subject: "math",
    title: t("Линеарни равенки", "Linear equations"),
    opener: {
      id: "mo",
      kind: "prediction",
      text: t(
        "Ги удвојуваш двете страни на една равенка. Што се случува со решението?",
        "You double both sides of an equation. What happens to its solution?",
      ),
      options: [t("Се удвојува", "It doubles"), t("Останува исто", "It stays the same"), t("Се преполовува", "It halves")],
      answer: 1,
      reasons: [
        t("Исто нешто на двете страни не ја менува рамнотежата.", "The same thing on both sides doesn't tip the balance."),
        t("Како вага: ставам исто на двата краја.", "Like a scale: I put the same on both ends."),
        t("Пробав 2x = 4, па 4x = 8. Пак x = 2.", "I tried 2x = 4, then 4x = 8. Still x = 2."),
        t("Мислам дека се удвојува бидејќи сè е двојно.", "I think it doubles because everything is doubled."),
        t("Решението е x, а x не се менува.", "The solution is x, and x doesn't change."),
      ],
    },
    questions: [
      {
        id: "m1",
        kind: "mc",
        text: t("Реши ја равенката: 3x\u00a0+\u00a06\u00a0=\u00a021", "Solve the equation: 3x\u00a0+\u00a06\u00a0=\u00a021"),
        options: [t("x = 9", "x = 9"), t("x = 5", "x = 5"), t("x = 7", "x = 7"), t("x = 15", "x = 15")],
        answer: 1,
      },
      {
        id: "m2",
        kind: "tf",
        text: t("Равенката 2x\u00a0=\u00a02x\u00a0+\u00a01 нема решение.", "The equation 2x\u00a0=\u00a02x\u00a0+\u00a01 has no solution."),
        answer: 0,
      },
      {
        id: "m3",
        kind: "num",
        text: t("Реши ја равенката 4x\u00a0−\u00a03\u00a0=\u00a010. Колку е x?", "Solve 4x\u00a0−\u00a03\u00a0=\u00a010. What is x?"),
        answer: "3.25",
        tolerance: 0.01,
      },
      {
        id: "m4",
        kind: "tf",
        text: t(
          "Ако двете страни на равенката ги помножиш со 0, добиваш еквивалентна равенка.",
          "Multiplying both sides of an equation by 0 gives an equivalent equation.",
        ),
        answer: 1,
      },
      {
        id: "m5",
        kind: "mc",
        text: t("Колку е наклонот на правата y\u00a0=\u00a02x\u00a0−\u00a03?", "What is the slope of the line y\u00a0=\u00a02x\u00a0−\u00a03?"),
        options: [t("−3", "−3"), t("3", "3"), t("2", "2"), t("−2", "−2")],
        answer: 2,
      },
    ],
  },
  mkd: {
    subject: "mkd",
    title: t("Видови зборови", "Parts of speech"),
    opener: {
      id: "ko",
      kind: "debate",
      text: t("Правилното пишување е важно и во порака до другар.", "Spelling matters, even in a message to a friend."),
      agreeShare: 0.6,
      reasons: {
        agree: [
          t("Така ме разбираат без да погодуваат.", "That way they understand me without guessing."),
          t("Навика е: ако пишувам лошо, ќе пишувам лошо секаде.", "It's a habit: write badly here, write badly everywhere."),
          t("Грешката во пораката може да смени што значи.", "A typo can change what the message means."),
        ],
        disagree: [
          t("Важно е да се разбереме, не да биде совршено.", "What matters is understanding each other, not perfection."),
          t("Пораките се брзи, никој не гледа запирки.", "Messages are quick, nobody checks commas."),
          t("Со другар може и скратено.", "With a friend, short is fine."),
        ],
      },
    },
    questions: [
      {
        id: "k1",
        kind: "mc",
        text: t("Кој збор е придавка?", "Which word is an adjective?"),
        options: [t("трча", "трча"), t("убав", "убав"), t("брзо", "брзо"), t("куќа", "куќа")],
        answer: 1,
      },
      {
        id: "k2",
        kind: "tf",
        text: t("Зборот „брзо“ е прилог.", "The word „брзо“ is an adverb."),
        answer: 0,
      },
      {
        id: "k3",
        kind: "mc",
        text: t("Кој збор е именка?", "Which word is a noun?"),
        options: [t("зелен", "зелен"), t("пишува", "пишува"), t("училиште", "училиште"), t("денес", "денес")],
        answer: 2,
      },
      {
        id: "k4",
        kind: "tf",
        text: t("Зборот „тие“ е глагол.", "The word „тие“ is a verb."),
        answer: 1,
      },
      {
        id: "k5",
        kind: "mc",
        text: t("Колку слогови има зборот „математика“?", "How many syllables does „математика“ have?"),
        options: [t("3", "3"), t("4", "4"), t("5", "5"), t("6", "6")],
        answer: 2,
      },
    ],
  },
  english: {
    subject: "english",
    title: t("Past simple", "Past simple"),
    opener: {
      id: "eo",
      kind: "debate",
      text: t("Англиски се учи полесно со песни отколку со учебник.", "English is easier to learn from songs than from a textbook."),
      agreeShare: 0.55,
      reasons: {
        agree: [
          t("Песните ги паметам без да учам.", "I remember songs without trying."),
          t("Слушам секој ден, па зборовите ми се лепат.", "I listen every day, so the words stick."),
          t("Во песна гледам како се зборува навистина.", "A song shows how people really speak."),
        ],
        disagree: [
          t("Учебникот ми ја објаснува граматиката.", "The textbook explains the grammar."),
          t("Во песните има збор што не го разбирам.", "Songs have words I can't make out."),
          t("Без правила правам грешки.", "Without rules I make mistakes."),
        ],
      },
    },
    questions: [
      {
        id: "e1",
        kind: "mc",
        text: t("Избери ја точната форма: Yesterday I ___ to school.", "Choose the right form: Yesterday I ___ to school."),
        options: [t("go", "go"), t("went", "went"), t("gone", "gone"), t("going", "going")],
        answer: 1,
      },
      {
        id: "e2",
        kind: "tf",
        text: t("„Bought“ е минатата форма на „buy“.", "„Bought“ is the past form of „buy“."),
        answer: 0,
      },
      {
        id: "e3",
        kind: "mc",
        text: t("Која реченица е точна?", "Which sentence is correct?"),
        options: [
          t("She didn't went home.", "She didn't went home."),
          t("She didn't go home.", "She didn't go home."),
          t("She not went home.", "She not went home."),
          t("She don't go home.", "She don't go home."),
        ],
        answer: 1,
      },
      {
        id: "e4",
        kind: "tf",
        text: t("„Readed“ е точната минатата форма на „read“.", "„Readed“ is the correct past form of „read“."),
        answer: 1,
      },
      {
        id: "e5",
        kind: "mc",
        text: t("Минатата форма на „teach“ е:", "The past form of „teach“ is:"),
        options: [t("teached", "teached"), t("taught", "taught"), t("tought", "tought"), t("teach", "teach")],
        answer: 1,
      },
    ],
  },
};

/** Time per question: the proposed defaults of spec 8 (BR-TIME-01), shortened a little for the demo. */
export const DURATION = { mc: 20_000, tf: 15_000, num: 30_000 } as const;

/** The opener's two timers (BR-TIME-01 proposes 30 s to vote and 45 s for the reason), shortened for the demo. */
export const OPENER_TIMES = { vote: 15_000, reason: 25_000 } as const;
/** The longest a reason may be (BR-Q-03, PROPOSED). */
export const REASON_MAX = 80;
/** What a written reason is worth, right vote or not (BR-PTS-02, BR-PTS-06). */
export const REASON_POINTS = 8;

export const CORRECT_POINTS = 10;
export const SPEED_POINTS = 5;

/** The speed bonus for an answer given with `leftMs` of `durationMs` still on the clock. */
export const speedBonus = (leftMs: number, durationMs: number) => Math.round((SPEED_POINTS * leftMs) / durationMs);

/** Classmates in Cyrillic; the English interface shows them transliterated. */
export const CLASSMATES = [
  "Ана Георгиевска", "Лука Стојановски", "Мила Јованова", "Нина Поповска", "Виктор Илиевски",
  "Сара Николова", "Филип Ангелов", "Јана Петровска", "Давид Костов", "Елена Митревска",
  "Стефан Трајков", "Ива Ристовска", "Марија Талевска", "Никола Велјановски", "Теодора Спасовска",
  "Горјан Наумовски", "Ема Стефановска", "Бојан Цветков", "Ана Марија Ѓорѓиева", "Кристијан Арсов",
  "Леа Димовска", "Петар Зафировски", "Миа Бошковска", "Андреј Јанев", "Софија Илиевска",
  "Тамара Костовска", "Огнен Тодоровски",
];
