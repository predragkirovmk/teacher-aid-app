/**
 * The seam for error reporting. Nothing leaves the phone unless NEXT_PUBLIC_SENTRY_DSN (or
 * NEXT_PUBLIC_ERROR_REPORT_DSN) is set, and no SDK ships yet: when the service is picked, its
 * init registers a sink with `setReportSink` and nothing else in the app changes. Until then a
 * set DSN only writes the report to the console, which is enough to see the wiring work.
 *
 * The context is typed to codes and names on purpose. Never put a name, an email, a student id,
 * a photo or anything a student typed in it.
 */
export type ReportContext = {
  /** The place that caught it: "app-error", "query". */
  where: string;
  /** An ApiError code, when there is one. */
  code?: string;
  /** The HTTP status, when the error came from a response. */
  status?: number | null;
  /** A query key such as `results:math`; the keys carry no personal data. */
  key?: string;
  /** Next's digest for a render error, which matches it to the server log. */
  digest?: string;
};

export type ReportSink = (error: unknown, context: ReportContext) => void;

const logToConsole: ReportSink = (error, context) => {
  console.error("[report]", context, error);
};

let sink: ReportSink = logToConsole;

/** Where reports go once the DSN is set: the reporting service's capture call. */
export function setReportSink(next: ReportSink | null) {
  sink = next ?? logToConsole;
}

/** Whether reporting is switched on. Read at call time; Next inlines the variables in the browser bundle. */
export const reportingOn = () => !!(process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.NEXT_PUBLIC_ERROR_REPORT_DSN);

/** Tell the reporting service about an error. A no-op without a DSN, and never throws. */
export function reportError(error: unknown, context: ReportContext): void {
  if (!reportingOn()) return;
  try {
    sink(error, context);
  } catch {
    // Reporting must never be the thing that breaks a screen.
  }
}
