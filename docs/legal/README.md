# Legal documents

| What | Where | Status |
|---|---|---|
| Terms of Service, Macedonian (binding) and English | `content/site-v2/terms.ts`, shown at `/uslovi` and `/en/terms` | Version 1.0, waiting for the lawyer |
| The document for the lawyer | `docs/legal/TeacherAid-uslovi-za-advokat.docx` | Made from `terms.ts` |
| Privacy notice for students | `lib/app/privacy-copy.ts`, at `/app/privacy` | Live in the student app |
| Privacy policy for teachers and website visitors | not written | To do |
| Data processing agreement, school and TeacherAid | not written; the terms rely on it (point 11.3) | To do before the first real school |

## One copy of the terms

`content/site-v2/terms.ts` is the only copy. The website renders it, and the Word document is made from it, so a
change is made there and nowhere else. After a change to the words, raise `termsVersion` and `termsUpdated`, and make
the document again:

    node --experimental-strip-types scripts/legal/terms-docx.mts docs/legal/TeacherAid-uslovi-za-advokat.docx

`tests/unit/terms.test.ts` keeps the two languages the same clause for clause and every "see point N" pointing at a
point that exists.

## Where the terms are linked

- The website footer, on every page.
- The teacher app's sign-in screen: "By signing in, you accept the Terms of Service" (point 3.2).
- The student app's own short rules (`/app/terms`), in the section "The full terms".

## Facts the terms rest on (the owner, 2026-11-21)

Run by a natural person, with no company planned soon; schools are the customer and the controller, TeacherAid the
processor; free; North Macedonia only; court in Bitola. By the owner's choice the page names no person or street
address yet, only "a natural person from Bitola" and the email (`operatorCity` in `terms.ts`). The e-commerce law asks
for the provider's name and seat to be published: the lawyer's document asks what must be added (question 10).

## Points of law

Checked (21 November 2026) against published texts, and cited in the Word document with sources: Law on Personal
Data Protection (Official Gazette 42/2020), article 12 (age 14 for a child's consent) and article 37 (72 hours to
notify the Agency); Law on Obligations (no exclusion in advance of liability for intent or gross negligence; article
number not confirmed); Law on Electronic Commerce, article 7 (name and seat of the provider). Everything else is a
question for the lawyer, listed in the document. The terms name laws without article numbers on purpose.

When the Service changes (a feature, payments, a provider, a market), check the terms in the same change.
