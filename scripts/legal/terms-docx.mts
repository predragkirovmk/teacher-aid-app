/*
  Makes the Word document for the lawyer from the one copy of the terms (content/site-v2/terms.ts), so the
  document and the website can never say different things. Run from the repo root:

    node --experimental-strip-types scripts/legal/terms-docx.mts <out.docx>

  The document has four parts: what the lawyer is asked to do, the facts the terms rest on, the points of law
  that were checked and where (and what was not), the questions, and then the terms in Macedonian and English.
*/
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
// Node runs this file by stripping its types, and needs the real file name; the app's tsconfig does not allow a .ts ending.
// @ts-expect-error TS5097: the extension is required here.
import { terms, termsUpdated, termsVersion } from "../../content/site-v2/terms.ts";

const require = createRequire(import.meta.url);
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat, PageBreak, Footer, PageNumber, ExternalHyperlink } =
  require("docx");

const out = process.argv[2];
if (!out) throw new Error("Usage: terms-docx.mts <out.docx>");

const FONT = "Arial";
const p = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) =>
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] });
const bullet = (text: string) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 60 }, children: [new TextRun(text)] });
const numbered = (text: string) =>
  new Paragraph({ numbering: { reference: "questions", level: 0 }, spacing: { after: 100 }, children: [new TextRun(text)] });
const h1 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
const h2 = (text: string) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
const link = (label: string, url: string) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun(`${label}: `), new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, style: "Hyperlink" })] })],
  });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });

/** The terms of one language, clause by clause, as the website shows them. */
function termsPart(lang: "mk" | "en") {
  const d = terms[lang];
  const parts: unknown[] = [h1(d.title), p(`${d.versionLabel} ${termsVersion}. ${d.updatedLabel}: ${termsUpdated}.`, { italics: true }), h2(d.summaryTitle)];
  for (const line of d.summary) parts.push(bullet(line));
  for (const s of d.sections) {
    parts.push(h2(s.title));
    for (const b of s.blocks) {
      if ("p" in b) parts.push(p(b.p));
      else for (const li of b.ul) parts.push(bullet(li));
    }
  }
  return parts;
}

