import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStudentStream, IDLE_MS } from "@/lib/app/session/student-stream";
import { iso } from "@/lib/app/api/wire";
import { FakeTransport } from "./support/transport";

const CHANNEL = "student.st-1";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(visible = true) {
  const transports: FakeTransport[] = [];
  const onNotification = vi.fn();
  const onSignedInElsewhere = vi.fn();
  let shown = visible;
  const stream = createStudentStream({
    meId: "st-1",
    createTransport: () => {
      const t = new FakeTransport();
      transports.push(t);
      return t;
    },
    onNotification,
    onSignedInElsewhere,
    visible: () => shown,
  });
  return { stream, transports, onNotification, onSignedInElsewhere, setVisible: (v: boolean) => (shown = v) };
}

describe("the student's own channel while the app is open", () => {
  it("listens to the student's channel and nothing else", () => {
    const { transports } = setup();
    expect(transports).toHaveLength(1);
    expect(transports[0].channels()).toEqual([CHANNEL]);
  });

  it("reads the feed when a notification is created", () => {
    const { transports, onNotification } = setup();
    transports[0].push(CHANNEL, "notification.created", { channel: CHANNEL, server_now: iso(Date.now()) });
    expect(onNotification).toHaveBeenCalledOnce();
  });

  it("reads the feed every time the link comes up, for what was created while it was down", () => {
    const { transports, onNotification } = setup();
    transports[0].setState("open");
    transports[0].setState("reconnecting");
    transports[0].setState("open");
    expect(onNotification).toHaveBeenCalledTimes(2);
  });

  it("shows the full screen when the student signed in elsewhere", () => {
    const { transports, onSignedInElsewhere, onNotification } = setup();
    transports[0].push(CHANNEL, "signed_in_elsewhere", {});
    expect(onSignedInElsewhere).toHaveBeenCalledOnce();
    expect(onNotification).not.toHaveBeenCalled();
  });

  it("ignores the lesson's events, which belong to the quiz", () => {
    const { transports, onNotification, onSignedInElsewhere } = setup();
    transports[0].push(CHANNEL, "question.result", { server_now: iso(Date.now()), session_question_id: "q1" });
    transports[0].push(CHANNEL, "something.new", {});
    expect(onNotification).not.toHaveBeenCalled();
    expect(onSignedInElsewhere).not.toHaveBeenCalled();
  });

  it("lets the link go after the page has been hidden a while, and opens a new one when it is shown", () => {
    const { stream, transports, onNotification } = setup();
    stream.hide();
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(transports[0].close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(transports[0].close).toHaveBeenCalledOnce();

    stream.show();
    expect(transports).toHaveLength(2);
    transports[1].setState("open");
    expect(onNotification).toHaveBeenCalledOnce();
  });

  it("keeps the link through a quick look away, and reads the feed in case something came while the page was frozen", () => {
    const { stream, transports, onNotification } = setup();
    transports[0].setState("open");
    onNotification.mockClear();
    stream.hide();
    vi.advanceTimersByTime(IDLE_MS / 2);
    stream.show();
    vi.advanceTimersByTime(IDLE_MS * 2);
    expect(transports).toHaveLength(1);
    expect(transports[0].close).not.toHaveBeenCalled();
    expect(transports[0].reconnect).not.toHaveBeenCalled();
    expect(onNotification).toHaveBeenCalledOnce();
  });

  it("reconnects a link that died while the page was hidden", () => {
    const { stream, transports } = setup();
    transports[0].setState("open");
    transports[0].setState("reconnecting");
    stream.hide();
    stream.show();
    expect(transports[0].reconnect).toHaveBeenCalledOnce();
  });

  it("does not open a link for a page that starts hidden until it is shown", () => {
    const { stream, transports } = setup(false);
    expect(transports).toHaveLength(0);
    stream.show();
    expect(transports).toHaveLength(1);
  });

  it("closes the link, and opens none again, when the student goes", () => {
    const { stream, transports } = setup();
    stream.dispose();
    expect(transports[0].close).toHaveBeenCalledOnce();
    stream.show();
    expect(transports).toHaveLength(1);
  });
});
