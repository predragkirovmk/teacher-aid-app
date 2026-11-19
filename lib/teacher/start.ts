import { isApiError } from "./api/errors";

/**
 * What "Започни час" tells the teacher when it does not go straight to the console. A refusal because a lesson is already open
 * (`session_open`, EC-SES-02) is not an error to show but news to give, with the way back to that lesson; any other failure is said as it is.
 */
export type StartNotice = "running" | "failed";

export const startNotice = (error: unknown): StartNotice => (isApiError(error) && error.code === "session_open" ? "running" : "failed");
