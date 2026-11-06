import { defaultTimerSeconds, QUESTIONS_MAX } from "../scoring";
import type { Question, Refinement } from "./types";

/**
 * The lessons the demo school draws on, in Macedonian: five to seven questions each, of all three
 * kinds, with the answer and why. They stand in for the AI: the mock "generates" a lesson by picking
 * the one that fits the teacher's words, and the demo's lesson history, prepared lessons and school
 * library are made from them. Invented for the demo; nothing here is a source for the backend.
 */

/** A picture on a question: the address it is served from (the demo's own are drawings kept in the address itself) and what it shows. */
type Picture = { url: string; alt: string };

type Template =
  | { kind: "multiple_choice"; prompt: string; options: string[]; correct: string; explanation: string; timer?: number; picture?: Picture }
  | { kind: "true_false"; prompt: string; correct: "true" | "false"; explanation: string; timer?: number; picture?: Picture }
  | {
      kind: "numeric";
      prompt: string;
      correct: string;
      tolerance: number;
      unit: string | null;
      allow_negative: boolean;
      explanation: string;
      timer?: number;
      picture?: Picture;
    };

/** A drawing as an address, so that the demo needs no file and no server for it: what the real API serves as a picture's `url`. */
const drawing = (svg: string, alt: string): Picture => ({ url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, alt });

const RIGHT_TRIANGLE = drawing(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240" width="320" height="240"><rect width="320" height="240" fill="#ffffff"/>' +
    '<polygon points="40,210 280,210 40,30" fill="#cfe8ec" stroke="#124554" stroke-width="4" stroke-linejoin="round"/>' +
    '<rect x="40" y="186" width="24" height="24" fill="none" stroke="#124554" stroke-width="3"/>' +
    '<text x="150" y="234" font-size="24" font-family="sans-serif" fill="#124554">8</text>' +
    '<text x="14" y="125" font-size="24" font-family="sans-serif" fill="#124554">6</text></svg>',
  "Правоаголен триаголник со катети 6 и 8",
);

const mc = (prompt: string, options: string[], correct: number, explanation: string, timer?: number): Template => ({
  kind: "multiple_choice",
  prompt,
  options,
  correct: String(correct),
  explanation,
  timer,
});

const tf = (prompt: string, correct: boolean, explanation: string, timer?: number): Template => ({
  kind: "true_false",
  prompt,
  correct: correct ? "true" : "false",
  explanation,
  timer,
});

const num = (
  prompt: string,
  correct: number | string,
  explanation: string,
  { tolerance = 0, unit = null, negative = false, timer, picture }: { tolerance?: number; unit?: string | null; negative?: boolean; timer?: number; picture?: Picture } = {},
): Template => ({
  kind: "numeric",
  prompt,
  correct: String(correct),
  tolerance,
  unit,
  allow_negative: negative,
  explanation,
  timer,
  picture,
});

export type BankLesson = {
  key: string;
  title: string;
  /** What the lesson is about, for per-topic results. */
  topic: string;
  /** The school year it suits, or the study year at a faculty. */
  year: number;
  /** How much harder the topic is for a class than an average one: it lowers the demo students' chance of a right answer. */
  difficulty: number;
  /** Lower-case stems the mock looks for in the teacher's words to choose this lesson. */
  keywords: string[];
  summary: string;
  questions: Template[];
};

