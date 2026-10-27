/**
 * Kept apart from the rest of the mock's fixtures so the demo's roster email never travels with them into a live build.
 */

/**
 * The roster the mock signs in: the school accounts it knows. Every one of them is the demo's student, because the mock
 * plays one student. Any other account is, to the mock, on no list (EC-AUTH-02, EC-AUTH-09).
 */
export const MOCK_ROSTER: readonly string[] = ["marko.trajkovski@student.gnaumov.edu.mk"];

/** The demo's stand-in for a student who signs in with a personal account instead of the school's (EC-AUTH-09): on no roster. */
export const MOCK_PERSONAL_ACCOUNT = "marko.trajkovski@example.com";
