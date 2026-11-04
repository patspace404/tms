"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";

interface SuiteExpansionContextType {
  expandedSuites: Set<string>;
  toggleSuite: (id: string) => void;
  expandAll: (suiteIds: string[]) => void;
  collapseAll: (suiteIds: string[]) => void;
  isExpanded: (id: string) => boolean;
}

const SuiteExpansionContext = createContext<SuiteExpansionContextType | null>(
  null,
);

export function SuiteExpansionProvider({
  children,
  projectCode = "default",
}: {
  children: React.ReactNode;
  initialExpandedIds?: string[]; // Kept for backwards compatibility
  projectCode?: string;
}) {
  const storageKey = `tms_suite_expanded_${projectCode}`;
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(
    new Set(),
  );
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount (default: all collapsed)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setExpandedSuites(new Set(JSON.parse(saved)));
      } else {
        setExpandedSuites(new Set());
      }
    } catch (e) {
      console.error("Failed to load suite expansion state", e);
    }
    setIsLoaded(true);
  }, [storageKey]);

  // Save to local storage whenever it changes (only after initial load)
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(
        storageKey,
        JSON.stringify(Array.from(expandedSuites)),
      );
    }
  }, [expandedSuites, isLoaded, storageKey]);

  const toggleSuite = useCallback((id: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id); // collapsing
      } else {
        next.add(id); // expanding
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((suiteIds: string[]) => {
    setExpandedSuites(new Set(suiteIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSuites(new Set());
  }, []);

  const isExpanded = useCallback(
    (id: string) => {
      return expandedSuites.has(id);
    },
    [expandedSuites],
  );

  return (
    <SuiteExpansionContext.Provider
      value={{
        expandedSuites,
        toggleSuite,
        expandAll,
        collapseAll,
        isExpanded,
      }}
    >
      {children}
    </SuiteExpansionContext.Provider>
  );
}

export function useSuiteExpansion() {
  const context = useContext(SuiteExpansionContext);
  if (!context) {
    throw new Error(
      "useSuiteExpansion must be used within a SuiteExpansionProvider",
    );
  }
  return context;
}