export const BANK: BankLesson[] = [
  {
    key: "kvadratni-ravenki",
    title: "Квадратни равенки",
    topic: "Квадратни равенки",
    year: 2,
    difficulty: 0.05,
    keywords: ["квадратн", "равенк", "дискриминант", "виет", "quadratic"],
    summary:
      "Квадратна е равенка во која најголемиот степен на непознатата е 2. Бројот на решенија го одредува дискриминантата D = b² − 4ac: две решенија за D > 0, едно за D = 0 и ниедно реално за D < 0. Збирот на решенијата е −b/a, а производот c/a.",
    questions: [
      mc("Која од равенките е квадратна?", ["2x + 5 = 0", "x² − 4x + 3 = 0", "x³ − 1 = 0", "3/x = 6"], 1, "Квадратна е равенка во која најголемиот степен на непознатата е 2."),
      tf("Равенката x² + 4 = 0 нема реални решенија.", true, "x² никогаш не е помало од 0, па x² + 4 е секогаш најмалку 4 и не може да биде 0."),
      num("Колку е дискриминантата на равенката x² − 5x + 6 = 0?", 1, "D = b² − 4ac = 25 − 24 = 1.", { negative: true }),
      mc("Колку решенија има равенката x² − 6x + 9 = 0?", ["Две различни", "Едно (двојно) решение", "Нема реални решенија", "Бесконечно многу"], 1, "D = 36 − 36 = 0, па равенката има едно двојно решение, x = 3."),
      num("Колку е поголемото решение на равенката x² − 5x + 6 = 0?", 3, "x² − 5x + 6 = (x − 2)(x − 3), па x = 2 или x = 3."),
      num("Колку е збирот на решенијата на равенката x² − 7x + 10 = 0?", 7, "Според Виет, x₁ + x₂ = −b/a = 7."),
    ],
  },
  {
    key: "kvadratna-funkcija",
    title: "Квадратна функција",
    topic: "Квадратна функција",
    year: 2,
    difficulty: 0.08,
    keywords: ["парабол", "квадратна функц", "теме на"],
    summary:
      "Графикот на квадратната функција y = ax² + bx + c е парабола. Се отвора нагоре за a > 0 и надолу за a < 0. Темето има апциса x = −b/2a, и тоа е оската на симетрија на параболата.",
    questions: [
      mc("Графикот на функцијата y = x² − 4 е ...", ["права", "парабола што се отвора нагоре", "парабола што се отвора надолу", "хипербола"], 1, "Коефициентот пред x² е позитивен, па параболата се отвора нагоре."),
      tf("Темето на параболата y = x² е во точката (0, 0).", true, "Најмалата вредност на x² е 0, и се добива за x = 0."),
      num("Колку е y за x = 3 кај функцијата y = x² − 2x + 1?", 4, "y = 9 − 6 + 1 = 4.", { timer: 30 }),
      mc("Која е оската на симетрија на параболата y = x² − 6x + 5?", ["x = −3", "x = 3", "x = 6", "x = 5"], 1, "x = −b/2a = 6/2 = 3."),
      num("Колку е најмалата вредност на функцијата y = x² − 6x + 5?", -4, "Најмалата вредност е во темето: x = 3, y = 9 − 18 + 5 = −4.", { negative: true }),
    ],
  },
  {
    key: "sistemi",
    title: "Системи линеарни равенки",
    topic: "Системи равенки",
    year: 2,
    difficulty: 0,
    keywords: ["систем", "линеарн", "непознат", "елиминац", "замена"],
    summary:
      "Систем од две линеарни равенки со две непознати се решава со метод на замена или со метод на спротивни коефициенти. Системот може да има едно решение, ниедно (паралелни прави) или бесконечно многу (иста права).",
    questions: [
      tf("Парот x = 3, y = 2 е решение на системот x + y = 5, x − y = 1.", true, "3 + 2 = 5 и 3 − 2 = 1, па двете равенки важат."),
      num("Ако x + y = 10 и x − y = 4, колку е x?", 7, "Со собирање на равенките добиваме 2x = 14, односно x = 7."),
      mc("Кој метод ја елиминира непознатата со собирање на равенките?", ["Метод на замена", "Метод на спротивни коефициенти", "Графички метод", "Метод на проба"], 1, "Кога коефициентите на една непозната се спротивни, при собирање таа отпаѓа."),
      num("Решете го системот 2x + y = 7, x − y = −1. Колку е y?", 3, "Со собирање: 3x = 6, па x = 2. Потоа y = 7 − 4 = 3."),
      mc("Системот x + y = 2, 2x + 2y = 5 има ...", ["едно решение", "две решенија", "нема решение", "бесконечно многу решенија"], 2, "Втората равенка е x + y = 2,5, што е паралелна права на првата, па нема заедничка точка."),
    ],
  },
  {
    key: "logaritmi",
    title: "Логаритми",
    topic: "Логаритми",
    year: 3,
    difficulty: 0.1,
    keywords: ["логаритм", "log", "експонент"],
    summary:
      "Логаритмот log_a b е степенот на кој треба да се подигне основата a за да се добие b. Важат правилата log(xy) = log x + log y и log(x/y) = log x − log y. Експоненцијалните равенки aˣ = b се решаваат со логаритмирање.",
    questions: [
      mc("Колку е log₂ 8?", ["2", "3", "4", "8"], 1, "2³ = 8, па log₂ 8 = 3."),
      tf("log 100 = 2 (децимален логаритам).", true, "10² = 100."),
      num("Колку е log₃ 81?", 4, "3⁴ = 81."),
      mc("Кое својство на логаритмите е точно?", ["log(a·b) = log a + log b", "log(a + b) = log a · log b", "log(a·b) = log a · log b", "log(a/b) = log a + log b"], 0, "Логаритмот од производ е збир на логаритмите."),
      num("Решете ја равенката 2ˣ = 32. Колку е x?", 5, "32 = 2⁵, па x = 5."),
      tf("log 1 = 0 за секоја допуштена основа.", true, "a⁰ = 1 за секое a > 0, a ≠ 1."),
    ],
  },
  {
    key: "trigonometrija",
    title: "Тригонометрија на правоаголен триаголник",
    topic: "Тригонометрија",
    year: 3,
    difficulty: 0.06,
    keywords: ["тригонометр", "синус", "косинус", "тангенс", "sin", "cos"],
    summary:
      "Во правоаголен триаголник sin α е односот на спротивната катета и хипотенузата, cos α на налегнатата катета и хипотенузата, а tg α на спротивната и налегнатата катета. За секој агол важи sin²α + cos²α = 1.",
    questions: [
      mc("Колку е sin 30°?", ["1/2", "√3/2", "1", "√2/2"], 0, "sin 30° = 1/2, една од основните вредности."),
      tf("sin²α + cos²α = 1 за секој агол α.", true, "Ова е основниот тригонометриски идентитет."),
      num("Колку степени е π/2 радијани?", 90, "π радијани се 180°, па π/2 е 90°."),
      mc("Во правоаголен триаголник tg α е однос на ...", ["спротивната катета и хипотенузата", "спротивната и налегнатата катета", "налегнатата катета и хипотенузата", "хипотенузата и спротивната катета"], 1, "tg α = спротивна катета / налегната катета."),
      num("Колку е cos 60° + sin 30°?", 1, "cos 60° = 1/2 и sin 30° = 1/2, па збирот е 1."),
    ],
  },
  {
    key: "nizi",
    title: "Аритметичка и геометриска низа",
    topic: "Низи",
    year: 3,
    difficulty: 0.04,
    keywords: ["низ", "аритметичк", "геометриск", "прогресиј"],
    summary:
      "Кај аритметичката низа соседните членови се разликуваат за константа d, и aₙ = a₁ + (n − 1)d. Кај геометриската низа секој член е q пати поголем од претходниот, и bₙ = b₁ · qⁿ⁻¹.",
    questions: [
      tf("Низата 2, 5, 8, 11, ... е аритметичка низа со разлика 3.", true, "Секој член е за 3 поголем од претходниот."),
      num("Колку е десеттиот член на аритметичка низа со a₁ = 4 и d = 3?", 31, "a₁₀ = 4 + 9 · 3 = 31."),
      mc("Колкав е количникот на геометриската низа 3, 6, 12, 24, ...?", ["2", "3", "6", "9"], 0, "6 : 3 = 2, 12 : 6 = 2, ..."),
      num("Колку е збирот на првите 10 природни броеви?", 55, "S = n(n + 1)/2 = 10 · 11 / 2 = 55."),
      num("Колку е четвртиот член на геометриска низа со b₁ = 2 и q = 3?", 54, "b₄ = 2 · 3³ = 54."),
    ],
  },
  {
    key: "granici",
    title: "Граници на низи и функции",
    topic: "Граници",
    year: 4,
    difficulty: 0.12,
    keywords: ["границ", "лимит", "lim", "непрекин"],
    summary:
      "Границата на низа или функција е вредноста кон која таа се приближува. Кај количници на полиноми кога x → ∞ решава односот на водечките членови. Неопределеностите од облик 0/0 се решаваат со кратење или со разложување.",
    questions: [
      mc("Колку е lim 1/n кога n → ∞?", ["0", "1", "∞", "не постои"], 0, "Колку n станува поголемо, 1/n станува сѐ помало и се приближува до 0."),
      tf("Низата 1, 2, 3, 4, ... има конечна граница.", false, "Членовите растат без ограничување, па низата дивергира кон ∞."),
      num("Колку е lim (x² − 4)/(x − 2) кога x → 2?", 4, "(x² − 4)/(x − 2) = x + 2, а за x → 2 тоа е 4."),
      mc("Колку е lim (3x + 1)/(x − 5) кога x → ∞?", ["0", "1", "3", "∞"], 2, "Ги делиме броителот и именителот со x: (3 + 1/x)/(1 − 5/x) → 3."),
      num("Колку е lim (2n² + 1)/(n² + 3) кога n → ∞?", 2, "Односот на водечките коефициенти е 2/1 = 2."),
    ],
  },
  {
    key: "izvodi",
    title: "Извод на функција",
    topic: "Изводи",
    year: 4,
    difficulty: 0.1,
    keywords: ["извод", "дериват", "диференц"],
    summary:
      "Изводот на функцијата во точка е нејзиниот коефициент на правец на тангентата. Основни правила: (xⁿ)′ = n·xⁿ⁻¹, (sin x)′ = cos x, изводот на константа е 0. Екстремите се бараат таму каде што изводот е нула.",
    questions: [
      mc("Колку е изводот на f(x) = x³?", ["x²", "3x²", "3x", "x³/3"], 1, "(xⁿ)′ = n·xⁿ⁻¹, па (x³)′ = 3x²."),
      tf("Изводот на константна функција е нула.", true, "Константата не се менува, па нејзината промена е 0."),
      num("Колку е f′(2) за f(x) = x² + 3x?", 7, "f′(x) = 2x + 3, па f′(2) = 7."),
      mc("Колку е изводот на f(x) = sin x?", ["cos x", "−cos x", "−sin x", "tg x"], 0, "(sin x)′ = cos x."),
      num("Во која точка x функцијата f(x) = x² − 4x + 7 има минимум?", 2, "f′(x) = 2x − 4 = 0 дава x = 2."),
    ],
  },
  {
    key: "integrali",
    title: "Неопределен и определен интеграл",
    topic: "Интеграли",
    year: 1,
    difficulty: 0.12,
    keywords: ["интеграл", "примитивн"],
    summary:
      "Неопределениот интеграл е множеството на сите примитивни функции, F(x) + C. Определениот интеграл на [a, b] е F(b) − F(a) и ја дава плоштината под графикот на функцијата.",
    questions: [
      mc("Колку е ∫ 2x dx?", ["x² + C", "2x² + C", "x + C", "2 + C"], 0, "(x²)′ = 2x, па примитивна функција е x² + C."),
      tf("Определениот интеграл ∫₀¹ x dx е еднаков на 1/2.", true, "∫₀¹ x dx = [x²/2] од 0 до 1 = 1/2."),
      num("Колку е ∫₀² 3x² dx?", 8, "Примитивна функција е x³, па 2³ − 0³ = 8."),
      mc("Колку е ∫ cos x dx?", ["−sin x + C", "sin x + C", "cos x + C", "−cos x + C"], 1, "(sin x)′ = cos x."),
      num("Колкава е плоштината под правата y = x од x = 0 до x = 4?", 8, "∫₀⁴ x dx = 4²/2 = 8."),
    ],
  },
  {
    key: "matrici",
    title: "Матрици и детерминанти",
    topic: "Матрици",
    year: 2,
    difficulty: 0.07,
    keywords: ["матриц", "детермин"],
    summary:
      "Матриците со иста големина се собираат елемент по елемент. Производот A·B постои кога бројот на колоните на A е еднаков на бројот на редовите на B. Детерминантата на 2×2 матрица [[a, b], [c, d]] е ad − bc.",
    questions: [
      tf("Две матрици може да се соберат само ако имаат иста големина.", true, "Собирањето е елемент по елемент, па мора да има соодветен елемент."),
      num("Колку е следата (збирот на дијагоналните елементи) на матрицата A = [[1, 2], [3, 4]]?", 5, "1 + 4 = 5."),
      mc("Која од матриците е единична?", ["[[1, 0], [0, 1]]", "[[0, 1], [1, 0]]", "[[1, 1], [1, 1]]", "[[0, 0], [0, 0]]"], 0, "Единичната матрица има единици на главната дијагонала и нули на другите места."),
      num("Колку е детерминантата на матрицата [[2, 1], [5, 3]]?", 1, "2 · 3 − 1 · 5 = 1.", { negative: true }),
      mc("A е матрица 2×3, а B е матрица 3×4. Колкава е матрицата A·B?", ["2×4", "3×3", "2×3", "3×4"], 0, "Се добива матрица со редовите на A и колоните на B."),
    ],
  },
  {
    key: "kombinatorika",
    title: "Основи на комбинаториката",
    topic: "Комбинаторика",
    year: 3,
    difficulty: 0.06,
    keywords: ["комбинатор", "пермутац", "варијац", "факториел"],
    summary:
      "Кога редоследот е важен, се броат варијации и пермутации; кога не е важен, комбинации. Пермутациите на n елементи се n!, а комбинациите од n по k се C(n, k) = n! / (k!(n − k)!).",
    questions: [
      num("На колку начини можат да се наредат 4 книги на полица?", 24, "Пермутации на 4 елементи: 4! = 24."),
      tf("Бројот на комбинации C(5, 2) е еднаков на 10.", true, "C(5, 2) = 5 · 4 / 2 = 10."),
      mc("Колку е C(6, 3)?", ["10", "15", "20", "30"], 2, "C(6, 3) = 6 · 5 · 4 / (3 · 2 · 1) = 20."),
      num("Колку трицифрени броеви со различни цифри може да се направат од цифрите 1, 2 и 3?", 6, "Редоследот е важен, па 3! = 6."),
      mc("Кога редоследот на изборот е важен, се користат ...", ["комбинации", "варијации", "само збирови", "пропорции"], 1, "Варијациите го земаат предвид редоследот, комбинациите не."),
    ],
  },
  {
    key: "verojatnost",
    title: "Основи на веројатноста",
    topic: "Веројатност",
    year: 4,
    difficulty: 0.08,
    keywords: ["веројатн", "настан", "коцка", "монета"],
    summary:
      "Веројатноста на настан е односот на поволните и сите можни исходи. Таа е секогаш меѓу 0 и 1, а збирот на веројатностите на сите исходи е 1. За независни настани веројатностите се множат.",
    questions: [
      tf("Веројатноста на сигурен настан е 1.", true, "Сигурниот настан се случува секогаш."),
      mc("Монета се фрла два пати. Колкава е веројатноста два пати да падне глава?", ["1/2", "1/3", "1/4", "1/8"], 2, "1/2 · 1/2 = 1/4."),
      num("Колкава е веројатноста при фрлање коцка да падне број поголем од 4? Напишете децимален број со две децимали.", "0.33", "Поволни се 5 и 6, односно 2 од 6 исходи: 2/6 ≈ 0,33.", { tolerance: 0.01 }),
      num("Во кутија има 3 црвени и 7 сини топчиња. Колку проценти е веројатноста да се извлече црвено?", 30, "3 од 10 топчиња, односно 30%.", { unit: "%" }),
      mc("Два настани се независни ако ...", ["појавата на едниот не влијае на веројатноста на другиот", "не можат да се случат истовремено", "едниот го опфаќа другиот", "имаат иста веројатност"], 0, "Тоа е определбата за независни настани."),
      tf("Збирот на веројатностите на сите можни исходи е 1.", true, "Еден од исходите сигурно ќе се случи."),
      num("Од шпил со 52 карти се влече една. Колкава е веројатноста да е ас? Напишете децимален број со две децимали.", "0.08", "4 аса од 52 карти: 4/52 ≈ 0,08.", { tolerance: 0.01 }),
    ],
  },
  {
    key: "procenti",
    title: "Проценти и пропорции",
    topic: "Проценти",
    year: 2,
    difficulty: 0.02,
    keywords: ["процент", "пропорц", "размер"],
    summary:
      "Процентот е дел од сто. P% од бројот N е N · P / 100. Пропорцијата a : b = c : d важи кога a · d = b · c. Намалување па зголемување за ист процент не го враќа почетниот износ.",
    questions: [
      num("Колку е 15% од 240?", 36, "240 · 15 / 100 = 36.", { timer: 30 }),
      mc("Цената на еден производ од 800 денари е намалена за 25%. Новата цена е ...", ["600 денари", "650 денари", "200 денари", "775 денари"], 0, "25% од 800 е 200, па 800 − 200 = 600."),
      tf("Ако 3 тетратки чинат 90 денари, 5 тетратки чинат 150 денари.", true, "Една тетратка чини 30 денари, па 5 чинат 150 денари."),
      num("Колку проценти е бројот 18 од бројот 72?", 25, "18 / 72 = 1/4 = 25%.", { unit: "%" }),
      mc("Пропорцијата x : 6 = 10 : 4 дава x = ...", ["12", "15", "24", "2,4"], 1, "x · 4 = 6 · 10, па x = 15."),
      num("Цена од 500 денари се зголемува за 10%, па се намалува за 10%. Колку е конечната цена?", 495, "500 · 1,1 = 550, а 550 · 0,9 = 495.", { unit: "ден." }),
    ],
  },
  {
    key: "statistika",
    title: "Статистика: средна вредност и медијана",
    topic: "Статистика",
    year: 3,
    difficulty: 0.03,
    keywords: ["статистик", "средна вредност", "медијан", "мода", "девијац"],
    summary:
      "Средната вредност е збирот на податоците поделен со нивниот број. Медијаната е средишната вредност кога податоците се подредени, а модата е вредноста што се јавува најчесто. Стандардната девијација покажува колку се расеани податоците.",
    questions: [
      num("Колку е средната вредност на броевите 4, 8, 6, 10 и 12?", 8, "(4 + 8 + 6 + 10 + 12) / 5 = 40 / 5 = 8."),
      mc("Колку е медијаната на броевите 3, 7, 9, 12 и 15?", ["7", "9", "12", "9,2"], 1, "Броевите се подредени, а средниот е 9."),
      tf("Модата е вредноста што се јавува најчесто.", true, "Така се определува модата."),
      num("Колку е распонот (разликата меѓу најголемиот и најмалиот) на броевите 5, 9, 14 и 22?", 17, "22 − 5 = 17."),
      mc("Стандардната девијација мери ...", ["колку податоците се расеани околу средната вредност", "најчестата вредност", "средишната вредност", "збирот на сите отстапувања"], 0, "Колку е поголема, толку податоците се позабележливо расеани."),
    ],
  },
  {
    key: "planimetrija",
    title: "Планиметрија: триаголник и круг",
    topic: "Планиметрија",
    year: 2,
    difficulty: 0.02,
    keywords: ["триаголник", "круг", "плоштин", "питагор", "планиметр", "геометриј"],
    summary:
      "Во правоаголен триаголник важи Питагоровата теорема a² + b² = c². Збирот на аглите во триаголник е 180°. Плоштината на круг е πr², а на паралелограм основата помножена со висината.",
    questions: [
      num("Колку е хипотенузата на правоаголен триаголник со катети 6 и 8?", 10, "6² + 8² = 36 + 64 = 100, па c = 10.", { timer: 30, picture: RIGHT_TRIANGLE }),
      tf("Збирот на внатрешните агли во секој триаголник е 180°.", true, "Тоа важи за секој триаголник."),
      mc("Плоштината на круг со радиус r е ...", ["2πr", "πr²", "πr", "2πr²"], 1, "P = πr²."),
      num("Колку cm² е плоштината на паралелограм со основа 7 cm и висина 5 cm?", 35, "P = a · h = 7 · 5 = 35.", { unit: "cm²" }),
      mc("Колку степени има секој внатрешен агол на правилен шестаголник?", ["108°", "120°", "135°", "144°"], 1, "Збирот на аглите е 6 · 180° − 360° = 720°, па секој е 720° / 6 = 120°."),
    ],
  },
  {
    key: "dvizenje",
    title: "Праволиниско движење и брзина",
    topic: "Движење",
    year: 1,
    difficulty: 0.03,
    keywords: ["кинематик", "праволиниск", "рамномерно движење", "забрзување"],
    summary:
      "Брзината покажува колкав пат телото поминува за единица време: v = s / t, и се мери во метри во секунда (m/s). При рамномерно праволиниско движење брзината е постојана. Забрзувањето е промена на брзината во единица време: a = Δv / Δt.",
    questions: [
      num("Возило се движи со постојана брзина од 20 m/s. Колку метри поминува за 15 секунди?", 300, "s = v · t = 20 · 15 = 300 m.", { unit: "m", timer: 30 }),
      mc("Која е основната единица за брзина во SI системот?", ["km/h", "m/s", "m/s²", "N"], 1, "Брзината се мери во метри во секунда, m/s."),
      tf("Ако телото мирува, неговата брзина е нула.", true, "Мирувањето значи дека положбата не се менува, па брзината е 0."),
      num("Колку m/s е брзина од 72 km/h?", 20, "72 km/h = 72 · 1000 m / 3600 s = 20 m/s.", { unit: "m/s", timer: 30 }),
      mc("Што покажува наклонот на графикот на патот во зависност од времето при рамномерно движење?", ["Забрзувањето", "Брзината", "Масата", "Силата"], 1, "Наклонот е s / t, а тоа е брзината."),
      num("Колку е забрзувањето на тело што за 5 секунди ја зголемува брзината од 0 на 20 m/s?", 4, "a = Δv / Δt = 20 / 5 = 4 m/s².", { unit: "m/s²", timer: 30 }),
    ],
  },
  {
    key: "njutn",
    title: "Њутнови закони",
    topic: "Њутнови закони",
    year: 2,
    difficulty: 0.05,
    keywords: ["њутн", "инерциј", "динамик"],
    summary:
      "Првиот закон: телото мирува или се движи рамномерно право додека сила не го принуди да го промени тоа (инерција). Вториот закон: F = m · a. Третиот закон: на секоја акција одговара реакција со иста јачина и спротивна насока, а двете дејствуваат врз различни тела.",
    questions: [
      mc("Првиот Њутнов закон е закон за ...", ["инерцијата", "гравитацијата", "акцијата и реакцијата", "енергијата"], 0, "Телото го задржува своето движење или мирување додека сила не го промени тоа."),
      num("Колку нутни е силата што на тело од 5 kg му дава забрзување од 3 m/s²?", 15, "F = m · a = 5 · 3 = 15 N.", { unit: "N", timer: 30 }),
      tf("Силите на акцијата и на реакцијата дејствуваат врз исто тело.", false, "Дејствуваат врз две различни тела, па не се поништуваат."),
      mc("Што се случува со забрзувањето кога масата се зголемува, а силата останува иста?", ["Се зголемува", "Се намалува", "Останува исто", "Станува нула"], 1, "a = F / m: поголема маса, помало забрзување."),
      num("Колку нутни е тежината на тело од 2 kg? Земете g = 10 m/s².", 20, "G = m · g = 2 · 10 = 20 N.", { unit: "N", timer: 30 }),
      tf("Масата и тежината на телото се иста величина.", false, "Масата е во килограми и не зависи од местото, а тежината е сила и се мери во нутни."),
    ],
  },
];

