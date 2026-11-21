# Legal documents

| What | Where | Status |
|---|---|---|
| Terms of Service, Macedonian (binding) and English | `content/site-v2/terms.ts`, at `/uslovi` and `/en/terms` | Version 1.0, live, waiting for the lawyer |
| Privacy Policy for teachers, school staff and website visitors | `content/site-v2/privacy.ts`, at `/privatnost` and `/en/privacy` | Version 1.0, waiting for the lawyer |
| Privacy notice for students | `lib/app/privacy-copy.ts`, at `/app/privacy` | Live in the student app |
| Data processing agreement, school and TeacherAid (draft, Macedonian) | `scripts/legal/dpa.mts`, in the lawyer's document only | Draft; signed with each school before real students |
| The document for the lawyer | `docs/legal/TeacherAid-uslovi-za-advokat.docx` | Made from the three files above |

## One copy of each document

Each document has one copy (the table above). The website renders the terms and the policy, and the Word document is
made from all three, so a change is made there and nowhere else. After a change to the words, raise that document's
version and date (`termsVersion`, `privacyVersion`, ...), and make the document again:

    node --experimental-strip-types --import ./scripts/legal/resolve-ts.mjs scripts/legal/terms-docx.mts docs/legal/TeacherAid-uslovi-za-advokat.docx

`tests/unit/terms.test.ts` keeps the two languages of the terms and of the policy the same clause for clause, no blank
in brackets, the team named, and every "see point N" pointing at a point that exists.

## Where they are linked

- The website footer, on every page: the terms and the policy.
- The teacher app's sign-in screen: "By signing in, you accept the Terms of Service" (point 3.2) and the policy.
- The early-access form, under its button: the policy (sign-up is consent, point 8 of the policy).
- The student app's own short rules (`/app/terms`), in the section "The full terms".

## Facts the terms rest on (the owner, 2026-11-21)

Run by a team of five natural persons from Bitola, named in the terms (`team` in `terms.ts`), with no company planned soon; schools are the customer and the controller, TeacherAid the
processor; free; North Macedonia only; court in Bitola. The page gives the team's names, Bitola and the email, but no
street address. The e-commerce law asks for the provider's name and seat to be published: the lawyer's document asks
whether that is enough (question 10) and how five people without a company share the agreement (question 2).

## Points of law

Checked (21 November 2026) against published texts, and cited in the Word document with sources: Law on Personal
Data Protection (Official Gazette 42/2020), article 12 (age 14 for a child's consent) and article 37 (72 hours to
notify the Agency); Law on Obligations (no exclusion in advance of liability for intent or gross negligence; article
number not confirmed); Law on Electronic Commerce, article 7 (name and seat of the provider). Everything else is a
question for the lawyer, listed in the document. The terms name laws without article numbers on purpose.

When the Service changes (a feature, payments, a provider, a market), check the terms in the same change.
