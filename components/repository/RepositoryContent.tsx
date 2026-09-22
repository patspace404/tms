"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  PlayCircle,
  Settings,
  X,
  Edit3,
  Copy,
  Trash2,
  ChevronsUp,
  ChevronDown,
  Minus,
  FileText,
  Sparkles,
  CloudUpload,
  Loader2,
  GitMerge,
  ExternalLink,
  Ticket,
  Plus,
  AlertTriangle,
  Download,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { SuiteList } from "@/components/repository/SuiteList";
import { AiGeneratorModal } from "@/components/repository/AiGeneratorModal";
import { AiImpactModal } from "@/components/repository/AiImpactModal";
import { BulkJiraImpactModal } from "@/components/repository/BulkJiraImpactModal";
import { TestCaseAutomationPanel } from "@/components/repository/TestCaseAutomationPanel";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { CloneSuiteModal } from "@/components/repository/CloneSuiteModal";
import { ImportCasesModal } from "@/components/repository/ImportCasesModal";
import { BulkEditModal } from "@/components/repository/BulkEditModal";
import { useSuiteSelection } from "@/components/providers/SuiteSelectionProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CommentThread } from "@/components/ui/CommentThread";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ChevronRight } from "lucide-react";
import { formatThaiTime } from "@/lib/utils";

interface RepositoryContentProps {
  projectCode: string;
  suites: any[];
  cases: any[];
  activeSuiteId: string | null;
  /** Open this case on first render — set by a ?case= link. */
  initialCaseId?: string | null;
  totalCases?: number;
  totalSuites?: number;
}

