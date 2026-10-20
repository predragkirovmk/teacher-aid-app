"use client";

import { startTransition, useCallback, useEffect, useMemo, useReducer } from "react";
import type { SubjectId } from "./data";
import { actions } from "./store";
import type { Question, QuizRun, Stage, Text } from "../../quiz";

/**
 * The live quiz a class QR opens. Version 1 has no backend yet, so this module plays the
 * teacher, the server timer and the 27 classmates: the teacher starts the quiz a few seconds
 * after you join and fires each next question, classmates join and answer on their own clock,
 * and a question closes when time is up or everyone has answered (spec 5.3 to 5.6).
 * Scoring follows spec 13.1: 10 for a right answer plus up to 5 for speed.
 */

export type Quiz = { subject: SubjectId; title: Text; questions: Question[] };

const t = (mk: string, en: string): Text => ({ mk, en });

/** The live quizzes, one for each subject with a class QR. */
export const QUIZZES: Partial<Record<SubjectId, Quiz>> = {
  physics: {
    subject: "physics",
    title: t("Њутнови закони", "Newton's laws"),
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
        kind: "mc",
        text: t("Сила од 10 N делува на тело со маса 2 kg. Колкаво е забрзувањето?", "A 10 N force acts on a 2 kg body. What is its acceleration?"),
        options: [t("20 m/s²", "20 m/s²"), t("5 m/s²", "5 m/s²"), t("12 m/s²", "12 m/s²"), t("0,2 m/s²", "0.2 m/s²")],
        answer: 1,
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
        kind: "mc",
        text: t("Колку е x ако x/4\u00a0=\u00a03?", "What is x if x/4\u00a0=\u00a03?"),
        options: [t("12", "12"), t("7", "7"), t("0,75", "0.75"), t("1", "1")],
        answer: 0,
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

/** Seconds per question: the proposed defaults of spec 4.4, shortened a little for the demo. */
export const DURATION = { mc: 20_000, tf: 15_000 } as const;
const JOINED_MS = 1700;
const LOBBY_MS = 6500;
const REVEAL_MS = 3800;
const BETWEEN_MS = 4800;

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

export type State = {
  stage: Stage;
  index: number;
  /** When the current stage began, and the clock as of the last tick. */
  stageAt: number;
  now: number;
  /** Classmates in the order they joined, and how many are in. */
  joinOrder: number[];
  joined: number;
  /** Per classmate: when they answer this question (ms after it opens), and whether they are right. */
  answerAt: number[];
  rightness: boolean[];
  picked: number | null;
  pickedAt: number | null;
  /** Running points: mine and each classmate's, for the in-quiz ranking. */
  mine: number;
  theirs: number[];
  /** How many questions I have answered right so far. */
  right: number;
  gain: number;
  bonus: number;
  correct: boolean;
  rankBefore: number;
};

export type Action =
  | { type: "tick"; now: number }
  | { type: "pick"; option: number; now: number }
  | { type: "advance"; now: number; to: Stage };

const N = CLASSMATES.length;
/** How likely each classmate is to be right: a fixed spread so the ranking moves believably. */
const SKILL = CLASSMATES.map((_, i) => 0.35 + ((i * 37) % 40) / 100);

function shuffle(n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const rankOf = (mine: number, theirs: number[]) => 1 + theirs.filter((p) => p > mine).length;

function openQuestion(s: State, quiz: Quiz, index: number, now: number): State {
  const q = quiz.questions[index];
  const dur = DURATION[q.kind];
  return {
    ...s,
    stage: "question",
    index,
    stageAt: now,
    now,
    joined: N,
    // Most of the class answers in the first two thirds of the time, a few leave it late.
    answerAt: CLASSMATES.map(() => 2500 + Math.random() * (Math.random() < 0.85 ? dur * 0.6 : dur * 0.9 - 2500)),
    rightness: SKILL.map((p) => Math.random() < p),
    picked: null,
    pickedAt: null,
  };
}

function closeQuestion(s: State, quiz: Quiz, now: number): State {
  const q = quiz.questions[s.index];
  const dur = DURATION[q.kind];
  const correct = s.picked !== null && s.picked === q.answer;
  const left = s.pickedAt === null ? 0 : Math.max(0, dur - (s.pickedAt - s.stageAt));
  const bonus = correct ? speedBonus(left, dur) : 0;
  const gain = correct ? CORRECT_POINTS + bonus : 0;
  const theirs = s.theirs.map((p, i) => {
    if (!s.rightness[i]) return p;
    const theirLeft = Math.max(0, dur - Math.min(s.answerAt[i], dur));
    return p + CORRECT_POINTS + speedBonus(theirLeft, dur);
  });
  return {
    ...s,
    stage: "reveal",
    stageAt: now,
    now,
    rankBefore: rankOf(s.mine, s.theirs),
    mine: s.mine + gain,
    theirs,
    right: s.right + (correct ? 1 : 0),
    gain,
    bonus,
    correct,
  };
}

export function reducer(quiz: Quiz) {
  return (s: State, a: Action): State => {
    const q = quiz.questions[s.index];
    switch (a.type) {
      case "tick": {
        if (s.stage === "lobby") {
          // Classmates keep arriving until the teacher starts.
          const due = Math.min(N, 9 + Math.floor((a.now - s.stageAt) / 640));
          return due <= s.joined ? s : { ...s, now: a.now, joined: due };
        }
        if (s.stage !== "question") return s;
        const elapsed = a.now - s.stageAt;
        const everyone = s.answerAt.every((t) => t <= elapsed);
        if (elapsed >= DURATION[q.kind] || (s.picked !== null && everyone)) return closeQuestion(s, quiz, a.now);
        return { ...s, now: a.now };
      }
      case "pick": {
        if (s.stage !== "question" || s.picked !== null) return s;
        const elapsed = a.now - s.stageAt;
        // Once you have answered, the stragglers come in within a few seconds.
        const answerAt = s.answerAt.map((t) => (t > elapsed ? elapsed + 600 + Math.random() * 3200 : t));
        return { ...s, now: a.now, picked: a.option, pickedAt: a.now, answerAt };
      }
      case "advance": {
        if (a.to === "lobby") return { ...s, stage: "lobby", stageAt: a.now, now: a.now, joined: 9 };
        if (a.to === "question") return openQuestion(s, quiz, s.stage === "between" ? s.index + 1 : 0, a.now);
        if (a.to === "between") return { ...s, stage: "between", stageAt: a.now, now: a.now };
        return s;
      }
    }
  };
}

export function initial(): State {
  return {
    stage: "joined",
    index: 0,
    stageAt: 0,
    now: 0,
    joinOrder: shuffle(N),
    joined: 0,
    answerAt: [],
    rightness: [],
    picked: null,
    pickedAt: null,
    mine: 0,
    theirs: CLASSMATES.map(() => 0),
    right: 0,
    gain: 0,
    bonus: 0,
    correct: false,
    rankBefore: 1,
  };
}

/** Runs one quiz from the joined confirmation to the last question. */
function useQuiz(quiz: Quiz, onPoints?: (points: number) => void): QuizRun {
  const reduce = useMemo(() => reducer(quiz), [quiz]);
  const [s, dispatch] = useReducer(reduce, undefined, initial);
  const last = s.index === quiz.questions.length - 1;

  // The stage clock: one timer per stage, and a light tick while something counts.
  useEffect(() => {
    const plan: Partial<Record<Stage, [Stage, number]>> = {
      joined: ["lobby", JOINED_MS],
      lobby: ["question", LOBBY_MS],
      reveal: ["between", REVEAL_MS],
      between: ["question", BETWEEN_MS],
    };
    const step = s.stage === "between" && last ? undefined : plan[s.stage];
    const go = () => {
      const advance = () => dispatch({ type: "advance", to: step![0], now: Date.now() });
      // Joined to lobby is a transition, so the quiz card can morph into its place.
      if (s.stage === "joined") startTransition(advance);
      else advance();
    };
    const timer = step ? setTimeout(go, step[1]) : undefined;
    const ticking = s.stage === "lobby" || s.stage === "question";
    const tick = ticking ? setInterval(() => dispatch({ type: "tick", now: Date.now() }), 200) : undefined;
    return () => {
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [s.stage, s.index, last]);

  // Points leave the quiz the moment they are earned, so leaving early keeps them.
  useEffect(() => {
    if (s.stage === "reveal" && s.gain > 0) onPoints?.(s.gain);
    // Only on entering a reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.stage, s.index]);

  const pick = useCallback((option: number) => dispatch({ type: "pick", option, now: Date.now() }), []);

  const question = quiz.questions[s.index];
  const duration = DURATION[question.kind];
  const elapsed = Math.max(0, s.now - s.stageAt);
  const answered = s.stage === "question" ? s.answerAt.filter((t) => t <= elapsed).length : N;
  const rank = rankOf(s.mine, s.theirs);

  return {
    stage: s.stage,
    index: s.index,
    total: quiz.questions.length,
    last,
    question,
    duration,
    stageAt: s.stageAt,
    elapsed,
    secondsLeft: Math.max(0, Math.ceil((duration - elapsed) / 1000)),
    picked: s.picked,
    answered,
    classSize: N,
    classmates: CLASSMATES,
    joined: s.joined,
    joinedRecent: s.joinOrder.slice(0, s.joined).slice(-5).reverse(),
    points: s.mine,
    gain: s.gain,
    bonus: s.bonus,
    correct: s.correct,
    right: s.right,
    rank,
    rankBefore: s.rankBefore,
    theirs: s.theirs,
    pick,
  };
}

/**
 * The demo's quiz for a class, with its points and achievements written to the demo store as they
 * are earned, so leaving early keeps them: the mock plays the server's ledger as well as the teacher.
 */
export function useMockQuizRun(courseId: string): QuizRun {
  const run = useQuiz(QUIZZES[courseId as SubjectId]!, actions.addQuizPoints);

  // Achievements come from quiz play: a first answer, right or wrong, and a whole quiz answered right.
  useEffect(() => {
    if (run.stage !== "reveal") return;
    if (run.picked !== null) actions.markQuizAnswered();
    if (run.last && run.right === run.total) actions.markPerfectQuiz();
  }, [run.stage, run.picked, run.last, run.right, run.total]);

  return run;
}
