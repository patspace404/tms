"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface SuiteSelectionContextType {
  selectedCases: Set<string>;
  toggleCase: (caseId: string) => void;
  toggleSuiteCases: (caseIds: string[]) => void;
  isCaseSelected: (caseId: string) => boolean;
  areAllCasesSelected: (caseIds: string[]) => boolean;
  clearSelection: () => void;
  activeCaseId: string | null;
  setActiveCaseId: (caseId: string | null) => void;
  caseSuiteOverrides: Record<string, string | null>;
  setCaseSuiteOverride: (caseIds: string[], suiteId: string | null) => void;
}

const SuiteSelectionContext = createContext<
  SuiteSelectionContextType | undefined
>(undefined);

export function SuiteSelectionProvider({
  children,
  initialActiveCaseId = null,
}: {
  children: ReactNode;
  initialActiveCaseId?: string | null;
}) {
  const [selectedCases, setSelectedCases] = useState<Set<string>>(new Set());
  const [activeCaseId, setActiveCaseId] = useState<string | null>(
    initialActiveCaseId,
  );
  const [caseSuiteOverrides, setCaseSuiteOverrides] = useState<
    Record<string, string | null>
  >({});

  const setCaseSuiteOverride = (
    caseIds: string[],
    suiteId: string | null,
  ) => {
    setCaseSuiteOverrides((prev) => {
      const next = { ...prev };
      caseIds.forEach((id) => {
        next[id] = suiteId;
      });
      return next;
    });
  };

  const toggleCase = (caseId: string) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const toggleSuiteCases = (caseIds: string[]) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      const allSelected = caseIds.every((id) => next.has(id));

      if (allSelected) {
        // Deselect all
        caseIds.forEach((id) => next.delete(id));
      } else {
        // Select all
        caseIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const isCaseSelected = (caseId: string) => selectedCases.has(caseId);

  const areAllCasesSelected = (caseIds: string[]) => {
    if (caseIds.length === 0) return false;
    return caseIds.every((id) => selectedCases.has(id));
  };

  const clearSelection = () => setSelectedCases(new Set());

  return (
    <SuiteSelectionContext.Provider
      value={{
        selectedCases,
        toggleCase,
        toggleSuiteCases,
        isCaseSelected,
        areAllCasesSelected,
        clearSelection,
        activeCaseId,
        setActiveCaseId,
        caseSuiteOverrides,
        setCaseSuiteOverride,
      }}
    >
      {children}
    </SuiteSelectionContext.Provider>
  );
}

export function useSuiteSelection() {
  const context = useContext(SuiteSelectionContext);
  if (context === undefined) {
    throw new Error(
      "useSuiteSelection must be used within a SuiteSelectionProvider",
    );
  }
  return context;
}
