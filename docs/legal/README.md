# Legal documents: status and notes for the lawyer

| File | What | Status |
|---|---|---|
| `uslovi-za-koristenje.md` | Terms of Service, Macedonian (binding text) | Draft 1.0, for legal review |
| `terms-of-service.md` | The same in English (translation) | Draft 1.0, for legal review |
| Privacy Policy | Not written yet. The student app's notice in `lib/app/privacy-copy.ts` is the starting point. | To do |
| Data Processing Agreement (school and TeacherAid) | Not written yet. The terms rely on it (point 11.3). | To do |

The terms cover the website, the Teacher App (`/teacher`, laptop and projector), the Student App (`/app`, phone) and the
public Demo in one document, because one agreement with the school covers all of them.

## Facts the draft is built on (confirmed by the owner, 2026-11-21)

- The operator is a natural person, not a company, for now. No company is planned in the near future.
- Schools are the customer: a school accepts the terms through its authorised representative. Teachers and students use
  the Service under the school's agreement. The school is the controller; TeacherAid is the processor.
- The Service is free. There are no payments.
- It is offered in North Macedonia only. Macedonian law applies, and the Macedonian text prevails.
- Taken from the app itself: Google or Microsoft sign-in, QR join, the record of leaving the quiz, questions to the
  teacher, push notifications, data in the EU, nothing about students sent to the AI, the retention rules (BR-RET).

## To fill in before publishing

Operator's full name and address, the city of the competent court, the liability cap amount (18.2), the AI provider and
region (8.1, OPEN-17), the security contact address (10.4, the mailbox must exist), the link to the Privacy Policy, the dates.

## Questions for the lawyer

1. **Operating as a natural person.** The operator is personally liable with all their property; the cap in 18.2 helps
   only as far as the Law on Obligations allows (no exclusion for intent or gross negligence, or for harm to life or health).
   Can a natural person act as a processor for public schools, and will schools (and the Ministry) accept a contract with
   one? Is any registration needed to offer a free service? Would a company (ДООЕЛ) be advisable before the first real school?
2. **Who signs for the school.** Does a head teacher have the power to accept these terms and a processing agreement,
   or does it need the school board or the founder (the municipality)? Do any public procurement rules apply to a free service?
3. **Legal basis and parents.** Is the school's basis its legal task under the education laws, or consent? Where is
   parental consent required (children under 14 under the Law on Personal Data Protection)? Point 12 puts this on the school.
4. **The record of leaving the quiz (7.3).** Is it proportionate monitoring of a minor? Is a data protection impact
   assessment needed before launch (systematic monitoring, children, new technology)?
5. **AI.** Is the wording in 8 enough on accuracy and responsibility? Should it say anything about the EU AI Act, which does
   not apply in North Macedonia today but may be adopted (education is a high-risk area when AI evaluates students; this
   service does not)?
6. **Breach notice (10.3).** 48 hours to the school, so the school can meet the 72 hours to the Agency. Is that right?
7. **Transfer to a future company (23.3).** Is it valid in this form, or does each school have to sign again?
8. **Liability cap (18.2).** Is a cap on a free service enforceable against a public school, and what amount is sensible?
9. **Data transfers.** Hosting and the AI provider are US companies even when the data stays in the EU. Is this a transfer
   that needs Agency approval or standard clauses under Macedonian law?

## Not covered on purpose

- Consumer law (the 14-day right of withdrawal, prices with VAT): there is no sale, and the customer is a school, not a consumer.
- Students signing up on their own, outside a school: the Service does not allow it (13.1).
- Markets outside North Macedonia: add GDPR and EU consumer law before offering it there.

When the Service changes (a new feature, payments, a new provider), check these terms in the same change.
