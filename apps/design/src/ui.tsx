import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  children,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      type={type}
      className={cx(
        "fixture-button",
        `fixture-button--${variant}`,
        `fixture-button--${size}`,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={cx("fixture-card", className)}>{children}</section>;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "success" | "warning" | "danger";
}) {
  return (
    <span className={`fixture-badge fixture-badge--${tone}`}>
      {children}
    </span>
  );
}

export function Field({
  id,
  label,
  description,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  description?: string;
}) {
  return (
    <label className="fixture-field" htmlFor={id}>
      <span className="fixture-field__label">{label}</span>
      {description && (
        <span className="fixture-field__description">{description}</span>
      )}
      <input id={id} className="fixture-input" {...props} />
    </label>
  );
}

export function Switch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="fixture-switch-row">
      <input
        type="checkbox"
        role="switch"
        className="fixture-switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
