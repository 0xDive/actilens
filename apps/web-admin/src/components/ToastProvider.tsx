import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "success" | "danger" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = Required<Pick<ToastInput, "title" | "tone">> &
  Omit<ToastInput, "title" | "tone"> & {
    id: number;
  };

type ToastContextValue = {
  pushToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismissToast = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const toast: ToastRecord = {
        ...input,
        id,
        tone: input.tone ?? "info",
      };
      setToasts((current) => [...current, toast]);

      const duration = input.durationMs ?? (toast.tone === "danger" ? 7000 : 4500);
      if (duration > 0) {
        const timer = window.setTimeout(() => dismissToast(id), duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ds-toast-viewport" aria-live="polite" aria-relevant="additions removals">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`ds-toast ds-toast--${toast.tone}`}
            role={toast.tone === "danger" ? "alert" : "status"}
          >
            <div>
              <div className="ds-toast__title">{toast.title}</div>
              {toast.description && (
                <div className="ds-toast__description">{toast.description}</div>
              )}
            </div>
            <button
              type="button"
              className="ds-toast__close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