const brief = [
  new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun("TeacherAid: Услови за користење")] }),
  p(`Нацрт ${termsVersion} за правен преглед, ${termsUpdated}`, { bold: true }),
  p(
    "Овој документ е подготвен за адвокатот на TeacherAid. Во него се: што се бара од прегледот, фактите врз кои се напишани условите, правните точки што се проверени и од каде, прашањата за адвокатот, и целиот текст на условите на македонски (обврзувачки) и на англиски (превод).",
  ),
  p(
    "Текстот не е правен совет. Напишан е како нацрт, без измислени членови на закони: каде што бројот на член не е потврден од официјален текст, условите го наведуваат само законот или правилото, без број.",
  ),

  h1("1. Што се бара од прегледот"),
  bullet("Да се потврди или поправи секоја одредба според правото на Република Северна Македонија."),
  bullet("Да се одговорат прашањата во дел 4, особено прашањето 1 за личната одговорност на операторот."),
  bullet("Да се каже кои податоци за операторот мора да бидат јавни (страницата сега наведува само „физичко лице од Битола“ и е-пошта)."),
  bullet("Да се каже кои документи уште се потребни пред првото училиште (Политика за приватност, Договор за обработка на лични податоци)."),

  h1("2. Факти врз кои се напишани условите"),
  p("Потврдени од сопственикот на 21.11.2026:", { bold: true }),
  bullet("Операторот е физичко лице. Нема регистрирано трговско друштво и не се планира во блиска иднина."),
  bullet("Корисник е училиштето (средно, основно, факултет). Училиштето ги прифаќа условите преку овластено лице; наставниците и учениците ја користат услугата во рамките на договорот на училиштето."),
  bullet("Училиштето е контролор на личните податоци; TeacherAid е обработувач."),
  bullet("Услугата е бесплатна. Нема плаќања."),
  bullet("Се нуди само во Република Северна Македонија. Надлежен суд: Битола."),
  p("Што прави апликацијата (од самиот код):", { bold: true }),
  bullet("Наставничка апликација (компјутер и проектор): подготвување час од текст, тема или прикачена датотека (PDF, Word) со вештачка интелигенција (Claude од Anthropic, преку сервер), час во живо, резултати."),
  bullet("Ученичка апликација (телефон, во прелистувач): приклучување со QR-код (камерата го чита само кодот, слики не се зачувуваат), одговарање, вежбање, прашања до наставникот со името на ученикот, известувања (push) ако ученикот ги вклучи."),
  bullet("Додека е отворено прашање, апликацијата бележи кога ученикот излегол од квизот подолго од миг (време и прашање). Не знае што прави ученикот надвор. Наставникот ја гледа белешката; нема автоматска казна."),
  bullet("Најавување само со Google или Microsoft; лозинки не се чуваат. Податоците се чуваат во ЕУ. Во барањата до вештачката интелигенција не се праќаат имиња, е-пошта ни списоци на ученици."),
  bullet("Рокови на чување (од Известувањето за приватност на учениците): податоците од часовите до крајот на наредната учебна година, потоа бришење или збирни податоци без имиња; за ученик што заминал, бришење во рок од 30 дена од барањето на училиштето."),
  bullet("Серверот (backend) уште не е изграден; апликациите денес работат како демо со измислени податоци. Нема вистински податоци за ученици."),

  h1("3. Проверени правни точки"),
  p("Проверено во објавени текстови на законите (пребарување, 21.11.2026). Адвокатот да ги потврди во важечкиот пречистен текст.", { italics: true }),
  bullet("Закон за заштита на личните податоци (Сл. весник 42/2020), член 12: обработката на лични податоци на дете во врска со услуги на информатичкото општество врз основа на согласност е законита ако детето има најмалку 14 години; под 14 години, само со согласност од законскиот застапник. (Условите, точка 13.2.)"),
  bullet("Истиот закон, член 37: контролорот ја известува Агенцијата за повреда на безбедноста без одложување, а најдоцна 72 часа откако дознал; при доцнење се наведуваат причините. (Условите, точка 10.3: обработувачот го известува училиштето најдоцна за 48 часа.)"),
  bullet("Закон за облигационите односи (Сл. весник 18/2001): одговорноста за намера и крајна непретпазливост не може однапред да се исклучи со договор; судот може да поништи исклучување и за обична непретпазливост ако произлегува од монополска положба или нерамноправен однос. Бројот на членот не е потврден. (Условите, точка 18.3.)"),
  bullet("Закон за електронска трговија, член 7: давателот на услуги на информатичкото општество мора лесно, директно и постојано да ги прави достапни основните информации за себе, меѓу нив името односно фирмата и седиштето. Целиот список (е-пошта, регистрација, даночен број) не е потврден. (Условите, точка 1.1 и 24.)"),
  p("Не е проверено и мора да го потврди адвокатот:", { bold: true }),
  bullet("Членот за договорот помеѓу контролор и обработувач во Законот за заштита на личните податоци и дали мора да е во писмена форма."),
  bullet("Пренос на податоци: хостингот и давателот на вештачка интелигенција се компании од САД, иако податоците се во ЕУ. Дали е потребно одобрение од Агенцијата или стандардни клаузули."),
  bullet("Глобите во Законот за заштита на личните податоци и дали важат и за физичко лице како обработувач."),
  bullet("Дали медијацијата (точка 22.2) треба да се упати на одреден закон."),
  p("Извори:", { bold: true }),
  link("Закон за заштита на личните податоци, Сл. весник 42/2020", "https://aso.mk/wp-content/uploads/2020/02/zakon_za_zastita_na_licnite_podatoci.pdf"),
  link("Пречистен текст, мај 2025", "https://gazibaba.gov.mk/wp-content/uploads/2025/05/zakon-za-zastita-na-lichnite-podatoci-_-konsolidirana-verzija-maj-2025.pdf"),
  link("Агенција за заштита на личните податоци: известување за повреда", "https://azlp.mk/en/controllers/officers/new-obligation-notification-of-breach-of-personal-data-security/"),
  link("Закон за облигационите односи, пречистен текст, мај 2025", "https://gazibaba.gov.mk/wp-content/uploads/2025/05/zakon-za-obligacionite-odnosi-konsolidirana-verzija-maj-2025.pdf"),
  link("Закон за електронска трговија", "https://dejure.mk/akti/akt/zakon-za-elektronska-trgovija"),
  link("Дирекција за заштита на потрошувачите: известување за е-трговија", "https://www.dpi.gov.mk/index.php/mk/odnosi-so-javnost/vesti/345-izvestuvanje-do-potroshuvachite-za-e-trgovija"),

  h1("4. Прашања за адвокатот"),
  numbered(
    "Лична одговорност. Сопственикот не сака лично да одговара, а нема да основа друштво наскоро. Без правно лице, физичкото лице одговара со целиот свој имот, а условите не можат да ја исклучат одговорноста за намера, крајна непретпазливост и штета по живот и здравје. Кои законски начини постојат да се намали личната одговорност без друштво (на пример осигурување од одговорност, работа преку постојно правно лице или здружение, не обработување вистински податоци до основање друштво)? Дали е разумно да се почне со вистинско училиште пред да се основа ДООЕЛ?",
  ),
  numbered("Дали физичко лице може да биде обработувач на лични податоци за јавно училиште, и дали училиштата (и Министерството) ќе прифатат договор со физичко лице? Дали е потребна некаква регистрација за бесплатна услуга?"),
  numbered("Кое лице во училиштето може да ги прифати условите и Договорот за обработка (директор, училишен одбор, основачот, т.е. општината)? Дали важат правилата за јавни набавки за бесплатна услуга?"),
  numbered("Која е правната основа на училиштето за обработката: законска задача според законите за образование или согласност? Кога е потребна согласност од родител (деца под 14 години, член 12)?"),
  numbered("Белешката за излегување од квизот (точка 7.3): дали е сразмерно следење на малолетник? Дали е потребна проценка на влијанието врз заштитата на личните податоци пред почеток?"),
  numbered("Вештачка интелигенција (точка 8): дали формулациите се доволни? Дали треба да се спомене Актот на ЕУ за вештачка интелигенција, иако денес не важи во Северна Македонија?"),
  numbered("Безбедносен инцидент (точка 10.3): дали рокот од 48 часа кон училиштето е соодветен со оглед на 72-те часа од член 37?"),
  numbered("Пренос на договорот на идно друштво (точка 23.3): дали е важечки во оваа форма или секое училиште мора повторно да потпише?"),
  numbered("Ограничување на одговорноста (точка 18): дали е спроведливо кон јавно училиште кога услугата е бесплатна? Дали да се додаде паричен максимум и колкав?"),
  numbered("Кои податоци за операторот мора да бидат јавни на веб-страницата (име, адреса, е-пошта) според Законот за електронска трговија, и дали е доволно име, град и е-пошта, со целосна адреса само во договорот со училиштето?"),
  numbered("Наставникот ги прифаќа условите со најавувањето (точка 3.2; на екранот за најава пишува „Со најавувањето ги прифаќате Условите за користење“). Дали тоа е доволно или е потребно поле за штиклирање?"),

  h1("5. Што треба да се пополни"),
  bullet("Точка 1.1 и 24: по одлука на сопственикот, страницата сега не наведува име и адреса на операторот, само „физичко лице од Битола“ и е-пошта. Да се потврди дали е доволно според Законот за електронска трговија (прашање 10) и, ако не е, кои податоци да се додадат."),
  bullet("Точка 8.1 и 11.4: давателот на вештачка интелигенција и регионот, во Договорот за обработка."),
  bullet("Датумот од кој важат условите, кога ќе се објават."),

  h1("6. Документи што уште недостасуваат"),
  bullet("Договор за обработка на лични податоци помеѓу училиштето и TeacherAid (условите се потпираат на него, точка 11.3)."),
  bullet("Политика за приватност за наставниците и посетителите на веб-страницата. За учениците постои Известување за приватност во апликацијата (teacheraid.education/app/privacy)."),

  pageBreak(),
  ...termsPart("mk"),
  pageBreak(),
  p("Annex: English translation. If the two differ, the Macedonian text prevails.", { italics: true }),
  ...termsPart("en"),
];

const heading = (size: number) => ({ run: { font: FONT, size, bold: true }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true } });

const doc = new Document({
  creator: "TeacherAid",
  title: "TeacherAid: Услови за користење, нацрт за правен преглед",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } }, title: { run: { font: FONT, size: 40, bold: true }, paragraph: { spacing: { before: 0, after: 200 } } }, heading1: heading(30), heading2: heading(24) },
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "questions", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
    ],
  },
  sections: [
    {
      properties: { page: { margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: "TeacherAid, нацрт за правен преглед. Страница ", size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
            }),
          ],
        }),
      },
      children: brief,
    },
  ],
});

writeFileSync(out, await Packer.toBuffer(doc));
console.log(`Wrote ${out}`);
