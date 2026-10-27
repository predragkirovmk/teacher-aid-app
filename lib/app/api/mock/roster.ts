/**
 * Kept apart from the rest of the mock's fixtures so the demo's roster email never travels with them into a live build.
 */

/**
 * The roster the mock signs in: the school emails it knows. Every one of them is the demo's student,
 * because the mock plays one student. Any other email is, to the mock, on no list (EC-AUTH-02).
 */
export const MOCK_ROSTER: readonly string[] = ["marko.trajkovski@student.gnaumov.edu.mk"];

/** The one-time code the mock "emails", shown in the welcome screen's demo hint instead of a mailbox. */
export const MOCK_CODE = "123456";
