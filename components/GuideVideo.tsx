"use client";

import { XIcon } from "@phosphor-icons/react";
import { useRef, type ReactNode, type RefObject } from "react";
import { clock, GUIDE_CHAPTERS, GUIDE_VIDEO } from "@/lib/guide-video";
import { getLenis } from "@/lib/site-v2/lenis";
import s from "./GuideVideo.module.css";

type Lang = "mk" | "en";

/** Nothing loads until play is pressed: the poster is the only cost of a page that shows the film. */
function Film({ title, video }: { title: string; video: RefObject<HTMLVideoElement | null> }) {
  return (
    <video
      ref={video}
      className={s.video}
      controls
      playsInline
      preload="none"
      poster={GUIDE_VIDEO.poster}
      width={GUIDE_VIDEO.width}
      height={GUIDE_VIDEO.height}
      aria-label={title}
    >
      <source src={GUIDE_VIDEO.src} type="video/mp4" />
    </video>
  );
}

/** The film in the page, with its chapters under it: each one starts the film there. */
export function GuideVideo({ lang, title, chaptersLabel }: { lang: Lang; title: string; chaptersLabel: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const seek = (at: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = at;
    void v.play().catch(() => undefined);
  };

  return (
    <div className={s.player}>
      <Film title={title} video={video} />
      <ol className={s.chapters} aria-label={chaptersLabel}>
        {GUIDE_CHAPTERS.map((c) => (
          <li key={c.at}>
            <button type="button" onClick={() => seek(c.at)}>
              <span>{clock(c.at)}</span>
              {c[lang]}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A button that opens the film over the page and plays it; closing it (the button, Escape or a click outside the film) stops it.
 * The website's smooth scroll stops while it is open; elsewhere there is none.
 */
export function GuideVideoButton({
  title,
  closeLabel,
  className,
  children,
}: {
  title: string;
  closeLabel: string;
  className: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  const open = () => {
    dialog.current?.showModal();
    getLenis()?.stop();
    void video.current?.play().catch(() => undefined);
  };

  return (
    <>
      <button type="button" className={className} onClick={open}>
        {children}
      </button>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-label={title}
        onClose={() => {
          video.current?.pause();
          getLenis()?.start();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        {/* First, so the dialog opens with the focus on the way out. */}
        <button type="button" className={s.close} onClick={() => dialog.current?.close()} aria-label={closeLabel}>
          <XIcon size={24} weight="bold" aria-hidden="true" />
        </button>
        <div className={s.frame}>
          <Film title={title} video={video} />
        </div>
      </dialog>
    </>
  );
}