export const bankLesson = (key: string): BankLesson => {
  const lesson = BANK.find((b) => b.key === key);
  if (!lesson) throw new Error(`No demo lesson "${key}"`);
  return lesson;
};

/**
 * General maths questions for the refinements. A refinement that swaps a question for an easier or a harder one takes
 * it from here, and "More questions" appends from here.
 */
export const SPARES: { level: 1 | 2 | 3; question: Template }[] = [
  { level: 1, question: tf("Бројот 0 е парен број.", true, "Парни се броевите што се деливи со 2, а 0 = 2 · 0.") },
  { level: 1, question: num("Колку е 7 · 8?", 56, "7 · 8 = 56.", { timer: 15 }) },
  { level: 2, question: mc("Колку е 2⁵?", ["10", "16", "32", "25"], 2, "2 · 2 · 2 · 2 · 2 = 32.") },
  { level: 2, question: tf("Збирот на два непарни броја е парен број.", true, "На пример 3 + 5 = 8; непарните се од облик 2k + 1, па збирот е 2(k + m + 1).") },
  { level: 3, question: num("Колку е најмалиот заеднички содржател на 12 и 18?", 36, "12 = 2² · 3, 18 = 2 · 3², па НЗС = 2² · 3² = 36.") },
  { level: 3, question: mc("Со колку нули завршува бројот 20! (20 факториел)?", ["2", "3", "4", "5"], 2, "Нулите доаѓаат од множителите 5: ⌊20/5⌋ = 4.") },
];

