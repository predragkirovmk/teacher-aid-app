/*
  The three devices of the story, drawn in HTML and CSS so they stay sharp at any size and cost
  nothing to download. Each screen is a size container: the screens inside are set in cqw units,
  so they scale with the device instead of being transformed. The figure is one image to assistive
  technology; the fake interface inside it is not read out. A device without a label is part of a
  scene another device describes, and is hidden from assistive technology.
*/

type DeviceProps = { label?: string; className?: string; children: React.ReactNode };

const described = (label?: string) => (label ? { role: "img", "aria-label": label } : { "aria-hidden": true });

export function Laptop({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`laptop ${className}`} {...described(label)}>
      <div className="laptop__lid">
        <div className="laptop__screen">{children}</div>
      </div>
      <div className="laptop__base" />
    </figure>
  );
}

export function Board({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`board ${className}`} {...described(label)}>
      <div className="board__frame">
        <div className="board__screen">{children}</div>
      </div>
    </figure>
  );
}

/** A phone: its captures (PhoneShot) sit under the status bar, each in its app's top colour. */
export function Phone({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`phone ${className}`} {...described(label)}>
      <div className="phone__body">
        <div className="phone__screen">
          {children}
          <span className="phone__time" aria-hidden="true">
            9:41
          </span>
          <span className="phone__island" />
        </div>
      </div>
    </figure>
  );
}