export function RepositoryContent({
  projectCode,
  suites,
  cases,
  activeSuiteId,
  initialCaseId,
  totalCases,
  totalSuites,
}: RepositoryContentProps) {
  const router = useRouter();
  const { role } = useProjectRole();
  const [activeTestCaseId, setActiveTestCaseId] = useState<string | null>(initialCaseId ?? null);
  const [detailTab, setDetailTab] = useState<
    "general" | "defects" | "comments" | "history"
  >("general");
  const [history, setHistory] = useState<any[]>([]);
  const [changes, setChanges] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  React.useEffect(() => {
    if (detailTab !== "history" || !activeTestCaseId) return;
    let alive = true;
    setHistoryLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectCode}/cases/${activeTestCaseId}/history`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch(`/api/projects/${projectCode}/cases/${activeTestCaseId}/changes`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([h, c]) => {
        if (!alive) return;
        setHistory(Array.isArray(h) ? h : []);
        setChanges(Array.isArray(c) ? c : []);
      })
      .finally(() => alive && setHistoryLoading(false));
    return () => {
      alive = false;
    };
  }, [detailTab, activeTestCaseId, projectCode]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"all" | "title">("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Set<string>>(new Set());
  const [automationFilter, setAutomationFilter] = useState<Set<string>>(
    new Set(),
  );
  const filterRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const activeFilterCount = priorityFilter.size + automationFilter.size;
  const toggleSetValue = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string,
  ) =>
    setter((prev) => {
      const next = new Set(prev);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCloneCasesModalOpen, setIsCloneCasesModalOpen] = useState(false);
  const [isCloningCases, setIsCloningCases] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isImpactModalOpen, setIsImpactModalOpen] = useState(false);
  const [isBulkJiraModalOpen, setIsBulkJiraModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [lastSyncPr, setLastSyncPr] = useState<{
    url: string;
    number: number | null;
  } | null>(null);
  const [customFieldsDef, setCustomFieldsDef] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmSync, setConfirmSync] = useState(false);
  const [confirmDeleteCase, setConfirmDeleteCase] = useState(false);

  const { selectedCases, clearSelection } = useSuiteSelection();
  const hasSelection = selectedCases.size > 0;

  const handleBulkDelete = async () => {
    try {
      const res = await fetch(`/api/projects/${projectCode}/cases/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: Array.from(selectedCases) }),
      });

      if (res.ok) {
        clearSelection();
        toast.success("Successfully deleted selected test cases");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete test cases");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting test cases");
    }
  };

  const handleBulkClone = () => {
    setIsCloneCasesModalOpen(true);
  };

  const executeBulkClone = async (payload: {
    destinationId: string | null;
  }) => {
    setIsCloningCases(true);
    try {
      const res = await fetch(`/api/projects/${projectCode}/cases/bulk-clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseIds: Array.from(selectedCases),
          destinationId: payload.destinationId,
        }),
      });

      if (res.ok) {
        setIsCloneCasesModalOpen(false);
        clearSelection();
        toast.success("Successfully cloned selected test cases");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to clone test cases");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error cloning test cases");
    } finally {
      setIsCloningCases(false);
    }
  };

  const handleBulkRun = () => {
    const caseIds = Array.from(selectedCases).join(",");
    router.push(`/projects/${projectCode}/runs/create?cases=${caseIds}`);
  };

  const handleBulkEdit = () => {
    setIsBulkEditModalOpen(true);
  };

  const executeBulkEdit = async (fields: Record<string, string>) => {
    setIsBulkEditing(true);
    try {
      const res = await fetch(`/api/projects/${projectCode}/cases/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: Array.from(selectedCases), fields }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsBulkEditModalOpen(false);
        clearSelection();
        toast.success(
          `Updated ${data.count} test case${data.count !== 1 ? "s" : ""}`,
        );
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to update test cases");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error updating test cases");
    } finally {
      setIsBulkEditing(false);
    }
  };

  React.useEffect(() => {
    fetch("/api/workspace/fields")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCustomFieldsDef(data);
      })
      .catch(console.error);
  }, []);

  const handleSyncAll = async () => {
    setIsSyncing(true);
    setLastSyncPr(null);
    try {
      const res = await fetch(`/api/projects/${projectCode}/github/sync-all`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");

      setLastSyncPr({ url: data.prUrl, number: data.prNumber });
      toast.success(`Success! Created PR for ${data.count} test cases.`);
      router.refresh();
    } catch (err: any) {
      toast.error(`Error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleQuickMerge = async () => {
    if (!lastSyncPr?.number) return;

    setIsMerging(true);
    try {
      const res = await fetch(`/api/projects/${projectCode}/github/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prNumber: lastSyncPr.number }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Merge failed");

      toast.success(`Merged successfully! ${data.message || ""}`);
      setLastSyncPr(null);
    } catch (err: any) {
      toast.error(`Error merging PR: ${err.message}`);
    } finally {
      setIsMerging(false);
    }
  };

  const handleExportQase = () => {
    window.open(`/api/projects/${projectCode}/export-qase`, "_blank");
  };

  const handleExportCsv = () => {
    window.open(`/api/projects/${projectCode}/export-csv`, "_blank");
  };

  const activeTestCase = cases.find((c) => c.id === activeTestCaseId);

  const handleCloneCase = async () => {
    if (!activeTestCase) return;
    try {
      const res = await fetch(`/api/projects/${projectCode}/cases/bulk-clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseIds: [activeTestCase.id],
          destinationId: activeTestCase.suiteId || null,
        }),
      });
      if (res.ok) {
        toast.success("Test case cloned successfully");
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to clone test case");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error cloning test case");
    }
  };

  const handleBulkRunSingle = () => {
    if (!activeTestCase) return;
    router.push(
      `/projects/${projectCode}/runs/create?cases=${activeTestCase.id}`,
    );
  };

  const handleDeleteActiveCase = async () => {
    if (!activeTestCase) return;
    try {
      const res = await fetch(
        `/api/projects/${projectCode}/cases/${activeTestCase.id}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        toast.success("Test case deleted successfully");
        setActiveTestCaseId(null);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete test case");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting test case");
    }
  };

  const activeSuite = activeSuiteId ? suites.find((s) => s.id === activeSuiteId) : null;
  const activeSuiteTitle = activeSuite?.title || "All Suites";
  const parentSuiteTitle = activeSuite?.parentId ? suites.find((s) => s.id === activeSuite?.parentId)?.title : null;

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 relative h-full overflow-hidden bg-background transition-colors">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px] px-[18px] py-[12px] border-b border-border bg-surface shrink-0">
          <div className="flex items-center gap-[7px] text-[13px] text-text-muted min-w-0">
            <span className="text-text-faint">{projectCode}</span>
            <ChevronRight size={16} className="text-text-faint" />
            {parentSuiteTitle && (
              <>
                <span className="text-text-faint">{parentSuiteTitle}</span>
                <ChevronRight size={16} className="text-text-faint" />
              </>
            )}
            <span className="font-semibold text-text-main">{activeSuiteTitle}</span>
          </div>
          
          <div className="flex-1"></div>
          
          <div className="flex items-center gap-[8px] h-[34px] px-[11px] bg-surface rounded-[9px] text-text-faint text-[12.5px] min-w-[170px]" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}>
            <Search size={17} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter cases"
              className="bg-transparent border-none outline-none w-full text-text-main placeholder-text-faint"
            />
          </div>
          
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((o) => !o)}
              className="flex items-center gap-[6px] h-[34px] px-[11px] bg-surface rounded-[9px] text-[12.5px] font-medium text-text-main"
              style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}
            >
              <Filter size={16} className="text-text-faint" />
              Filters
              {activeFilterCount > 0 && (
                <span className="text-[10px] font-bold bg-primary-soft text-primary-text px-[6px] py-[1px] rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <div className="absolute right-0 mt-1.5 w-60 qm-panel z-50 p-3 animate-fade-up border border-border shadow-md rounded-[11px] bg-surface">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                    Priority
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => {
                        setPriorityFilter(new Set());
                        setAutomationFilter(new Set());
                      }}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {["HIGH", "MEDIUM", "LOW", "NOT_SET"].map((p) => (
                    <button
                      key={p}
                      onClick={() => toggleSetValue(setPriorityFilter, p)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        priorityFilter.has(p)
                          ? "bg-primary text-white border-primary"
                          : "bg-surface-hover text-text-muted border-border hover:text-text-main"
                      }`}
                    >
                      {p === "NOT_SET" ? "Not set" : p.charAt(0) + p.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted block mb-2">
                  Automation
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["MANUAL", "Manual"],
                    ["TO_BE_AUTOMATED", "To automate"],
                    ["AUTOMATED", "Automated"],
                  ].map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => toggleSetValue(setAutomationFilter, v)}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                        automationFilter.has(v)
                          ? "bg-primary text-white border-primary"
                          : "bg-surface-hover text-text-muted border-border hover:text-text-main"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <ButtonLink
            href={`/projects/${projectCode}/cases/create${activeSuiteId ? `?suite=${activeSuiteId}` : ""}`}
            variant="primary"
            size="sm"
            className="min-w-[120px]"
            style={{ height: 36, borderRadius: 9, fontSize: 13 }}
          >
            <Plus size={16} /> New case
          </ButtonLink>
          
          {/* Options Dropdown */}
          <div className="relative group shrink-0">
            <button className="flex items-center justify-center h-[34px] w-[34px] bg-surface rounded-[9px] text-text-faint hover:text-text-main" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }}>
              <Settings size={16} />
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 qm-panel opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 bg-surface border border-border shadow-md rounded-[11px]">
              <div className="p-1 flex flex-col gap-0.5">
                <button
                  onClick={() => setIsBulkJiraModalOpen(true)}
                  className="flex items-center w-full px-3 py-2 text-[13px] text-text-main hover:bg-surface-hover rounded-lg text-left"
                >
                  <Ticket size={14} className="mr-2 text-text-muted" /> Impact
                </button>
                <button
                  onClick={() => setIsAiModalOpen(true)}
                  className="flex items-center w-full px-3 py-2 text-[13px] text-text-main hover:bg-surface-hover rounded-lg text-left"
                >
                  <Sparkles size={14} className="mr-2 text-text-muted" /> AI Gen
                </button>
                <button
                  onClick={handleExportQase}
                  className="flex items-center w-full px-3 py-2 text-[13px] text-text-main hover:bg-surface-hover rounded-lg text-left border-t border-border mt-1 pt-2"
                >
                  <Download size={14} className="mr-2 text-text-muted" /> Export Qase
                </button>
                <button
                  onClick={handleExportCsv}
                  className="flex items-center w-full px-3 py-2 text-[13px] text-text-main hover:bg-surface-hover rounded-lg text-left"
                >
                  <Download size={14} className="mr-2 text-text-muted" /> Export CSV
                </button>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center w-full px-3 py-2 text-[13px] text-text-main hover:bg-surface-hover rounded-lg text-left border-t border-border mt-1 pt-2"
                >
                  <Upload size={14} className="mr-2 text-text-muted" /> Import Qase
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Hierarchical Content */}
        <div className="flex-1 overflow-y-auto bg-background relative transition-colors flex flex-col min-w-0">
          <SuiteList
            suites={suites}
            cases={cases}
            activeSuiteId={activeSuiteId}
            projectCode={projectCode}
            activeCaseId={activeTestCaseId}
            onSelectCase={(tc: any) => {
              setDetailTab("general");
              setActiveTestCaseId(tc.id);
            }}
            searchQuery={searchQuery}
            searchScope={searchScope}
            priorityFilter={priorityFilter}
            automationFilter={automationFilter}
            onBulkEdit={role !== "VIEWER" ? handleBulkEdit : undefined}
            onBulkClone={role !== "VIEWER" ? handleBulkClone : undefined}
            onBulkRun={handleBulkRun}
            onBulkDelete={
              role !== "VIEWER" ? () => setConfirmBulkDelete(true) : undefined
            }
          />
        </div>
      </div>

      <AiGeneratorModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        projectCode={projectCode}
        suites={suites}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <BulkJiraImpactModal
        isOpen={isBulkJiraModalOpen}
        onClose={() => setIsBulkJiraModalOpen(false)}
        projectCode={projectCode}
        suites={suites}
        allCases={cases}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <CloneSuiteModal
        isOpen={isCloneCasesModalOpen}
        onClose={() => setIsCloneCasesModalOpen(false)}
        mode="cases"
        caseCount={selectedCases.size}
        allSuites={suites}
        projectCode={projectCode}
        onClone={executeBulkClone as any}
        isCloning={isCloningCases}
      />

      <ImportCasesModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        projectCode={projectCode}
        suites={suites}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <BulkEditModal
        isOpen={isBulkEditModalOpen}
        onClose={() => setIsBulkEditModalOpen(false)}
        count={selectedCases.size}
        suites={suites}
        onApply={executeBulkEdit}
        isSaving={isBulkEditing}
      />

      {/* Slide-over Detail Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[62vw] min-w-[720px] max-w-[1040px] bg-surface shadow-[var(--shadow-lg)] border-l transform transition-transform duration-200 ease-out z-[70] flex flex-col ${activeTestCaseId ? "translate-x-0" : "translate-x-full"}`}
        style={{ borderColor: "var(--border)" }}
      >
        {activeTestCase && (
          <>
            <header
              className="flex flex-col bg-surface shrink-0 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex items-start gap-[10px] px-[24px] pt-5 pb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="qm-mono text-[12px] text-text-faint">
                      {`${projectCode}-${activeTestCase.sequenceNumber || activeTestCase.id.substring(0, 4)}`}
                    </span>
                    {(() => {
                      const p = (activeTestCase.priority || "").toUpperCase();
                      if (p === "HIGH")
                        return <ChevronsUp size={16} className="text-danger" />;
                      if (p === "MEDIUM")
                        return <Minus size={16} className="text-warning" />;
                      if (p === "LOW")
                        return (
                          <ChevronDown size={16} className="text-text-faint" />
                        );
                      return null;
                    })()}
                    <button
                      onClick={() => {
                        const code = `${projectCode}-${activeTestCase.sequenceNumber || activeTestCase.id.substring(0, 4)}`;
                        navigator.clipboard?.writeText(code);
                        toast.success(`Copied ${code}`);
                      }}
                      title="Copy case ID"
                      className="text-text-faint hover:text-text-main transition-colors"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <div className="text-[21px] font-semibold tracking-[-0.015em] text-text-main mt-1 break-words leading-snug">
                    {activeTestCase.title}
                  </div>
                </div>
                <button
                  onClick={() => setActiveTestCaseId(null)}
                  className="text-text-faint hover:text-danger transition-colors shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex gap-[2px] px-[20px]">
                <button
                  onClick={() => setDetailTab("general")}
                  className={`px-[12px] pt-[10px] pb-2 text-[14px] border-b-2 -mb-px transition-colors ${detailTab === "general" ? "border-primary text-primary font-semibold" : "border-transparent text-text-muted hover:text-text-main font-medium"}`}
                >
                  General
                </button>
                <button
                  onClick={() => setDetailTab("defects")}
                  className={`px-[12px] pt-[10px] pb-2 text-[14px] border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${detailTab === "defects" ? "border-primary text-primary font-semibold" : "border-transparent text-text-muted hover:text-text-main font-medium"}`}
                >
                  Defects
                  {activeTestCase.linkedIssues?.length > 0 && (
                    <span className="text-[9.5px] font-bold bg-danger-soft text-danger px-[5px] rounded-full">
                      {activeTestCase.linkedIssues.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setDetailTab("comments")}
                  className={`px-[12px] pt-[10px] pb-2 text-[14px] border-b-2 -mb-px transition-colors ${detailTab === "comments" ? "border-primary text-primary font-semibold" : "border-transparent text-text-muted hover:text-text-main font-medium"}`}
                >
                  Comments
                </button>
                <button
                  onClick={() => setDetailTab("history")}
                  className={`px-[12px] pt-[10px] pb-2 text-[14px] border-b-2 -mb-px transition-colors ${detailTab === "history" ? "border-primary text-primary font-semibold" : "border-transparent text-text-muted hover:text-text-main font-medium"}`}
                >
                  History
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-surface px-[24px] py-5 space-y-4">
              {detailTab === "general" && (
              <>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <div className="text-[12.5px] text-text-faint mb-1">
                    Priority
                  </div>
                  <span className="inline-flex items-center gap-[5px] text-[13.5px] font-semibold text-text-main">
                    {(() => {
                      const p = (activeTestCase.priority || "").toUpperCase();
                      if (p === "HIGH")
                        return (
                          <>
                            <ChevronsUp size={16} className="text-danger" />
                            High
                          </>
                        );
                      if (p === "MEDIUM")
                        return (
                          <>
                            <Minus size={16} className="text-warning" />
                            Medium
                          </>
                        );
                      if (p === "LOW")
                        return (
                          <>
                            <ChevronDown size={16} className="text-text-faint" />
                            Low
                          </>
                        );
                      return <span className="text-text-muted">Not set</span>;
                    })()}
                  </span>
                </div>
                <div>
                  <div className="text-[12.5px] text-text-faint mb-1">Type</div>
                  <span className="text-[12.5px] font-medium text-text-main">
                    {activeTestCase.type
                      ? activeTestCase.type.charAt(0) +
                        activeTestCase.type.slice(1).toLowerCase()
                      : "Functional"}
                  </span>
                </div>
                <div>
                  <div className="text-[12.5px] text-text-faint mb-1">
                    Automation
                  </div>
                  <span className="text-[12.5px] font-medium text-text-main">
                    {activeTestCase.automationStatus === "AUTOMATED"
                      ? "Automated"
                      : activeTestCase.automationStatus === "TO_BE_AUTOMATED"
                        ? "To automate"
                        : "Manual"}
                  </span>
                </div>
                <div>
                  <div className="text-[12.5px] text-text-faint mb-1">Owner</div>
                  <div className="flex items-center gap-[6px]">
                    <div className="w-5 h-5 rounded-full bg-primary-light text-primary flex items-center justify-center text-[9px] font-bold">
                      {(activeTestCase.author?.name ||
                        activeTestCase.author?.email ||
                        "U")
                        .substring(0, 2)
                        .toUpperCase()}
                    </div>
                    <span className="text-[12.5px] text-text-main">
                      {activeTestCase.author?.name ||
                        activeTestCase.author?.email?.split("@")[0] ||
                        "Unassigned"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Provenance — who wrote this case and when it last moved. */}
              <div className="flex flex-wrap items-center gap-x-[18px] gap-y-[4px] text-[12.5px] text-text-faint border-t border-border pt-[12px]">
                <span className="inline-flex items-center gap-[6px]">
                  <Plus size={13} />
                  Created {formatThaiTime(activeTestCase.createdAt)}
                  {activeTestCase.author && (
                    <>
                      {" by "}
                      <span className="text-text-muted font-medium">
                        {activeTestCase.author.name ||
                          activeTestCase.author.email?.split("@")[0]}
                      </span>
                    </>
                  )}
                </span>
                {activeTestCase.updatedAt &&
                  activeTestCase.updatedAt !== activeTestCase.createdAt && (
                    <span className="inline-flex items-center gap-[6px]">
                      <Edit3 size={13} />
                      Updated {formatThaiTime(activeTestCase.updatedAt)}
                    </span>
                  )}
              </div>
              {activeTestCase.tags?.length > 0 && (
                <div>
                  <div className="text-[11px] text-text-faint mb-[6px]">Tags</div>
                  <div className="flex gap-[6px] flex-wrap">
                    {activeTestCase.tags.map((t: any) => (
                      <span
                        key={t.id || t.name}
                        className="text-[11px] font-semibold px-[9px] py-[3px] rounded-[7px] bg-surface-hover text-text-muted"
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {activeTestCase.isOutdated && (
                <div className="bg-warning-soft border border-warning/25 p-4 rounded-xl flex flex-col space-y-3 shadow-sm mb-4">
                  <div className="flex items-start">
                    <AlertTriangle
                      size={20}
                      className="text-warning mr-2 shrink-0 mt-0.5"
                    />
                    <div>
                      <h4 className="text-sm font-bold text-warning-foreground">
                        Requirement Changed
                      </h4>
                      <p className="text-xs text-warning-foreground mt-1">
                        The requirement linked to this test case has been
                        updated. The steps may be outdated.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsImpactModalOpen(true)}
                    className="self-start flex items-center bg-warning-soft hover:bg-warning/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Sparkles size={14} className="mr-1.5" /> Analyze Impact
                    with AI
                  </button>
                </div>
              )}
              <div className="bg-surface p-5 rounded-2xl border border-border/80 shadow-sm">
                <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Description
                </h3>
                <div className="text-sm text-text-main leading-relaxed">
                  {activeTestCase.description || (
                    <span className="text-text-muted italic">Not set</span>
                  )}
                </div>
              </div>

              <div className="bg-surface p-5 rounded-2xl border border-border/80 shadow-sm">
                <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Pre-conditions
                </h3>
                <div className="text-sm text-text-main leading-relaxed whitespace-pre-wrap break-words">
                  {activeTestCase.preconditions ? (
                    activeTestCase.preconditions
                  ) : (
                    <span className="text-text-muted italic">Not set</span>
                  )}
                </div>
              </div>

              <div className="bg-surface p-5 rounded-2xl border border-border/80 shadow-sm">
                <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider mb-2">
                  Post-conditions
                </h3>
                <div className="text-sm text-text-main leading-relaxed whitespace-pre-wrap break-words">
                  {activeTestCase.postconditions ? (
                    activeTestCase.postconditions
                  ) : (
                    <span className="text-text-muted italic">Not set</span>
                  )}
                </div>
              </div>

              {activeTestCase.customFields &&
                Object.keys(activeTestCase.customFields).length > 0 && (
                  <div className="bg-surface p-5 rounded-2xl border border-border/80 shadow-sm">
                    <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider mb-4">
                      Custom Fields
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(activeTestCase.customFields).map(
                        ([fieldId, value]) => {
                          if (!value || (typeof value === "boolean" && !value))
                            return null;
                          const fieldDef = customFieldsDef.find(
                            (f) => f.id === fieldId,
                          );
                          const label = fieldDef ? fieldDef.name : fieldId;
                          return (
                            <div key={fieldId}>
                              <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1">
                                {label}
                              </div>
                              <div className="text-sm text-text-main font-medium">
                                {typeof value === "boolean"
                                  ? "Yes"
                                  : String(value)}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  </div>
                )}

              <div className="bg-surface p-5 rounded-2xl border border-border/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider">
                    Steps
                  </h3>
                  <button
                    onClick={() =>
                      router.push(
                        `/projects/${projectCode}/cases/${activeTestCase.id}/edit`,
                      )
                    }
                    className="text-primary hover:text-primary-hover text-xs font-bold flex items-center transition-colors"
                  >
                    <Edit3 size={12} className="mr-1" /> Edit
                  </button>
                </div>

                {activeTestCase.steps && activeTestCase.steps.length > 0 ? (
                  <div className="space-y-4">
                    {activeTestCase.steps.map((step: any, idx: number) => (
                      <div key={step.id || idx} className="flex">
                        <div className="w-8 shrink-0 flex justify-center mt-0.5">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[11px] shadow-sm"
                            style={{
                              background:
                                "var(--primary)",
                            }}
                          >
                            {idx + 1}
                          </div>
                        </div>
                        <div className="flex-1 ml-2 text-sm text-text-main whitespace-pre-wrap leading-relaxed">
                          {step.action}
                          {step.expectedResult && (
                            <div className="mt-2 text-[13px] bg-surface-hover border border-border rounded-lg pl-3 pr-3 py-2 text-text-main">
                              <span className="font-bold text-success-foreground">
                                Expected:{" "}
                              </span>
                              {step.expectedResult}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-text-muted italic">Not set</div>
                )}
              </div>

              <TestCaseAutomationPanel
                testCase={activeTestCase}
                projectCode={projectCode}
                onUpdate={() => window.location.reload()}
              />
              </>
              )}

              {detailTab === "defects" &&
                (activeTestCase.linkedIssues &&
                activeTestCase.linkedIssues.length > 0 ? (
                  <div className="bg-surface p-5 rounded-xl border border-border shadow-sm">
                    <h3 className="text-[12px] font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Ticket size={12} className="text-danger" /> Linked
                      Defects ({activeTestCase.linkedIssues.length})
                    </h3>
                    <div className="space-y-2">
                      {activeTestCase.linkedIssues.map((iss: any) => (
                        <a
                          key={iss.id}
                          href={iss.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-danger/25 hover:bg-danger-soft transition-colors group"
                        >
                          <span className="text-[10px] font-extrabold text-danger bg-danger-soft border border-danger/15 px-2 py-0.5 rounded shrink-0">
                            {iss.key}
                          </span>
                          <span className="flex-1 text-sm text-text-main truncate">
                            {iss.summary}
                          </span>
                          {iss.severity && (
                            <span className="text-[10px] font-bold text-text-muted uppercase shrink-0">
                              {iss.severity}
                            </span>
                          )}
                          <ExternalLink
                            size={13}
                            className="text-text-faint group-hover:text-danger shrink-0"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Ticket size={28} className="text-text-faint mb-3" />
                    <p className="text-sm font-semibold text-text-muted">
                      No linked defects
                    </p>
                    <p className="text-xs text-text-muted mt-1 max-w-xs">
                      Defects reported during a run and linked to this case will
                      appear here.
                    </p>
                  </div>
                ))}

              {detailTab === "comments" && activeTestCaseId && (
                <CommentThread
                  endpoint={`/api/projects/${projectCode}/cases/${activeTestCaseId}/comments`}
                />
              )}

              {detailTab === "history" &&
                (historyLoading ? (
                  <div className="flex items-center justify-center py-16 text-sm text-text-muted">
                    <Loader2 size={16} className="animate-spin mr-2" /> Loading
                    history…
                  </div>
                ) : history.length === 0 && changes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <PlayCircle size={28} className="text-text-faint mb-3" />
                    <p className="text-sm font-semibold text-text-muted">
                      No history yet
                    </p>
                    <p className="text-xs text-text-muted mt-1 max-w-xs">
                      No edits or test-run executions recorded for this case.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {changes.length > 0 && (
                      <div>
                        <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted mb-2">
                          Changes
                        </h4>
                        <div className="space-y-2">
                          {changes.map((ch: any) => {
                            const FIELD_LABELS: Record<string, string> = {
                              title: "Title",
                              description: "Description",
                              preconditions: "Preconditions",
                              postconditions: "Postconditions",
                              priority: "Priority",
                              severity: "Severity",
                              automationStatus: "Automation",
                              suiteId: "Suite",
                              requirementText: "Requirement",
                              steps: "Steps",
                            };
                            const who =
                              ch.user?.name ||
                              ch.user?.email?.split("@")[0] ||
                              "Someone";
                            const labels = (ch.fields || []).map(
                              (f: string) => FIELD_LABELS[f] || f,
                            );
                            return (
                              <div
                                key={ch.id}
                                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-surface-hover/40"
                              >
                                <Edit3
                                  size={14}
                                  className="text-primary shrink-0 mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text-main">
                                    <span className="font-semibold">{who}</span>{" "}
                                    {ch.action === "CREATED"
                                      ? "created this case"
                                      : labels.length > 0
                                        ? `updated ${labels.join(", ")}`
                                        : "updated this case"}
                                  </p>
                                  <p className="text-[11px] text-text-muted mt-0.5">
                                    {new Date(ch.createdAt).toLocaleString(
                                      "en-GB",
                                      {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {history.length > 0 && (
                      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted mb-2">
                        Execution history
                      </h4>
                    )}
                    <div className="space-y-2">
                    {history.map((h: any) => {
                      const meta =
                        {
                          PASSED: { c: "#10b981", l: "Passed" },
                          FAILED: { c: "#ef4444", l: "Failed" },
                          BLOCKED: { c: "#f59e0b", l: "Blocked" },
                          SKIPPED: { c: "#94a3b8", l: "Skipped" },
                          INVALID: { c: "#8b5cf6", l: "Invalid" },
                          IN_PROGRESS: { c: "#cbd5e1", l: "Untested" },
                        }[h.status as string] || {
                          c: "#cbd5e1",
                          l: h.status,
                        };
                      return (
                        <a
                          key={h.id}
                          href={`/projects/${projectCode}/runs/${h.testRun?.id}`}
                          className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/25 hover:bg-primary-light/40 transition-colors"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: meta.c }}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-text-main truncate">
                              {h.testRun?.title || "Run"}
                            </span>
                            <span className="block text-[11px] text-text-muted">
                              {new Date(h.createdAt).toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {h.assignee
                                ? ` · ${h.assignee.name || h.assignee.email?.split("@")[0]}`
                                : ""}
                            </span>
                          </span>
                          <span
                            className="text-[11px] font-bold shrink-0"
                            style={{ color: meta.c }}
                          >
                            {meta.l}
                          </span>
                        </a>
                      );
                    })}
                    </div>
                  </div>
                ))}
            </div>

            <div
              className="mt-auto flex gap-[9px] px-[18px] py-[14px] border-t bg-surface shrink-0"
              style={{ borderColor: "var(--border)" }}
            >
              <Button
                variant="primary"
                size="sm"
                fullWidth
                onClick={() =>
                  router.push(
                    `/projects/${projectCode}/cases/${activeTestCase.id}/edit`,
                  )
                }
                style={{ height: 36, borderRadius: 9, fontSize: 13 }}
              >
                <Edit3 size={15} /> Edit case
              </Button>
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={handleBulkRunSingle}
                style={{ height: 36, borderRadius: 9, fontSize: 13 }}
              >
                <PlayCircle size={15} /> Run
              </Button>
            </div>
          </>
        )}
      </div>

      <AiImpactModal
        isOpen={isImpactModalOpen}
        onClose={() => setIsImpactModalOpen(false)}
        projectCode={projectCode}
        testCase={activeTestCase || {}}
        onSuccess={() => {
          router.refresh();
        }}
      />

      {/* Backdrop for sliding panel */}
      {activeTestCaseId && (
        <div
          className="fixed inset-0 bg-[color:var(--overlay)] z-[60] transition-opacity"
          onClick={() => setActiveTestCaseId(null)}
        />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={`Delete ${selectedCases.size} test case${selectedCases.size > 1 ? "s" : ""}`}
          message="Selected test cases will be permanently deleted. This action cannot be undone."
          onConfirm={() => {
            setConfirmBulkDelete(false);
            handleBulkDelete();
          }}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
      {confirmSync && (
        <ConfirmDialog
          title="Sync to GitHub"
          message="This will export all automated test cases to a single GitHub Pull Request. Continue?"
          confirmLabel="Sync"
          variant="warning"
          onConfirm={() => {
            setConfirmSync(false);
            handleSyncAll();
          }}
          onCancel={() => setConfirmSync(false)}
        />
      )}
      {confirmDeleteCase && activeTestCase && (
        <ConfirmDialog
          title="Delete test case"
          message={`"${activeTestCase.title}" will be permanently deleted. This action cannot be undone.`}
          onConfirm={() => {
            setConfirmDeleteCase(false);
            handleDeleteActiveCase();
          }}
          onCancel={() => setConfirmDeleteCase(false)}
        />
      )}
    </>
  );
}
