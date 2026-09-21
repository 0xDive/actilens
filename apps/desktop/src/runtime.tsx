import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { call as invoke } from "./api";
import type { RuntimeState } from "./runtimeTypes";

type RuntimeContextValue = {
  state: RuntimeState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<RuntimeState>("runtime_state");
      setState(next);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onFocus = () => void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    const interval = window.setInterval(() => void refresh(), 10_000);
    const runtimeListener = listen("runtime-state-changed", () => void refresh());
    const trackingListener = listen("tracking-state", () => void refresh());

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      runtimeListener.then((unlisten) => unlisten());
      trackingListener.then((unlisten) => unlisten());
    };
  }, [refresh]);

  const value = useMemo(
    () => ({ state, loading, error, refresh }),
    [state, loading, error, refresh],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("useRuntime must be used inside RuntimeProvider");
  return value;
}