/** A template made into a question of a lesson. The timer is the kind's default unless the template names one (BR-TIME-01). */
export function toQuestion(template: Template, id: string, order: number, topic: string): Question {
  const base = {
    id,
    order,
    prompt: template.prompt,
    media: template.picture ? { id: `${id}-img`, url: template.picture.url, alt: template.picture.alt } : null,
    explanation: template.explanation,
    timer_seconds: template.timer ?? defaultTimerSeconds(template.kind),
    topic,
  };
  switch (template.kind) {
    case "multiple_choice":
      return { ...base, kind: "multiple_choice", options: [...template.options], correct: template.correct };
    case "true_false":
      return { ...base, kind: "true_false", correct: template.correct };
    case "numeric":
      return {
        ...base,
        kind: "numeric",
        correct: template.correct,
        tolerance: template.tolerance,
        unit: template.unit,
        allow_negative: template.allow_negative,
      };
  }
}

/** The questions of a bank lesson, with ids made from `idPrefix`. */
export const bankQuestions = (lesson: BankLesson, idPrefix: string): Question[] =>
  lesson.questions.map((t, i) => toQuestion(t, `${idPrefix}-q${i + 1}`, i, lesson.topic));

const retimed = (q: Question, seconds: number): Question => ({ ...q, timer_seconds: Math.min(120, Math.max(10, seconds)) });

