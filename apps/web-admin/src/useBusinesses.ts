import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { listConsoleBusinesses } from "./api/endpoints";
import type { Business, BusinessRole } from "./api/types";

const SELECTED_KEY = "actilens.admin.selectedBusiness";

export type ConsoleBusiness = Business & { role: BusinessRole };

type BusinessStore = {
  businesses: ConsoleBusiness[];
  selected: ConsoleBusiness | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

// Loads every business where the current user has a console-capable role and keeps
// the effective role next to the business. UI capability checks are derived from
// this role, while the backend remains the final authorization authority.
function useBusinessStore(): BusinessStore {
  const [businesses, setBusinesses] = useState<ConsoleBusiness[]>([]);
  const [selectedId, setSelectedIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_KEY),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listConsoleBusinesses();
      const visible: ConsoleBusiness[] = res.businesses.map(({ business, role }) => ({
        ...business,
        role,
      }));
      setBusinesses(visible);
      setSelectedIdState((cur) => {
        if (cur && visible.some((b) => b.id === cur)) return cur;
        return visible[0]?.id ?? null;
      });
    } catch {
      setError("Could not load businesses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const setSelectedId = useCallback((id: string) => {
    localStorage.setItem(SELECTED_KEY, id);
    setSelectedIdState(id);
  }, []);

  const selected = businesses.find((b) => b.id === selectedId) ?? null;

  return {
    businesses,
    selected,
    selectedId: selected?.id ?? null,
    setSelectedId,
    loading,
    error,
    reload,
  };
}

const BusinessContext = createContext<BusinessStore | null>(null);

export function BusinessProvider({ children }: { children: ReactNode }) {
  const store = useBusinessStore();
  return createElement(BusinessContext.Provider, { value: store }, children);
}

export function useBusinesses(): BusinessStore {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusinesses must be used within a BusinessProvider");
  return ctx;
}
