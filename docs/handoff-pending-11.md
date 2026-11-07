# Handoff, step 11: class results

What the Класови list and the results page of a class need from the API that the spec (11.5 and 7.15) does not state exactly. All of it is an assumption the app already makes; none of it adds an endpoint.

## `GET /courses/{id}/dashboard`

1. `topics[].by_student[]` is `{ student_id, right, total }`, and its totals add up to the topic's `right` and `total`. The page shows only the class totals; the per-student shape is kept for later. A question fired before a student joined is left out of that student's `total` and of the class `total` (BR-TOP-02), so the class total is the sum of the students' totals.
2. `sessions[].tally` is `{ present, late, absent, present_no_device, total }` over the students enrolled for that lesson, the same shape as `POST /sessions/{id}/end`. The page reads "took part" as `present + late`.
3. `sessions[].participation` and `right_rate` are 0 to 1. A session with `question_count` 0 has both 0; the page then says that no question was answered and shows no share.
4. `students[]` is the course's roster today and the page lists exactly it. A student with no attendance row at all (never enrolled for a lesson held) is shown as "not enrolled in any lesson held".
5. `attendance[]` has no rows for a lesson before the day a student joined the class (FR-DASH-04), and the page counts a student's lessons from those rows only.
6. `focus_flags[]` has one entry per `lost` event that raised a flag. `away_seconds` is null while `back_at` is null. The page counts entries per student and adds the seconds; it never shows a reason, since a `FocusEvent` has none (BR-FOC-07, OPEN-35).
7. `anon_questions[]` carries `sender: { id, name }`, `created_at`, `answered_at` and `session_id`; the page sorts them newest first itself.
8. `practice[]` has one entry per session with a set: `students` is everyone enrolled for the lesson when the set was sent, `completed` those who finished, `average_score` the mean count of right answers among those who finished (null if none), and `practice_set.question_count`. The page also needs `practice_set.session_id`.
9. `sessions[]` is newest first by `started_at`; a lesson ended after the call is not in it until the next read.

## Reads the page makes besides the dashboard

- `GET /sessions/{id}/practice-set` (already proposed for step 10) is read when the teacher opens "Кој ги реши" under a set, so the list of who did it is not part of the dashboard. If the dashboard should carry it, the page would use it instead and drop that call.
- `GET /sessions/{id}/review` is what a history row opens (the end page of step 10); it must keep answering for a session ended weeks ago, with `attendance` and `most_missed`.

## `PATCH /courses/{id}`

- The page's only setting is `{ speed_bonus_on }` (BR-PTS-04). The answer is the course item; the page redraws from it and from a fresh dashboard.

## `GET /teacher/courses`

- A teacher with no course gets `[]` and 200, not an error (OPEN-02: the school admin assigns courses). The page says so plainly.
- A course id that is not the teacher's is `not_found` (404) on the dashboard and on `PATCH`, never `forbidden`, so the page shows the not-found page.
