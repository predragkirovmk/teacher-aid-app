/**
 * What the student app does with a web push, in one file the worker loads (importScripts in app-sw.js) and the unit tests
 * load too: reading the payload, the screen a notification opens, and the options the notification is shown with.
 *
 * The payload is JSON, at most 4 KB, sent by the API (PROPOSED, spec 11.2 and 11.3). It is written in the student's
 * language by the server, and it is shown on a locked screen, so it holds no more than the notification itself says:
 *
 *   { "v": 1, "id": "n-81", "kind": "practice_set_sent", "locale": "mk",
 *     "title": "Прашања за вежбање: Математика", "body": "Наставникот ти испрати прашања за вежбање.",
 *     "payload": { "course_id": "c-math", "subject_id": "math", "practice_set_id": "ps-12" } }
 *
 * `id` and `kind` are the notification's, as in `GET /me/notifications`; `payload` carries the same ids as that
 * notification's, never a name, a score or an answer. The server never sends a URL: the app owns its screens, so the
 * screen a notification opens is worked out here from `kind` and the ids (`deepLink`), and a payload that names no known
 * screen opens the Alerts tab. A payload this build cannot read is still shown, as a plain "TeacherAid" notification:
 * Safari takes a web push subscription away from an app that receives a push and shows nothing.
 *
 * Nothing here reads the network, the cache or an API response: it only turns a message into a notification.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TeacherAidPush = api;
})(typeof self !== "undefined" ? self : this, function () {
  var APP_NAME = "TeacherAid";
  /** Shown when the server sent a push with no words of its own: both languages, since the worker does not know the student's. */
  var FALLBACK_BODY = "Ново известување · New alert";
  var ICON = "/app-icons/icon-192.png";
  var BADGE = "/app-icons/badge-96.png";
  var ALERTS = "/app/notifications";
  /** The query parameter a window opened by a tap carries, so the page can mark that alert read. */
  var FROM_PUSH = "from_push";

  var text = function (value, max) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
  };
  var encode = function (value) {
    return encodeURIComponent(value);
  };

  /** A path of this app and nothing else: the same rule the sign-in's `next` follows (lib/app/signin.ts). */
  function appPath(path) {
    if (typeof path !== "string" || !/^\/app(\/[\w.~%-]+)*$/.test(path)) return null;
    try {
      var parts = path.split("/");
      for (var i = 0; i < parts.length; i++) {
        var seg = decodeURIComponent(parts[i]);
        if (parts[i] !== "" && (seg === "." || seg === ".." || seg === "")) return null;
      }
    } catch {
      return null;
    }
    return path;
  }

  /** The screen a notification opens, from what it is about. The same places the Alerts tab sends a tap to (lib/app/alerts.ts). */
  function deepLink(kind, p) {
    p = p && typeof p === "object" ? p : {};
    var course = text(p.course_id, 80);
    var toSubject = course ? "/app/subject/" + encode(course) : ALERTS;
    switch (kind) {
      case "result_ready":
        return text(p.session_id, 80) ? "/app/summary/" + encode(text(p.session_id, 80)) : "/app/summary";
      case "practice_set_sent":
        return text(p.practice_set_id, 80) ? "/app/practice/" + encode(text(p.practice_set_id, 80)) : toSubject;
      case "marked_late":
        return "/app/attendance";
      case "badge_earned":
        return "/app/achievements";
      default:
        return toSubject;
    }
  }

  /** Only a picture of the app's own may be named, never an address. */
  var picture = function (value, fallback) {
    return typeof value === "string" && /^\/app-icons\/[\w.-]+\.png$/.test(value) ? value : fallback;
  };

  /** A payload as a notification to show. Never throws and always has a title: a push must always become a notification. */
  function parse(raw) {
    var d = raw && typeof raw === "object" ? raw : {};
    var kind = text(d.kind, 40) || "generic";
    var title = text(d.title, 120);
    var body = text(d.body, 240);
    return {
      id: text(d.id, 80),
      kind: kind,
      title: title || APP_NAME,
      body: title || body ? body : FALLBACK_BODY,
      lang: d.locale === "en" ? "en" : "mk",
      link: appPath(deepLink(kind, d.payload)) || ALERTS,
      icon: picture(d.icon, ICON),
      badge: picture(d.badge, BADGE),
    };
  }

  /** The options for `showNotification`. The tag is the alert's id, so the same push twice is one notification. */
  function options(n) {
    var o = {
      body: n.body,
      icon: n.icon,
      badge: n.badge,
      lang: n.lang,
      data: { id: n.id, kind: n.kind, link: n.link },
    };
    if (n.id) o.tag = n.id;
    return o;
  }

  /** The address of a window opened by a tap: the screen, and the alert to mark read. */
  function withAlert(link, id) {
    return id ? link + "?" + FROM_PUSH + "=" + encode(id) : link;
  }

  /** Which of the open windows takes a tap: the one being looked at, else any window of the app. */
  function pickWindow(windows, origin) {
    var mine = windows.filter(function (w) {
      try {
        var url = new URL(w.url);
        return url.origin === origin && (url.pathname === "/app" || url.pathname.indexOf("/app/") === 0);
      } catch {
        return false;
      }
    });
    return (
      mine.filter(function (w) {
        return w.focused;
      })[0] ||
      mine.filter(function (w) {
        return w.visibilityState === "visible";
      })[0] ||
      mine[0] ||
      null
    );
  }

  return {
    APP_NAME: APP_NAME,
    FALLBACK_BODY: FALLBACK_BODY,
    FROM_PUSH: FROM_PUSH,
    appPath: appPath,
    deepLink: deepLink,
    parse: parse,
    options: options,
    withAlert: withAlert,
    pickWindow: pickWindow,
  };
});
