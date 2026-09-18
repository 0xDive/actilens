import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-ghost";

export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leadingIcon,
    className,
    children,
    disabled,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "ds-button",
        `ds-button--${size}`,
        `ds-button--${variant}`,
        className,
      )}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="ds-button__spinner" aria-hidden /> : leadingIcon}
      <span>{children}</span>
    </button>
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  bordered?: boolean;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, bordered = false, className, children, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cx(
          "ds-icon-button",
          bordered && "ds-icon-button--bordered",
          className,
        )}
        aria-label={label}
        title={label}
        {...props}
      >
        {children}
      </button>
    );
  },
);

export function Card({
  children,
  compact = false,
  className,
}: {
  children: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <section className={cx("ds-card", compact && "ds-card--compact", className)}>
      {children}
    </section>
  );
}

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return <span className={cx("ds-badge", `ds-badge--${tone}`, className)}>{children}</span>;
}

type FieldFrameProps = {
  label: string;
  description?: string;
  error?: string;
  htmlFor: string;
  children: ReactNode;
};

export function FieldFrame({
  label,
  description,
  error,
  htmlFor,
  children,
}: FieldFrameProps) {
  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {description && (
        <p id={`${htmlFor}-description`} className="ds-field__description">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p
          id={`${htmlFor}-error`}
          className="ds-field__message ds-field__message--error"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ id, label, description, error, className, ...props }, ref) {
    return (
      <FieldFrame
        htmlFor={id}
        label={label}
        description={description}
        error={error}
      >
        <input
          ref={ref}
          id={id}
          className={cx("ds-input", className)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : description ? `${id}-description` : undefined}
          {...props}
        />
      </FieldFrame>
    );
  },
);

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  id: string;
  label: string;
  description?: string;
  error?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    { id, label, description, error, className, children, ...props },
    ref,
  ) {
    return (
      <FieldFrame
        htmlFor={id}
        label={label}
        description={description}
        error={error}
      >
        <select
          ref={ref}
          id={id}
          className={cx("ds-select", className)}
          aria-invalid={Boolean(error) || undefined}
          {...props}
        >
          {children}
        </select>
      </FieldFrame>
    );
  },
);

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  name,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label className="ds-switch-row">
      <input
        className="ds-switch"
        type="checkbox"
        role="switch"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span className="ds-switch__label">{label}</span>
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header__copy">
        <h1 className="ds-page-title">{title}</h1>
        {subtitle && <p className="ds-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ds-page-header__actions">{actions}</div>}
    </header>
  );
}

export function Skeleton({
  width = "100%",
  height = 16,
  className,
}: {
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  return (
    <span
      className={cx("ds-skeleton", className)}
      aria-hidden
      style={{ width, height }}
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <div className="ds-empty__content">
        <div className="ds-empty__title">{title}</div>
        {description && (
          <div className="ds-empty__description">{description}</div>
        )}
        {action && <div className="ds-empty__action">{action}</div>}
      </div>
    </div>
  );
}


export type AlertTone = "info" | "success" | "warning" | "danger";

export function Alert({
  children,
  tone = "info",
  className,
}: {
  children: ReactNode;
  tone?: AlertTone;
  className?: string;
}) {
  return (
    <div
      className={cx("ds-alert", `ds-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  size = "default",
  closeOnBackdrop = true,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "confirm" | "default" | "complex";
  closeOnBackdrop?: boolean;
}) {
  const titleId = useId();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="ds-modal-backdrop"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.currentTarget === event.target) onClose();
      }}
    >
      <div
        className={cx(
          "ds-modal",
          size === "confirm" && "ds-modal--confirm",
          size === "complex" && "ds-modal--complex",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="ds-modal__header">
          <h2 id={titleId} className="ds-modal__title">
            {title}
          </h2>
        </div>
        <div className="ds-modal__body">{children}</div>
        {footer && <div className="ds-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
