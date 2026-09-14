"use client";

import React, { useMemo, useState } from "react";
import {
  Folder,
  FolderInput,
  ChevronsUp,
  Minus,
  ChevronDown,
  FunctionSquare,
  Eye,
  Ban,
  Bot,
  Tag as TagIcon,
  ListPlus,
  Trash2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Check,
} from "lucide-react";
import { useSuiteSelection } from "@/components/providers/SuiteSelectionProvider";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";

interface SuiteListProps {
  suites: any[];
  cases: any[];
  activeSuiteId: string | null;
  projectCode: string;
  onSelectCase?: (testCase: any) => void;
  activeCaseId?: string | null;
  searchQuery?: string;
  searchScope?: "all" | "title";
  priorityFilter?: Set<string>;
  automationFilter?: Set<string>;
  // bulk handlers wired from RepositoryContent
  onBulkEdit?: () => void;
  onBulkClone?: () => void;
  onBulkRun?: () => void;
  onBulkDelete?: () => void;
}

const PAGE_SIZE = 12;

export function SuiteList({
  suites,
  cases,
  activeSuiteId,
  projectCode,
  onSelectCase,
  activeCaseId,
  searchQuery = "",
  searchScope = "all",
  priorityFilter,
  automationFilter,
  onBulkEdit,
  onBulkClone,
  onBulkRun,
  onBulkDelete,
}: SuiteListProps) {
  const { selectedCases, toggleCase, toggleSuiteCases, clearSelection } =
    useSuiteSelection();
  const { role } = useProjectRole();
  const [page, setPage] = useState(1);

  // Helper to get all descendant suite IDs for a given suite
  const getDescendantSuiteIds = (suiteId: string): string[] => {
    const children = suites
      .filter((s) => s.parentId === suiteId)
      .map((s) => s.id);
    return [suiteId, ...children.flatMap(getDescendantSuiteIds)];
  };

  const q = searchQuery.trim().toLowerCase();

  const displayCases = useMemo(() => {
    const hasPriority = priorityFilter && priorityFilter.size > 0;
    const hasAutomation = automationFilter && automationFilter.size > 0;

    // First, filter by suite if activeSuiteId is set
    let activeCases = cases;
    if (activeSuiteId === "unassigned") {
      activeCases = cases.filter((tc) => !tc.suiteId);
    } else if (activeSuiteId) {
      const allowedSuiteIds = new Set(getDescendantSuiteIds(activeSuiteId));
      activeCases = cases.filter((tc) => allowedSuiteIds.has(tc.suiteId));
    }

    return activeCases.filter((tc) => {
      // Text search
      if (q) {
        const title = (tc.title || "").toLowerCase();
        const titleHit = title.includes(q);
        if (searchScope === "title") {
          if (!titleHit) return false;
        } else if (!titleHit) {
          const code = `${projectCode}-${tc.sequenceNumber || tc.id?.substring(0, 2)}`.toLowerCase();
          const desc = (tc.description || "").toLowerCase();
          if (!code.includes(q) && !desc.includes(q)) return false;
        }
      }
      // Advanced filters
      if (
        hasPriority &&
        !priorityFilter!.has((tc.priority || "NOT_SET").toUpperCase())
      )
        return false;
      if (
        hasAutomation &&
        !automationFilter!.has((tc.automationStatus || "MANUAL").toUpperCase())
      )
        return false;
      return true;
    });
  }, [
    cases,
    activeSuiteId,
    suites,
    q,
    projectCode,
    searchScope,
    priorityFilter,
    automationFilter,
  ]);

  const isFiltering =
    !!q || (priorityFilter?.size || 0) > 0 || (automationFilter?.size || 0) > 0;

  // Reset to page 1 when the result set changes
  React.useEffect(() => {
    setPage(1);
  }, [activeSuiteId, q, priorityFilter, automationFilter]);

  const totalPages = Math.max(1, Math.ceil(displayCases.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCases = displayCases.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const hasSelection = selectedCases.size > 0;

  // Scoped to the visible page, so the header tick always describes the rows
  // the reader can actually see.
  const allOnPageSelected =
    pagedCases.length > 0 && pagedCases.every((c: any) => selectedCases.has(c.id));
  const someOnPageSelected =
    !allOnPageSelected && pagedCases.some((c: any) => selectedCases.has(c.id));

  // Qase-style dense table: check · priority · type · ID · TITLE · TAGS · TYPE · OWNER
  const GRID =
    "30px 24px 24px 84px minmax(0,1fr) 150px 112px 56px";

  // priority arrow icon (high / medium / low / not set)
  const getPriIcon = (pri?: string) => {
    switch ((pri || "").toUpperCase()) {
      case "HIGH":
        return { Icon: ChevronsUp, color: "var(--danger)" };
      case "MEDIUM":
        return { Icon: Minus, color: "var(--warning)" };
      case "LOW":
        return { Icon: ChevronDown, color: "var(--text-faint)" };
      default:
        return { Icon: Minus, color: "var(--text-faint)" };
    }
  };

  const getTypeMeta = (tc: any) => {
    const t = (tc.type || "").toUpperCase();
    if (t === "NEGATIVE") return { Icon: Ban, label: "Negative" };
    if (t === "VISUAL") return { Icon: Eye, label: "Visual" };
    if (tc.automationStatus === "AUTOMATED")
      return { Icon: Bot, label: "Automated" };
    return { Icon: FunctionSquare, label: tc.type ? "Functional" : "Manual" };
  };

  const ownerInitials = (tc: any) => {
    const src =
      tc.assignee?.name ||
      tc.assignee?.email ||
      tc.author?.name ||
      tc.assigneeId ||
      "";
    if (!src) return "U";
    const parts = String(src).trim().split(/[\s@.]+/).filter(Boolean);
    if (parts.length >= 2)
      return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(src).substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col min-w-0 h-full">
      {/* bulk action bar */}
      {hasSelection && (
        <div className="flex items-center gap-[12px] px-[18px] py-[9px] bg-primary-light border-b border-border shrink-0">
          <span className="text-[12.5px] font-semibold text-primary">
            {selectedCases.size} selected
          </span>
          <div className="flex gap-[14px] text-[12.5px] font-medium text-primary">
            <button
              onClick={onBulkEdit}
              className="flex items-center gap-[5px] hover:opacity-80"
            >
              <FolderInput size={16} /> Edit
            </button>
            <button
              onClick={onBulkClone}
              className="flex items-center gap-[5px] hover:opacity-80"
            >
              <TagIcon size={16} /> Clone
            </button>
            <button
              onClick={onBulkRun}
              className="flex items-center gap-[5px] hover:opacity-80"
            >
              <ListPlus size={16} /> Add to run
            </button>
            <button
              onClick={onBulkDelete}
              className="flex items-center gap-[5px] text-danger hover:opacity-80"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
          <div className="flex-1"></div>
          <button
            onClick={clearSelection}
            className="text-[12px] text-primary opacity-70 hover:opacity-100"
          >
            Clear
          </button>
        </div>
      )}

      {/* table (horizontal scroll on narrow panes so columns never clip) */}
      <div className="flex-1 min-h-0 overflow-x-auto">
      <div className="flex h-full min-w-[560px] flex-col">
      {/* column header */}
      <div
        className="grid gap-[12px] px-[18px] py-[8px] text-[11.5px] font-semibold tracking-[0.05em] uppercase text-text-faint border-b border-border shrink-0 bg-surface-hover/40"
        style={{ gridTemplateColumns: GRID }}
      >
        {/* Select-all for what is on screen. It acts on the current page, not
            the whole suite: a tick that silently reaches rows you cannot see
            makes the next click — Delete — dangerous. */}
        <div className="flex items-center">
          {role !== "VIEWER" && pagedCases.length > 0 && (
            <button
              type="button"
              onClick={() => toggleSuiteCases(pagedCases.map((c: any) => c.id))}
              aria-label={allOnPageSelected ? "Clear selection" : "Select all on this page"}
              title={
                allOnPageSelected
                  ? `Clear ${pagedCases.length} selected`
                  : `Select all ${pagedCases.length} on this page`
              }
              className="flex h-[15px] w-[15px] items-center justify-center rounded-[4px] border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
              style={{
                borderColor:
                  allOnPageSelected || someOnPageSelected
                    ? "var(--primary)"
                    : "var(--border-color)",
                background:
                  allOnPageSelected || someOnPageSelected ? "var(--primary)" : "transparent",
              }}
            >
              {allOnPageSelected && <Check size={11} className="text-white" strokeWidth={3.5} />}
              {someOnPageSelected && !allOnPageSelected && (
                <span className="h-[2px] w-[7px] rounded-full bg-white" />
              )}
            </button>
          )}
        </div>
        <div></div>
        <div></div>
        <div>ID</div>
        <div>Title</div>
        <div>Tags</div>
        <div>Type</div>
        <div className="text-right">Owner</div>
      </div>

      {/* rows */}
      <div className="flex-1 overflow-y-auto">
        {pagedCases.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 mt-4 mx-4 bg-surface rounded-[16px] border border-border border-dashed">
            <div className="w-14 h-14 bg-primary-light text-primary rounded-full flex items-center justify-center mb-3">
              <Folder size={28} />
            </div>
            <h3 className="text-[14px] font-bold text-text-main mb-1">
              {isFiltering ? "No matching test cases" : "No test cases found"}
            </h3>
            <p className="text-[13px] text-text-faint text-center max-w-sm">
              {isFiltering
                ? "No cases match your search filters."
                : "There are no test cases in this suite yet. Create one to get started."}
            </p>
          </div>
        ) : (
          pagedCases.map((tc) => {
            const isSelected = selectedCases.has(tc.id);
            const isActive = activeCaseId === tc.id;
            const { Icon: PriIcon, color: priColor } = getPriIcon(tc.priority);
            const { Icon: TypeIcon, label: typeLabel } = getTypeMeta(tc);

            return (
              <div
                key={tc.id}
                onClick={() => onSelectCase && onSelectCase(tc)}
                className="grid gap-[12px] px-[18px] py-[9px] items-center border-b border-border cursor-pointer transition-colors hover:bg-surface-hover/60"
                style={{
                  gridTemplateColumns: GRID,
                  background:
                    isSelected || isActive
                      ? "var(--primary-light)"
                      : undefined,
                }}
              >
                <div className="flex items-center justify-center">
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCase(tc.id);
                    }}
                    className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center cursor-pointer transition-all"
                    style={{
                      boxShadow: isSelected
                        ? "none"
                        : "inset 0 0 0 1.5px var(--border-strong)",
                      background: isSelected
                        ? "var(--primary)"
                        : "var(--surface)",
                    }}
                  >
                    {isSelected && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--primary-fg)"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <PriIcon size={18} style={{ color: priColor }} />
                </div>

                <div className="flex items-center justify-center text-text-faint" title={typeLabel}>
                  <TypeIcon size={16} />
                </div>

                <div className="qm-mono text-[12.5px] text-text-faint tabular-nums truncate">
                  {projectCode}-{tc.sequenceNumber || tc.id.substring(0, 4)}
                </div>

                <div
                  className="text-[14px] font-medium truncate text-text-main"
                  title={tc.title}
                >
                  {tc.title}
                </div>

                <div className="flex gap-[5px] overflow-hidden">
                  {tc.tags?.slice(0, 2).map((t: any) => (
                    <span
                      key={t.id || t.name}
                      className="text-[11.5px] font-semibold px-[8px] py-[2px] rounded-[6px] bg-surface-hover text-text-muted whitespace-nowrap"
                    >
                      {t.name}
                    </span>
                  ))}
                  {tc.tags?.length > 2 && (
                    <span className="text-[11.5px] font-semibold px-[8px] py-[2px] rounded-[6px] bg-surface-hover text-text-muted whitespace-nowrap">
                      +{tc.tags.length - 2}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-[6px] text-[13px] text-text-muted whitespace-nowrap">
                  <TypeIcon size={16} className="text-text-faint" />
                  {typeLabel}
                </div>

                <div className="flex justify-end">
                  <div className="w-[26px] h-[26px] rounded-full bg-primary-light text-primary flex items-center justify-center text-[11px] font-bold">
                    {ownerInitials(tc)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between px-[18px] py-[13px] mt-auto shrink-0 border-t border-border">
        <span className="text-[12px] text-text-faint">
          Showing {pagedCases.length} of {displayCases.length} in this suite
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-lg border border-border text-text-muted disabled:opacity-40 hover:bg-surface-hover"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12px] text-text-muted tabular-nums px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-lg border border-border text-text-muted disabled:opacity-40 hover:bg-surface-hover"
            >
              <ChevronRightIcon size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
