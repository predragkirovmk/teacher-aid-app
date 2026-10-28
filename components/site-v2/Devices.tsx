/*
  The three devices of the story, drawn in HTML and CSS so they stay sharp at any size and cost
  nothing to download. Each screen is a size container: the screens inside are set in cqw units,
  so they scale with the device instead of being transformed. The figure is one image to assistive
  technology; the fake interface inside it is not read out.
*/

type DeviceProps = { label: string; className?: string; children: React.ReactNode };

export function Laptop({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`laptop ${className}`} role="img" aria-label={label}>
      <div className="laptop__lid">
        <div className="laptop__screen">{children}</div>
      </div>
      <div className="laptop__base" />
    </figure>
  );
}

export function Board({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`board ${className}`} role="img" aria-label={label}>
      <div className="board__frame">
        <div className="board__screen">{children}</div>
      </div>
    </figure>
  );
}

export function Phone({ label, className = "", children }: DeviceProps) {
  return (
    <figure className={`phone ${className}`} role="img" aria-label={label}>
      <div className="phone__body">
        <div className="phone__screen">
          <span className="phone__island" />
          {children}
        </div>
      </div>
    </figure>
  );
}
