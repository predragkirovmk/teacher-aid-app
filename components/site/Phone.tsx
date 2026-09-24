import { SCREENS, type ScreenName } from "./screens";

type Props = {
  screens: ScreenName[];
  label: string;
  className?: string;
  /** Rendered width in CSS px; the 390 × 844 artboard scales to fit. */
  width?: number;
  /** For a phone that steps through several screens: the one shown before any script runs. */
  active?: number;
};

// A device frame around one or more artboards from the Claude Design canvas. The screens are
// illustrations: the frame carries the description, and nothing inside can take focus.
export function Phone({ screens, label, className, width, active }: Props) {
  return (
    <div
      className={`phone${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={label}
      style={width ? ({ "--pw": width } as React.CSSProperties) : undefined}
    >
      <div className="phone__frame">
        <div className="phone__screens" aria-hidden="true" inert>
          {screens.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className={`phone__screen${i === active ? " is-active" : ""}`}
              data-screen={name}
              dangerouslySetInnerHTML={{ __html: SCREENS[name] }}
            />
          ))}
        </div>
        <div className="phone__island" aria-hidden="true" />
      </div>
    </div>
  );
}