/**
 * What the four refinements do to a draft's questions (FR-LES-08). Questions are written easiest first, so "Easier" swaps
 * the last one for an easy spare and "Harder" the first for a hard spare; when no spare is left they only move the timers.
 * `idPrefix` names any question that is added.
 */
export function refineQuestions(questions: Question[], refinement: Refinement, idPrefix: string): Question[] {
  const used = new Set(questions.map((q) => q.prompt));
  let added = 0;
  const spare = (level: 1 | 2 | 3, order: number, topic: string) => {
    const found = SPARES.find((s) => s.level === level && !used.has(s.question.prompt));
    if (!found) return null;
    used.add(found.question.prompt);
    return toQuestion(found.question, `${idPrefix}-n${++added}`, order, topic);
  };
  const renumber = (list: Question[]) => list.map((q, order) => ({ ...q, order }));

  switch (refinement) {
    case "shorter_timers":
      return questions.map((q) => retimed(q, Math.round((q.timer_seconds * 0.75) / 5) * 5));
    case "more_questions": {
      const out = [...questions];
      for (const level of [1, 2] as const) {
        const next = out.length < QUESTIONS_MAX ? spare(level, out.length, questions[0]?.topic ?? "") : null;
        if (next) out.push(next);
      }
      return renumber(out);
    }
    case "easier": {
      const last = questions.length - 1;
      const swap = spare(1, last, questions[last].topic);
      return renumber(questions.map((q, i) => (i === last && swap ? swap : retimed(q, q.timer_seconds + 5))));
    }
    case "harder": {
      const swap = spare(3, 0, questions[0].topic);
      return renumber(questions.map((q, i) => (i === 0 && swap ? swap : retimed(q, q.timer_seconds - 5))));
    }
  }
}
