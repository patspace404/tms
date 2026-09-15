"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  RotateCcw,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronsUp,
  ChevronDown as ChevronDownIcon,
  Minus,
  Clock,
  X,
  Share,
  MoreVertical,
  MoreHorizontal,
  Loader2,
  Terminal,
  BarChart2,
  FileText,
  Bug,
  Search,
  SlidersHorizontal,
  Image as ImageIcon,
  Ban,
  SkipForward,
  Circle,
  GitBranch,
  Play,
  MessageSquare,
  Bot,
  Hand,
  UserCircle2,
  Edit,
} from "lucide-react";
import { ReportBugModal } from "./ReportBugModal";
import { toast } from "sonner";
import { MAX_UPLOAD_BYTES, tooLargeMessage } from "@/lib/upload-limits";
import { isDocumentUrl, isVideoUrl } from "@/lib/attachment-kind";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { createRoot } from "react-dom/client";
import { PdfReportTemplate } from "./PdfReportTemplate";
import { Button } from "@/components/ui/Button";
import { formatThaiTime } from "@/lib/utils";
import { displayNameOf, initialsOf } from "@/lib/initials";

const AVATAR_COLORS = [
  "#4f46e5",
  "#7c3aed",
  "#0891b2",
  "#059669",
  "#d97706",
  "#e11d48",
  "#0284c7",
  "#9333ea",
];
function userMeta(
  user: { name?: string | null; email?: string | null } | null | undefined,
) {
  const display = displayNameOf(user?.name, user?.email);
  const initials = initialsOf(user?.name, user?.email);
  let sum = 0;
  for (let i = 0; i < display.length; i++) sum += display.charCodeAt(i);
  return {
    display,
    initials,
    color: AVATAR_COLORS[sum % AVATAR_COLORS.length],
  };
}
function formatRunDuration(ms: number) {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function renderPriorityIcon(priority?: string) {
  const p = (priority || "MEDIUM").toUpperCase();
  if (["HIGH", "CRITICAL"].includes(p)) {
    return (
      <svg
        className="w-3 h-3 text-danger shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <title>{`Priority: ${priority || "High"}`}</title>
        <line x1="12" y1="19" x2="12" y2="5"></line>
        <polyline points="5 12 12 5 19 12"></polyline>
      </svg>
    );
  }
  if (["LOW", "TRIVIAL"].includes(p)) {
    return (
      <svg
        className="w-3 h-3 text-success shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      >
        <title>{`Priority: ${priority || "Low"}`}</title>
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <polyline points="19 12 12 19 5 12"></polyline>
      </svg>
    );
  }
  return (
    <svg
      className="w-2.5 h-2.5 text-text-faint shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
    >
      <title>{`Priority: ${priority || "Medium"}`}</title>
      <circle cx="12" cy="12" r="10"></circle>
    </svg>
  );
}

interface RunExecutionClientProps {
  run: any;
  suites: any[];
  projectCode: string;
  runId: string;
}

// Shared column template for the case table (mirrors Qase's dense run table):
// status · priority · type · ID · MEMBER · STATUS · TITLE · DURATION · menu
const ROW_GRID =
  "24px 20px 20px 78px 176px 116px minmax(0,1fr) 132px 92px 30px";

/**
 * Compact stamp for the run table — "07 Aug 17:11". Year is noise in a column.
 *
 * Pinned to Asia/Bangkok like formatThaiTime: reading the viewer's local zone
 * makes the server and browser render different text and React fails hydration.
 */
function formatShortStamp(value?: string | Date | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// ── Status visual map (lucide icon + real design tokens) ──
// Maps the design's --pass/--fail/--warn/--skip onto the app's
// --success/--danger/--warning/--skip tokens.
type StatusVisual = {
  Icon: React.ComponentType<any>;
  color: string;
  soft: string;
  label: string;
};
function statusVisual(status?: string): StatusVisual {
  switch (status) {
    case "PASSED":
      return { Icon: CheckCircle2, color: "var(--success)", soft: "var(--success-soft)", label: "Pass" };
    case "FAILED":
      return { Icon: XCircle, color: "var(--danger)", soft: "var(--danger-soft)", label: "Fail" };
    case "BLOCKED":
      return { Icon: Ban, color: "var(--warning)", soft: "var(--warning-soft)", label: "Block" };
    case "SKIPPED":
      return { Icon: SkipForward, color: "var(--skip)", soft: "var(--skip-soft)", label: "Skip" };
    default:
      return { Icon: Circle, color: "var(--text-faint)", soft: "transparent", label: "—" };
  }
}
function priorityVisual(priority?: string) {
  const p = (priority || "MEDIUM").toUpperCase();
  if (p === "HIGH" || p === "CRITICAL")
    return { Icon: ChevronsUp, color: "var(--danger)", soft: "var(--danger-soft)", label: "High" };
  if (p === "LOW" || p === "TRIVIAL")
    return { Icon: ChevronDownIcon, color: "var(--text-faint)", soft: "var(--surface-2, var(--bg-surface-hover))", label: "Low" };
  return { Icon: Minus, color: "var(--warning)", soft: "var(--warning-soft)", label: "Medium" };
}

function ResultRow({
  result,
  depth,
  isSelected,
  isDetailsOpen,
  openResult,
  projectCode,
  runId,
  onDelete,
  onUpdateAssignee,
  onAssignClick,
  currentUser,
}: any) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const st = statusVisual(result.status);
  const pri = priorityVisual(result.testCase.priority);

  const handleAssignToMe = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!currentUser?.id) return;
    onUpdateAssignee(result.id, { id: currentUser.id, name: currentUser.name, email: currentUser.email });
    fetch(`/api/runs/${runId}/results/${result.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: currentUser.id }) });
  };
  const handleUnassign = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUpdateAssignee(result.id, null);
    fetch(`/api/runs/${runId}/results/${result.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: null }) });
  };
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!confirm("Are you sure?")) return;
    onDelete(result.id);
    fetch(`/api/runs/${runId}/results/${result.id}`, { method: "DELETE" });
  };
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    router.push(`/projects/${projectCode}/cases/${result.testCase.id}/edit`);
  };

  const leftPadding = depth * 16 + 14;
  const isAutomated =
    (result.testCase.automationStatus || "").toUpperCase() === "AUTOMATED";
  const assignee = result.assigneeId ? userMeta(result.assignee) : null;

  return (
    <div
      onClick={() => openResult(result)}
      className="grid gap-[12px] items-center border-b border-border transition-colors cursor-pointer relative group hover:bg-surface-hover/70"
      style={{
        gridTemplateColumns: ROW_GRID,
        padding: `9px 16px 9px ${leftPadding}px`,
        background: isSelected ? "var(--primary-light)" : "transparent",
        boxShadow: isSelected ? "inset 3px 0 0 var(--primary)" : "none"
      }}
    >
      <st.Icon size={18} className="shrink-0" style={{ color: st.color } as any} />

      <pri.Icon size={17} className="shrink-0" style={{ color: pri.color } as any} />

      <span className="shrink-0 text-text-faint" title={isAutomated ? "Automated" : "Manual"}>
        {isAutomated ? <Bot size={16} /> : <Hand size={16} />}
      </span>

      <span className="qm-mono text-[12.5px] text-text-faint tabular-nums truncate">
        {projectCode}-{result.testCase.sequenceNumber || result.testCase.id.substring(0, 4).toUpperCase()}
      </span>

      <span className="flex items-center gap-[7px] min-w-0">
        {assignee ? (
          <>
            <span className="w-[22px] h-[22px] shrink-0 rounded-full text-[10px] text-white flex items-center justify-center font-bold" style={{ background: assignee.color }}>
              {assignee.initials}
            </span>
            <span className="text-[13.5px] text-text-main truncate">{assignee.display}</span>
          </>
        ) : (
          <>
            <UserCircle2 size={20} className="shrink-0 text-text-faint" />
            <span className="text-[13.5px] text-text-faint truncate">Unassigned</span>
          </>
        )}
      </span>

      <span
        className="justify-self-start inline-flex items-center text-[12px] font-bold px-[9px] py-[3px] rounded-[6px] whitespace-nowrap"
        style={
          result.status && result.status !== "IN_PROGRESS"
            ? { background: st.soft, color: st.color }
            : { background: "var(--surface-hover)", color: "var(--text-faint)" }
        }
      >
        {result.status && result.status !== "IN_PROGRESS" ? st.label : "Untested"}
      </span>

      <span
        className="text-[14px] truncate text-text-main"
        style={{ fontWeight: isSelected ? "600" : "500" }}
        title={result.testCase.title}
      >
        {result.testCase.title}
      </span>

      <span
        className="text-[12.5px] text-text-faint tabular-nums whitespace-nowrap truncate"
        title={
          result.executedAt
            ? `${formatThaiTime(result.executedAt)}${
                result.executedBy
                  ? ` by ${result.executedBy.name || result.executedBy.email}`
                  : ""
              }`
            : undefined
        }
      >
        {formatShortStamp(result.executedAt) ?? "—"}
      </span>

      <span className="flex items-center gap-[5px] text-[12.5px] text-text-faint tabular-nums whitespace-nowrap">
        <Clock size={13} />
        {formatRunDuration(result.timeSpent || 0)}
      </span>

      <div className="relative justify-self-end" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="text-text-faint hover:text-text-main flex items-center justify-center w-[24px] h-[24px] rounded opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 bg-surface border border-border shadow-md z-50 py-1 rounded">
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); openResult(result); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover">Run wizard</button>
            <button onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onAssignClick(result.id); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover">Assign</button>
            <button onClick={handleAssignToMe} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover">Assign to me</button>
            <button onClick={handleUnassign} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover">Unassign</button>
            <div className="h-px bg-border my-1"></div>
            <button onClick={handleEdit} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover">Edit case</button>
            <div className="h-px bg-border my-1"></div>
            <button onClick={handleDelete} className="w-full text-left px-4 py-2 text-[13px] text-danger hover:bg-danger-soft">Delete</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Column header strip shown above a suite's cases (like Qase's run table).
function CaseTableHeader({ depth }: { depth: number }) {
  return (
    <div
      className="grid gap-[12px] items-center bg-surface-hover/40 border-b border-border text-[11.5px] font-semibold tracking-[0.05em] uppercase text-text-faint select-none"
      style={{ gridTemplateColumns: ROW_GRID, padding: `7px 16px 7px ${depth * 16 + 14}px` }}
    >
      <div /><div /><div />
      <div>ID</div>
      <div>Member</div>
      <div>Status</div>
      <div>Title</div>
      <div>Tested</div>
      <div>Duration</div>
      <div />
    </div>
  );
}

// Editable comment/notes box for a run result. Testers write bug notes here
// (e.g. why a case failed) — persisted to TestRunResult.comment via PATCH.
function ResultCommentBox({
  result,
  onSave,
}: {
  result: any;
  onSave: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string>(result.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset the draft whenever a different case is opened
  useEffect(() => {
    setDraft(result.comment || "");
    setSaved(false);
  }, [result.id]);

  const dirty = draft !== (result.comment || "");

  return (
    <div className="mt-[16px] bg-surface border border-border rounded-[12px] p-[14px] shadow-sm">
      <div className="flex items-center justify-between mb-[10px]">
        <div className="flex items-center gap-[7px] font-semibold text-[13px]">
          <MessageSquare size={17} className="text-text-faint" />
          Comment / Notes
        </div>
        {saved && !dirty && (
          <span className="text-[11px] text-success font-semibold">Saved ✓</span>
        )}
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setSaved(false);
        }}
        placeholder="Add a note for this case — e.g. why it failed, repro steps, or a bug summary…"
        className="w-full min-h-[90px] resize-y bg-surface-hover border border-border rounded-[9px] px-[12px] py-[10px] text-[12.5px] leading-[1.6] text-text-main outline-none focus:border-primary transition-colors placeholder:text-text-faint"
      />
      <div className="flex justify-end mt-[10px]">
        <Button
          size="sm"
          variant="secondary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(draft);
              setSaved(true);
            } finally {
              setSaving(false);
            }
          }}
        >
          Save note
        </Button>
      </div>
    </div>
  );
}

export default function RunExecutionClient({
  run: initialRun,
  suites,
  projectCode,
  runId,
}: RunExecutionClientProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUser = session?.user as
    | { id?: string; name?: string | null; email?: string | null }
    | undefined;
  const [run, setRun] = useState(initialRun);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const [reportingResult, setReportingResult] = useState<any | null>(null);
  const [stepResults, setStepResults] = useState<Record<string, any>>({});
  const [uploadingStepId, setUploadingStepId] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{
    url: string;
    name: string;
    isTrace?: boolean;
  } | null>(null);

  // Escape closes the fullscreen viewer. Without it the only exits are the ✕
  // and the thin strip of backdrop around the content, which is easy to miss —
  // and left the viewer feeling stuck when the ✕ itself was unreachable.
  React.useEffect(() => {
    if (!viewingAttachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewingAttachment(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewingAttachment]);
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>(
    {},
  );

  const [isExecutingAutomated, setIsExecutingAutomated] = useState(false);
  const [automationLogs, setAutomationLogs] = useState("");

  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isPublicLinkOn, setIsPublicLinkOn] = useState(
    initialRun.isPublic || false,
  );
  const [isTogglingLink, setIsTogglingLink] = useState(false);

  const togglePublicLink = async () => {
    setIsTogglingLink(true);
    try {
      const newState = !isPublicLinkOn;
      const res = await fetch(
        `/api/projects/${projectCode}/runs/${runId}/share`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isPublic: newState }),
        },
      );
      if (!res.ok) throw new Error("Failed to update public link status");
      setIsPublicLinkOn(newState);
      toast.success(`Public link ${newState ? "enabled" : "disabled"}!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to toggle public link");
    } finally {
      setIsTogglingLink(false);
    }
  };

  const handleCopyPublicLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(
        `${window.location.origin}/report/${runId}`,
      );
      toast.success("Public link copied to clipboard!");
    }
  };
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const mainMenuRef = React.useRef<HTMLDivElement>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningResultId, setAssigningResultId] = useState<string | null>(
    null,
  );
  const [projectMembers, setProjectMembers] = useState<any[]>([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>("");

  React.useEffect(() => {
    fetch(`/api/projects/${projectCode}/members`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setProjectMembers(data);
      })
      .catch(console.error);
  }, [projectCode]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mainMenuRef.current &&
        !mainMenuRef.current.contains(event.target as Node)
      ) {
        setMainMenuOpen(false);
      }
    };
    if (mainMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mainMenuOpen]);

  React.useEffect(() => {
    if (run?.status !== "ACTIVE") return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (res.ok) {
          const freshRun = await res.json();
          // Update the run state silently
          setRun(freshRun);
        }
      } catch (err) {
        console.error("Polling error", err);
      }
    }, 5000); // poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [run?.status, runId]);

  // The run opens on the full case list; the detail drawer only opens on click.

  const handleAssignClick = (resultId: string) => {
    setAssigningResultId(resultId);
    setIsAssignModalOpen(true);
  };

  const submitAssignee = async () => {
    if (!assigningResultId || !selectedAssigneeId) return;

    // Optimistic Update
    const updatedResults = run.results.map((r: any) =>
      r.id === assigningResultId ? { ...r, assigneeId: selectedAssigneeId } : r,
    );
    setRun({ ...run, results: updatedResults });
    setIsAssignModalOpen(false);

    try {
      await fetch(`/api/runs/${runId}/results/${assigningResultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: selectedAssigneeId }),
      });
    } catch (err) {
      console.error(err);
    }
  };
  const handleOpenWizard = () => {
    // Find the first untested or failed result
    const firstResult =
      run.results.find(
        (r: any) => r.status === "IN_PROGRESS" || r.status === "FAILED",
      ) || run.results[0];
    if (firstResult) {
      openResult(firstResult);
    }
  };

  const handleCompleteRun = async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to complete run");
      }
      setIsCompleteModalOpen(false);
      router.push(`/projects/${projectCode}/runs`);
      router.refresh();
      toast.success("Run completed successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Error completing run: " + e);
    }
  };

  const [isReopening, setIsReopening] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const handleAbortRun = async () => {
    setIsAborting(true);
    try {
      const res = await fetch(`/api/runs/${runId}/abort`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to abort run");
      }
      toast.success("Run aborted");
      router.refresh();
    } catch (e: any) {
      toast.error("Error aborting run: " + (e.message || e));
    } finally {
      setIsAborting(false);
    }
  };

  const handleReopenRun = async () => {
    setIsReopening(true);
    try {
      const res = await fetch(`/api/runs/${runId}/reopen`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reopen run");
      }
      toast.success("Run reopened");
      router.refresh();
    } catch (e: any) {
      toast.error("Error reopening run: " + (e.message || e));
    } finally {
      setIsReopening(false);
    }
  };

  const [isRerunning, setIsRerunning] = useState(false);
  const failedCount = run.results.filter(
    (r: any) => r.status === "FAILED" || r.status === "BLOCKED",
  ).length;
  const handleRerunFailed = async () => {
    setIsRerunning(true);
    try {
      const res = await fetch(`/api/runs/${runId}/rerun`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to re-run");
      toast.success("Created re-run of failed cases");
      router.push(`/projects/${projectCode}/runs/${data.run.id}`);
      router.refresh();
    } catch (e: any) {
      toast.error("Error re-running: " + (e.message || e));
    } finally {
      setIsRerunning(false);
      setMainMenuOpen(false);
    }
  };

  const handleRunAutomation = async () => {
    if (!activeResultId) return;
    setIsExecutingAutomated(true);
    setAutomationLogs("Initializing Playwright Engine...\n");

    const currentResult = run.results.find((r: any) => r.id === activeResultId);
    if (!currentResult || !currentResult.testCase.automationScript) {
      setAutomationLogs("Error: No automation script found.\n");
      setIsExecutingAutomated(false);
      return;
    }

    try {
      setAutomationLogs((prev) => prev + "Running npx playwright test...\n\n");
      const res = await fetch(
        `/api/projects/${projectCode}/runs/${runId}/results/${activeResultId}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script: currentResult.testCase.automationScript,
          }),
        },
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute script");

      setAutomationLogs(data.logs);

      // Optimistically update status
      const newStatus = data.passed ? "PASSED" : "FAILED";
      updateResult(activeResultId, newStatus);
    } catch (err: any) {
      setAutomationLogs((prev) => prev + `\nExecution Failed: ${err.message}`);
    } finally {
      setIsExecutingAutomated(false);
    }
  };
  const [isExecutingAllAutomated, setIsExecutingAllAutomated] = useState(false);
  const [automatedProgress, setAutomatedProgress] = useState({
    current: 0,
    total: 0,
  });

  const handleRunAllAutomated = async () => {
    const automatedResults = run.results.filter(
      (r: any) =>
        r.testCase?.automationStatus === "AUTOMATED" &&
        r.testCase?.automationScript,
    );

    if (automatedResults.length === 0) {
      toast.error("No automated test cases with scripts found in this run.");
      return;
    }

    setIsExecutingAllAutomated(true);
    setAutomatedProgress({ current: 0, total: automatedResults.length });

    // Sequentially execute
    for (let i = 0; i < automatedResults.length; i++) {
      const currentResult = automatedResults[i];
      setAutomatedProgress({ current: i + 1, total: automatedResults.length });

      // Navigate UI to the currently running case so they can see logs stream
      openResult(currentResult);

      // We also set the automationLogs to indicate starting
      setIsExecutingAutomated(true);
      setAutomationLogs(
        `Bulk Execution (${i + 1}/${automatedResults.length}): Starting Playwright...\n`,
      );

      try {
        const res = await fetch(
          `/api/projects/${projectCode}/runs/${runId}/results/${currentResult.id}/execute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              script: currentResult.testCase.automationScript,
            }),
          },
        );

        const data = await res.json();
        if (data.logs) {
          setAutomationLogs(data.logs);
        }

        if (data.passed !== undefined) {
          // We need to fetch the updated run result to get the new history, or just refresh the page.
          // For now, optimistically update the status.
          updateResult(currentResult.id, data.passed ? "PASSED" : "FAILED");

          // Fetch the fresh result to update history locally
          const freshRes = await fetch(
            `/api/runs/${runId}/results/${currentResult.id}`,
          );
          if (freshRes.ok) {
            const freshResult = await freshRes.json();
            setRun((prev: any) => {
              const updated = prev.results.map((r: any) =>
                r.id === currentResult.id ? freshResult : r,
              );
              return { ...prev, results: updated };
            });
          }
        }
      } catch (err: any) {
        setAutomationLogs(`Error executing test: ${err.message}`);
      } finally {
        setIsExecutingAutomated(false);
      }
    }

    setIsExecutingAllAutomated(false);
  };
  const [isTriggeringGitHub, setIsTriggeringGitHub] = useState(false);

  const handleTriggerGitHub = async () => {
    if (
      !confirm(
        "This will trigger the GitHub Actions workflow to run all automated tests in this run. Proceed?",
      )
    )
      return;

    setIsTriggeringGitHub(true);

    // Optimistic UI update: Set to ACTIVE and IN_PROGRESS
    const updatedResults = run.results.map((r: any) =>
      r.testCase.automationStatus === "AUTOMATED"
        ? { ...r, status: "IN_PROGRESS", comment: null }
        : r,
    );
    setRun({ ...run, status: "ACTIVE", results: updatedResults });

    try {
      const res = await fetch(
        `/api/projects/${projectCode}/runs/${runId}/github/dispatch`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to trigger GitHub Actions");
    } catch (err: any) {
      toast.error(`Error triggering GitHub: ${err.message}`);
    } finally {
      setIsTriggeringGitHub(false);
    }
  };

  // Tree computation
  const { roots, childrenMap } = useMemo(() => {
    const cMap = new Map<string, any[]>();
    const rootList: any[] = [];
    suites.forEach((suite) => cMap.set(suite.id, []));
    suites.forEach((suite) => {
      if (suite.parentId && cMap.has(suite.parentId)) {
        cMap.get(suite.parentId)!.push(suite);
      } else {
        rootList.push(suite);
      }
    });
    return { roots: rootList, childrenMap: cMap };
  }, [suites]);

  const resultsBySuiteId = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const grouped = new Map<string, any[]>();
    run.results.forEach((r: any) => {
      if (q) {
        const title = (r.testCase?.title || "").toLowerCase();
        const code =
          `${projectCode}-${r.testCase?.sequenceNumber || r.testCase?.id?.substring(0, 4) || ""}`.toLowerCase();
        if (!title.includes(q) && !code.includes(q)) return;
      }
      if (statusFilter && r.status !== statusFilter) {
        return;
      }
      const sId = r.testCase?.suiteId || "unassigned";
      if (!grouped.has(sId)) grouped.set(sId, []);
      grouped.get(sId)!.push(r);
    });
    // Pin order to sequenceNumber so changing a result's status never reorders the list.
    grouped.forEach((arr) =>
      arr.sort(
        (a: any, b: any) =>
          (a.testCase?.sequenceNumber || 0) - (b.testCase?.sequenceNumber || 0),
      ),
    );
    return grouped;
  }, [run.results, searchQuery, statusFilter, projectCode]);

  const computeSuiteTime = (suiteId: string): number => {
    let total = 0;
    (resultsBySuiteId.get(suiteId) || []).forEach((c: any) => {
      total += c.timeSpent || 0;
    });
    (childrenMap.get(suiteId) || []).forEach((child: any) => {
      total += computeSuiteTime(child.id);
    });
    return total;
  };

  const computeSuiteStats = (suiteId: string): any => {
    let stats = {
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      untested: 0,
      total: 0,
    };
    const cases = resultsBySuiteId.get(suiteId) || [];
    cases.forEach((c) => {
      stats.total++;
      if (c.status === "PASSED") stats.passed++;
      else if (c.status === "FAILED") stats.failed++;
      else if (c.status === "BLOCKED") stats.blocked++;
      else if (c.status === "SKIPPED") stats.skipped++;
      else stats.untested++;
    });
    const children = childrenMap.get(suiteId) || [];
    children.forEach((child) => {
      const childStats = computeSuiteStats(child.id);
      stats.total += childStats.total;
      stats.passed += childStats.passed;
      stats.failed += childStats.failed;
      stats.blocked += childStats.blocked;
      stats.skipped += childStats.skipped;
      stats.untested += childStats.untested;
    });
    return stats;
  };

  const runStats = useMemo(() => {
    let stats = {
      passed: 0,
      failed: 0,
      blocked: 0,
      skipped: 0,
      untested: 0,
      total: run.results.length,
    };
    run.results.forEach((r: any) => {
      if (r.status === "PASSED") stats.passed++;
      else if (r.status === "FAILED") stats.failed++;
      else if (r.status === "BLOCKED") stats.blocked++;
      else if (r.status === "SKIPPED") stats.skipped++;
      else stats.untested++;
    });
    return stats;
  }, [run.results]);

  const completionRate =
    runStats.total > 0
      ? Math.round(
          ((runStats.total - runStats.untested) / runStats.total) * 100,
        )
      : 0;

  const renderConicGradient = () => {
    if (runStats.total === 0) return "conic-gradient(var(--border-color) 0% 100%)";
    const passed = (runStats.passed / runStats.total) * 100;
    const failed = (runStats.failed / runStats.total) * 100;
    const blocked = (runStats.blocked / runStats.total) * 100;
    const skipped = (runStats.skipped / runStats.total) * 100;
    const untested = (runStats.untested / runStats.total) * 100;

    let current = 0;
    let gradient = "conic-gradient(";

    if (passed > 0) {
      gradient += `var(--success) ${current}% ${current + passed}%, `;
      current += passed;
    }
    if (failed > 0) {
      gradient += `var(--danger) ${current}% ${current + failed}%, `;
      current += failed;
    }
    if (blocked > 0) {
      gradient += `var(--warning) ${current}% ${current + blocked}%, `;
      current += blocked;
    }
    if (skipped > 0) {
      gradient += `var(--skip) ${current}% ${current + skipped}%, `;
      current += skipped;
    }
    if (untested > 0) {
      gradient += `var(--border-color) ${current}% ${current + untested}%`;
    }

    if (gradient.endsWith(", ")) gradient = gradient.slice(0, -2);
    gradient += ")";

    return gradient;
  };

  const toggleSuite = (suiteId: string) => {
    setExpandedSuites((prev) => ({ ...prev, [suiteId]: !prev[suiteId] }));
  };

  // When a case was opened, so recording its outcome can capture how long the
  // tester spent on it. Kept in a ref — this must not trigger a re-render.
  const openedAtRef = React.useRef<{ id: string; at: number } | null>(null);

  const openResult = (result: any) => {
    setActiveResultId(result.id);
    openedAtRef.current = { id: result.id, at: Date.now() };
    if (result.stepResults) {
      setStepResults(result.stepResults);
    } else {
      setStepResults({});
    }
  };

  const updateResult = async (resultId: string, status: string) => {
    try {
      // Optimistic update — stamp the executor locally too so the "who / when"
      // line appears immediately instead of waiting for a reload.
      const now = new Date().toISOString();
      const me = session?.user
        ? {
            id: (session.user as any).id,
            name: session.user.name ?? null,
            email: session.user.email ?? null,
          }
        : null;

      // How long this case was open before a verdict was given. Capped at an
      // hour so a tab left open overnight doesn't report a nonsense duration,
      // and only sent when the timer belongs to the case being recorded.
      const opened = openedAtRef.current;
      const elapsed =
        opened?.id === resultId ? Math.min(Date.now() - opened.at, 60 * 60 * 1000) : null;
      const timeSpent = elapsed !== null && elapsed >= 1000 ? elapsed : undefined;

      setRun((prev: any) => {
        const updatedResults = prev.results.map((r: any) =>
          r.id === resultId
            ? {
                ...r,
                status,
                executedAt: now,
                executedBy: me ?? r.executedBy,
                ...(timeSpent !== undefined ? { timeSpent } : {}),
              }
            : r,
        );
        return { ...prev, results: updatedResults };
      });

      // Restart the clock so a second verdict on the same case measures afresh
      // rather than accumulating from when it was first opened.
      if (opened?.id === resultId) openedAtRef.current = { id: resultId, at: Date.now() };

      // Actual fetch to update DB
      await fetch(`/api/runs/${runId}/results/${resultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(timeSpent !== undefined ? { timeSpent } : {}) }),
      });
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const saveComment = async (resultId: string, comment: string) => {
    // Optimistic update so the UI reflects the note immediately
    setRun((prev: any) => ({
      ...prev,
      results: prev.results.map((r: any) =>
        r.id === resultId ? { ...r, comment } : r,
      ),
    }));

    const res = await fetch(`/api/runs/${runId}/results/${resultId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) {
      toast.error("Failed to save note");
      throw new Error("save comment failed");
    }
    toast.success("Note saved");
  };

  const updateStepResult = async (stepId: string, updates: any) => {
    const newStepResults = {
      ...stepResults,
      [stepId]: { ...(stepResults[stepId] || {}), ...updates },
    };
    setStepResults(newStepResults);

    const currentActiveResult = run?.results.find(
      (r: any) => r.id === activeResultId,
    );
    let newGlobalStatus = currentActiveResult?.status;
    const testCase = currentActiveResult?.testCase;

    if (testCase && testCase.steps && testCase.steps.length > 0) {
      const stepStatuses = testCase.steps.map(
        (s: any) => newStepResults[s.id]?.status,
      );
      if (stepStatuses.includes("FAILED")) {
        newGlobalStatus = "FAILED";
      } else if (stepStatuses.includes("BLOCKED")) {
        newGlobalStatus = "BLOCKED";
      } else if (stepStatuses.every((st: any) => st === "PASSED")) {
        newGlobalStatus = "PASSED";
      } else {
        newGlobalStatus = "IN_PROGRESS";
      }
    }

    if (run && activeResultId) {
      const updatedResults = run.results.map((r: any) =>
        r.id === activeResultId
          ? { ...r, stepResults: newStepResults, status: newGlobalStatus }
          : r,
      );
      setRun({ ...run, results: updatedResults });
    }

    try {
      await fetch(`/api/runs/${runId}/results/${activeResultId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepResults: newStepResults,
          status: newGlobalStatus,
        }),
      });
    } catch (err) {
      console.error("Failed to save step result", err);
    }
  };

  /**
   * Attach one or more files to a step.
   *
   * The upload endpoint takes a single file, so this posts them one at a time —
   * but it appends to the step only once, at the end. Appending per file would
   * read `stepResults` from a stale closure on every call after the first, so
   * each upload would overwrite the last and only one screenshot would survive.
   *
   * A file that fails is named rather than swallowed, and the ones that
   * succeeded are still kept.
   */
  const handleFileUpload = async (stepId: string, files: File | File[]) => {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    if (list.length === 0) return;

    // Turn an oversized file away here rather than after a long upload that was
    // never going to be accepted.
    const tooBig = list.filter((f) => f.size > MAX_UPLOAD_BYTES);
    for (const f of tooBig) toast.error(tooLargeMessage(f.name, f.size));
    const toSend = list.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (toSend.length === 0) return;

    setUploadingStepId(stepId);
    const uploaded: { url: string; name: string }[] = [];
    const failed: string[] = [];

    try {
      for (const file of toSend) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("projectId", projectCode);
          const res = await fetch("/api/upload", { method: "POST", body: formData });
          if (!res.ok) {
            // Prefer whatever the server said; fall back only when it said
            // nothing useful, as nginx does when it rejects the body itself.
            const said = await res.json().catch(() => null);
            throw new Error(
              said?.error ||
                (res.status === 413
                  ? `${file.name} is too large to upload.`
                  : `Could not upload ${file.name}`),
            );
          }
          const data = await res.json();
          uploaded.push({ url: data.url, name: file.name });
        } catch (error) {
          console.error(error);
          failed.push(error instanceof Error ? error.message : `Could not upload ${file.name}`);
        }
      }

      if (uploaded.length > 0) {
        const currentAtts = stepResults[stepId]?.attachments || [];
        updateStepResult(stepId, { attachments: [...currentAtts, ...uploaded] });
      }
      for (const message of failed.slice(0, 3)) toast.error(message);
      if (failed.length > 3) {
        toast.error(`${failed.length - 3} more files could not be uploaded.`);
      }
    } finally {
      setUploadingStepId(null);
    }
  };

  const handlePaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    stepId: string,
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    // Take every image on the clipboard, not just the first: pasting a pair of
    // screenshots used to silently drop one.
    const files = Array.from(items)
      .filter((item) => item.type.startsWith("image"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length === 0) return;
    e.preventDefault();
    handleFileUpload(stepId, files);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PASSED":
        return "bg-success text-white";
      case "FAILED":
        return "bg-danger text-white";
      case "BLOCKED":
        return "bg-warning text-[var(--neutral-950)]";
      case "SKIPPED":
        return "bg-skip text-white";
      default:
        return "bg-surface-hover text-text-muted border border-border";
    }
  };

  const renderProgressBar = (stats: any) => {
    if (stats.total === 0) return null;
    const passedPct = (stats.passed / stats.total) * 100;
    const failedPct = (stats.failed / stats.total) * 100;
    const blockedPct = (stats.blocked / stats.total) * 100;
    const skippedPct = (stats.skipped / stats.total) * 100;

    return (
      <div className="flex h-2 w-48 rounded-full bg-surface-hover overflow-hidden ml-4 border border-border">
        {stats.passed > 0 && (
          <div style={{ width: `${passedPct}%` }} className="bg-success" />
        )}
        {stats.failed > 0 && (
          <div style={{ width: `${failedPct}%` }} className="bg-danger" />
        )}
        {stats.blocked > 0 && (
          <div style={{ width: `${blockedPct}%` }} className="bg-warning" />
        )}
        {stats.skipped > 0 && (
          <div style={{ width: `${skippedPct}%` }} className="bg-skip" />
        )}
      </div>
    );
  };

  const renderResultRow = (result: any, depth: number) => {
    const isSelected = activeResultId === result.id;
    return (
      <ResultRow
        key={result.id}
        result={result}
        depth={depth}
        isSelected={isSelected}
        isDetailsOpen={false}
        openResult={openResult}
        projectCode={projectCode}
        runId={runId}
        onDelete={(id: string) => {
          setRun({
            ...run,
            results: run.results.filter((r: any) => r.id !== id),
          });
        }}
        onUpdateAssignee={(
          id: string,
          assignee: {
            id: string;
            name?: string | null;
            email?: string | null;
          } | null,
        ) => {
          const updatedResults = run.results.map((r: any) =>
            r.id === id
              ? {
                  ...r,
                  assigneeId: assignee?.id ?? null,
                  assignee: assignee ?? null,
                }
              : r,
          );
          setRun({ ...run, results: updatedResults });
        }}
        onAssignClick={handleAssignClick}
        currentUser={currentUser}
      />
    );
  };

  const renderSuiteTree = (suite: any, depth: number) => {
    const stats = computeSuiteStats(suite.id);
    if (stats.total === 0) return null; // hide suites with no results

    const isExpanded = expandedSuites[suite.id] !== false; // default true
    const results = resultsBySuiteId.get(suite.id) || [];
    const children = childrenMap.get(suite.id) || [];

    const SUITE_COLORS = [
      "#4f46e5",
      "#7c3aed",
      "#0891b2",
      "#059669",
      "#d97706",
      "#e11d48",
      "#0284c7",
      "#9333ea",
    ];
    const accentColor =
      SUITE_COLORS[
        Math.abs(
          suite.id
            .split("")
            .reduce((a: number, c: string) => a + c.charCodeAt(0), 0),
        ) % SUITE_COLORS.length
      ];

    return (
      <div
        key={suite.id}
        className="bg-surface border-b border-border"
        style={{ borderLeft: depth === 0 ? `2px solid ${accentColor}` : "none" }}
      >
        <div
          className="flex items-center py-[10px] px-4 hover:bg-surface-hover cursor-pointer group transition-colors select-none"
          onClick={() => toggleSuite(suite.id)}
        >
          <div className="w-5 flex items-center justify-center mr-2 text-text-muted">
            {isExpanded ? (
              <ChevronDown size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </div>
          <input
            type="checkbox"
            className="w-[15px] h-[15px] mr-2.5 rounded border-border text-primary focus:ring-primary/25"
            onClick={(e) => e.stopPropagation()}
          />
          <span
            title={suite.title}
            className={`text-text-main group-hover:text-primary transition-colors min-w-0 whitespace-nowrap overflow-hidden text-ellipsis ${
            depth === 0
              ? "font-bold text-[15.5px] mr-3"
              : "font-semibold text-[14.5px] mr-3"
          }`}>
            {suite.title}
          </span>

          <div className="flex items-center text-text-muted font-medium gap-2.5 ml-auto shrink-0 select-none">
            <span className="px-[9px] py-[2px] bg-success/10 text-[11.5px] font-bold rounded-full text-success text-success-foreground border border-success/15 whitespace-nowrap">
              {stats.passed}/{stats.total} Passed
            </span>
            {renderProgressBar(stats)}
            <div className="flex items-center text-[11.5px] text-text-muted bg-skip-soft px-[8px] py-[2px] rounded-full border border-border/40 font-semibold">
              <Clock size={12} className="mr-1" />
              {formatRunDuration(computeSuiteTime(suite.id))}
            </div>
          </div>
        </div>

        {isExpanded && (
          <div className="flex flex-col bg-surface">
            {results.length > 0 && <CaseTableHeader depth={depth + 1} />}
            {results.map((r) => renderResultRow(r, depth + 1))}
            {children.length > 0 &&
              children.map((child) => renderSuiteTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const activeResult = run.results.find((r: any) => r.id === activeResultId);
  const unassignedResults = resultsBySuiteId.get("unassigned") || [];

  // Flat, ordered list of currently-visible results for prev/next navigation.
  const flatVisibleResults = useMemo(() => {
    const out: any[] = [];
    const walk = (suiteId: string) => {
      (resultsBySuiteId.get(suiteId) || []).forEach((r) => out.push(r));
      (childrenMap.get(suiteId) || []).forEach((c) => walk(c.id));
    };
    out.push(...unassignedResults);
    roots.forEach((s) => walk(s.id));
    return out;
  }, [resultsBySuiteId, childrenMap, roots, unassignedResults]);

  const activeIndex = flatVisibleResults.findIndex((r) => r.id === activeResultId);
  const goPrev = () => {
    if (activeIndex > 0) openResult(flatVisibleResults[activeIndex - 1]);
  };
  const goNext = () => {
    if (activeIndex >= 0 && activeIndex < flatVisibleResults.length - 1)
      openResult(flatVisibleResults[activeIndex + 1]);
  };

  const exportToCSV = () => {
    const headers = [
      "Case Code",
      "Test Case Title",
      "Status",
      "Severity",
      "Priority",
      "Expected Result",
      "Actual Result",
      "Evidence (URLs)",
      "Error Message",
      "Time Spent (s)",
      "Executed Date",
    ];

    const escapeCSV = (str: string | null | undefined) => {
      if (!str) return '""';
      const escaped = String(str).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = run.results.map((res: any) => {
      const tc = res.testCase;
      const code = `${projectCode}-${tc.sequenceNumber || tc.id.substring(0, 4)}`;

      const expected = (tc.steps || [])
        .map((step: any, idx: number) => {
          const stepNum = idx + 1;
          let text = `${stepNum}. Action: ${step.action}`;
          if (step.expectedResult)
            text += `\n   Expected: ${step.expectedResult}`;
          return text;
        })
        .join("\n\n");

      const actual = (tc.steps || [])
        .map((step: any, idx: number) => {
          const stepNum = idx + 1;
          const stepRes = (res.stepResults && res.stepResults[step.id]) || {};
          const status = stepRes.status ? `[${stepRes.status}]` : "";
          let text = `${stepNum}. ${status}`;
          if (stepRes.actualResult) text += ` Actual: ${stepRes.actualResult}`;
          return text;
        })
        .join("\n\n");

      const evidenceUrls: string[] = [];
      if (res.attachments && Array.isArray(res.attachments)) {
        evidenceUrls.push(...res.attachments.map((a: any) => a.url));
      }
      (tc.steps || []).forEach((step: any) => {
        const stepRes = (res.stepResults && res.stepResults[step.id]) || {};
        if (stepRes.attachments && Array.isArray(stepRes.attachments)) {
          evidenceUrls.push(...stepRes.attachments.map((a: any) => a.url));
        }
      });
      const evidence = evidenceUrls.join("\n");

      const date = res.updatedAt ? formatThaiTime(res.updatedAt) : "";
      const timeSpent = res.timeSpent ? (res.timeSpent / 1000).toFixed(1) : "0";

      return [
        escapeCSV(code),
        escapeCSV(tc.title),
        escapeCSV(res.status),
        escapeCSV(tc.severity),
        escapeCSV(tc.priority),
        escapeCSV(expected),
        escapeCSV(actual),
        escapeCSV(evidence),
        escapeCSV(res.errorMessage || res.comment),
        escapeCSV(timeSpent),
        escapeCSV(date),
      ].join(",");
    });

    const csvContent = [headers.map(escapeCSV).join(","), ...rows].join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const cleanTitle = run.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const dateStr = new Date().toISOString().split("T")[0];
    a.download = `run_${cleanTitle}_${dateStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setIsExportModalOpen(false);
  };

  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const exportToPDF = async () => {
    setIsExportingPdf(true);
    try {
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default || html2canvasModule;
      if (typeof html2canvas !== "function")
        throw new Error("html2canvas is not a function");

      const jsPdfModule = await import("jspdf");
      const jsPDF = jsPdfModule.jsPDF || jsPdfModule.default;

      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "1000px";
      container.style.backgroundColor = "#ffffff";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(<PdfReportTemplate run={run} projectCode={projectCode} />);

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const images = container.querySelectorAll("img");
      await Promise.all(
        Array.from(images).map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
        }),
      );

      // Find the table header to repeat on every page
      const thead = container.querySelector("thead");
      let headerHeightPx = 0;
      let headerImgData: string | null = null;
      let headerPdfHeight = 0;

      if (thead) {
        const theadRect = thead.getBoundingClientRect();
        headerHeightPx = theadRect.height;

        const headerCanvas = await html2canvas(thead as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#1e293b", // Matches thead background
        });
        headerImgData = headerCanvas.toDataURL("image/jpeg", 0.95);
      }

      // Find all rows to calculate page breaks
      const trs = container.querySelectorAll(".page-break-avoid, tbody tr");
      const pageHeightPx = (297 / 210) * 1000; // ~1414px
      let currentLimit = pageHeightPx;
      const sliceOffsets = [0];

      trs.forEach((tr) => {
        const rect = tr.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const yTop = rect.top - containerRect.top;
        const yBottom = rect.bottom - containerRect.top;

        if (yBottom > currentLimit && yTop < currentLimit) {
          // This element crosses the page boundary
          // We break just before this element, so we push its top coordinate
          const lastBreak = sliceOffsets[sliceOffsets.length - 1];
          if (yTop > lastBreak + 100) {
            sliceOffsets.push(yTop);
            // Next page will have a header injected at the top, so we subtract its height
            // from the available content area limit.
            currentLimit = yTop + (pageHeightPx - headerHeightPx);
          }
        }
      });

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297
      const ratio = pdfWidth / canvas.width;

      if (headerImgData && thead) {
        // The header canvas width is scaled, so its height ratio is the same
        headerPdfHeight = headerHeightPx * 2 * ratio;
      }

      for (let i = 0; i < sliceOffsets.length; i++) {
        if (i > 0) pdf.addPage();

        const sourceY = sliceOffsets[i] * 2; // scale is 2
        let pdfY = -(sourceY * ratio);

        if (i > 0 && headerImgData) {
          // Shift content down by the header height
          pdfY += headerPdfHeight;
        }

        pdf.addImage(imgData, "JPEG", 0, pdfY, pdfWidth, canvas.height * ratio);

        if (i > 0 && headerImgData) {
          // Hide the bleed-over content at the top
          pdf.setFillColor(255, 255, 255);
          pdf.rect(0, 0, pdfWidth, headerPdfHeight, "F");

          // Draw the repeating header
          pdf.addImage(headerImgData, "JPEG", 0, 0, pdfWidth, headerPdfHeight);
        }

        // Hide the overflow at the bottom to avoid showing cut rows
        const nextSourceY =
          i < sliceOffsets.length - 1 ? sliceOffsets[i + 1] * 2 : canvas.height;
        let contentPdfHeight = (nextSourceY - sourceY) * ratio;

        if (i > 0 && headerImgData) {
          contentPdfHeight += headerPdfHeight;
        }

        if (contentPdfHeight < pdfHeight) {
          pdf.setFillColor(255, 255, 255);
          pdf.rect(
            0,
            contentPdfHeight,
            pdfWidth,
            pdfHeight - contentPdfHeight,
            "F",
          );
        }
      }

      // Page numbers — "Page X of Y" centered in the bottom margin of each page
      const totalPages = sliceOffsets.length;
      for (let i = 0; i < totalPages; i++) {
        pdf.setPage(i + 1);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(
          `Page ${i + 1} of ${totalPages}`,
          pdfWidth / 2,
          pdfHeight - 5,
          { align: "center" },
        );
      }

      const cleanTitle = run.title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const dateStr = new Date().toISOString().split("T")[0];
      pdf.save(`run_${cleanTitle}_${dateStr}.pdf`);

      root.unmount();
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }

      setIsExportModalOpen(false);
      toast.success("PDF Report generated successfully");
    } catch (err: any) {
      console.error("Failed to generate PDF:", err);
      toast.error(`Failed to generate PDF: ${err.message || String(err)}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <>
      {isReportModalOpen && run.reportUrl && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl flex flex-col border border-border overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-border">
              <h2 className="text-lg font-bold text-text-main flex items-center">
                <BarChart2 size={18} className="mr-2 text-primary" /> Playwright
                HTML Report
              </h2>
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 w-full bg-surface relative">
              {/* The Playwright report has its own white background */}
              <iframe
                src={run.reportUrl}
                className="w-full h-full border-0 absolute inset-0"
                title="Playwright Report"
              />
            </div>
          </div>
        </div>
      )}

      <div className="w-full bg-background text-text-main font-sans text-[14px] leading-snug antialiased h-[calc(100vh-112px)] min-h-0 flex flex-col overflow-hidden">
        {/* run context header */}
        <div className="flex items-center gap-[14px] px-[20px] py-[13px] bg-surface border-b border-border shrink-0">
          <button onClick={() => router.push(`/projects/${projectCode}/runs`)} className="text-text-faint hover:text-text-main transition-colors flex items-center" title="Back to runs"><ArrowLeft size={20} /></button>
          <div>
            <div className="flex items-center gap-[9px]">
              <span className="font-semibold text-[15px]">{run.title}</span>
              <span className="text-[11px] font-bold px-[8px] py-[2px] rounded-full bg-primary-light text-primary">{run.status}</span>
            </div>
            <div className="font-mono text-[10px] text-text-faint mt-[2px]">RUN-{run.id.substring(0, 4)} · {(run as any).environment?.title || "No env"} · started {formatThaiTime(run.createdAt)}</div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-[14px]">
            <div className="text-right">
              <div className="text-[11px] text-text-faint">Progress</div>
              <div className="font-bold tabular-nums">{runStats.passed + runStats.failed + runStats.blocked} / {runStats.total}</div>
            </div>
            <div className="w-[160px] h-[7px] rounded-[4px] bg-surface-hover overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${completionRate}%` }} />
            </div>
            <div className="flex gap-[9px] text-[12px] font-semibold">
              <span className="text-success">{runStats.passed} passed</span>
              <span className="text-danger">{runStats.failed} failed</span>
              <span className="text-warning">{runStats.blocked} blocked</span>
            </div>

            {run.status === "ACTIVE" ? (
              <Button size="sm" onClick={() => setIsCompleteModalOpen(true)}>
                <CheckCircle2 size={15} /> Complete run
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleReopenRun} loading={isReopening}>
                {!isReopening && <RotateCcw size={14} />} Reopen
              </Button>
            )}

            <div className="relative" ref={mainMenuRef}>
              <button className="text-text-muted hover:text-text-main flex items-center w-[32px] h-[32px] justify-center rounded-lg border border-border bg-surface hover:bg-surface-hover transition-colors" onClick={() => setMainMenuOpen(!mainMenuOpen)} title="More actions"><MoreVertical size={18} /></button>
              {mainMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface border border-border rounded-lg shadow-md z-50 py-1">
                  {run.reportUrl && <button onClick={() => { setMainMenuOpen(false); setIsReportModalOpen(true); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><BarChart2 size={14} className="text-text-muted" /> View Playwright report</button>}
                  <button onClick={() => { setMainMenuOpen(false); handleTriggerGitHub(); }} disabled={isTriggeringGitHub} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><GitBranch size={14} className="text-text-muted" /> {isTriggeringGitHub ? "Triggering…" : "Trigger GitHub Action"}</button>
                  <button onClick={() => { setMainMenuOpen(false); handleRunAllAutomated(); }} disabled={isExecutingAllAutomated} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><Play size={14} className="text-text-muted" /> {isExecutingAllAutomated ? `Running ${automatedProgress.current}/${automatedProgress.total}…` : "Run all automated (Local)"}</button>
                  <button onClick={() => { setMainMenuOpen(false); handleOpenWizard(); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><RefreshCw size={14} className="text-text-muted" /> Open run wizard</button>
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => { setMainMenuOpen(false); router.push(`/projects/${projectCode}/runs/${runId}/edit`); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><Edit size={14} className="text-text-muted" /> Edit run (add / remove cases)</button>
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => { setMainMenuOpen(false); setIsShareModalOpen(true); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><Share size={14} className="text-text-muted" /> Share report</button>
                  <button onClick={() => { setMainMenuOpen(false); setIsExportModalOpen(true); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><FileText size={14} className="text-text-muted" /> Export (PDF / CSV)</button>
                  {failedCount > 0 && <button onClick={handleRerunFailed} disabled={isRerunning} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><RotateCcw size={14} className="text-text-muted" /> {isRerunning ? "Re-running…" : `Re-run failed (${failedCount})`}</button>}
                  <div className="h-px bg-border my-1" />
                  {run.status === "ACTIVE" && (
                    <button onClick={() => { setMainMenuOpen(false); handleAbortRun(); }} disabled={isAborting} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2 disabled:opacity-60"><Ban size={14} className="text-text-muted" /> {isAborting ? "Aborting…" : "Abort run"}</button>
                  )}
                  {run.status === "ACTIVE" ? (
                    <button onClick={() => { setMainMenuOpen(false); setIsCompleteModalOpen(true); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><CheckCircle2 size={14} className="text-text-muted" /> Complete run</button>
                  ) : (
                    <button onClick={() => { setMainMenuOpen(false); handleReopenRun(); }} className="w-full text-left px-4 py-2 text-[13px] hover:bg-surface-hover flex items-center gap-2"><RotateCcw size={14} className="text-text-muted" /> Reopen run</button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* case list — always full width; clicking a case opens the detail drawer */}
          <div className="flex-1 w-full min-w-0 bg-surface flex flex-col h-full">
            <div className="flex items-center gap-[8px] px-[14px] py-[11px] border-b border-border shrink-0">
              <div className="flex-1 max-w-[340px] flex items-center gap-[8px] h-[36px] px-[12px] bg-surface-hover border border-border rounded-[8px] text-text-faint text-[13.5px] focus-within:border-primary transition-colors">
                <Search size={17} />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filter cases" className="bg-transparent outline-none w-full text-text-main" />
              </div>
              <button onClick={() => setStatusFilter(null)} title="Clear filters" className="text-text-faint hover:text-text-main transition-colors flex items-center"><SlidersHorizontal size={19} /></button>
            </div>

            {/* Status filters */}
            <div className="flex flex-wrap gap-[5px] p-[9px_16px] bg-surface border-b border-border">
              {['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'IN_PROGRESS'].map(st => (
                 <button key={st} onClick={() => setStatusFilter(statusFilter === st ? null : st)} className={`px-2.5 py-1 rounded text-[11.5px] font-bold ${statusFilter === st ? "bg-primary-light text-primary" : "bg-surface-hover text-text-muted hover:text-text-main"}`}>
                   {st}
                 </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pb-8">
              {unassignedResults.length > 0 && (
                <>
                  <div className="flex items-center gap-[8px] px-[16px] py-[10px] bg-surface-hover border-b border-border">
                    <ChevronDown size={17} className="text-text-faint" />
                    <span className="font-bold text-[15.5px]">Unassigned Cases</span>
                    <span className="text-[11.5px] text-text-faint ml-auto tabular-nums">{unassignedResults.length} cases</span>
                  </div>
                  <CaseTableHeader depth={0} />
                  {unassignedResults.map((r) => renderResultRow(r, 0))}
                </>
              )}
              {roots.map((suite) => renderSuiteTree(suite, 0))}
            </div>
          </div>
        </div>

        {/* Backdrop for the case detail drawer */}
        {activeResultId && (
          <div
            className="fixed inset-0 bg-[color:var(--overlay)] z-[60] transition-opacity"
            onClick={() => setActiveResultId(null)}
          />
        )}

        {/* Execution detail drawer */}
        <div
          className={`fixed top-0 right-0 h-full w-[62vw] min-w-[720px] max-w-[1040px] bg-surface shadow-[var(--shadow-lg)] border-l border-border transform transition-transform duration-200 ease-out z-[70] flex flex-col ${activeResultId ? "translate-x-0" : "translate-x-full"}`}
        >
          {activeResultId && activeResult && activeResult.testCase ? (
            (() => {
              const caseStatusVis = statusVisual(activeResult.status);
              const casePriVis = priorityVisual(activeResult.testCase.priority);
              const statusLabelMap: Record<string, string> = { PASSED: "Passed", FAILED: "Failed", BLOCKED: "Blocked", SKIPPED: "Skipped", IN_PROGRESS: "In progress" };
              const caseStatusLabel = statusLabelMap[activeResult.status] || "Untested";
              const tags: string[] = Array.isArray(activeResult.testCase.tags)
                ? activeResult.testCase.tags
                : typeof activeResult.testCase.tags === "string" && activeResult.testCase.tags
                  ? activeResult.testCase.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
                  : [];

              // Result-level evidence only — step-level attachments already render
              // under their own step, so including them here just duplicates them.
              const evidence: { url: string; name: string }[] = Array.isArray(
                activeResult.attachments,
              )
                ? activeResult.attachments
                : [];
              // Real console output only. `comment` is a human note and has its
              // own "Comment / Notes" box below — showing it here duplicated it
              // and mislabelled it as console output.
              const consoleLog = activeResult.errorMessage || automationLogs || "";
              const automationScript = activeResult.testCase.automationScript;

              return (
            <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
            <div className="flex-1 overflow-y-auto px-[24px] py-[20px]">
              <div className="flex items-start gap-[12px]">
                <div className="flex-1">
                  <div className="flex items-center gap-[9px] mb-[5px] flex-wrap">
                    <span className="font-mono text-[11px] text-text-faint">{projectCode}-{activeResult.testCase.sequenceNumber || activeResult.testCase.id.substring(0,4).toUpperCase()}</span>
                    <span className="inline-flex items-center gap-[5px] text-[11px] font-bold px-[9px] py-[2px] rounded-full" style={{ background: caseStatusVis.soft, color: caseStatusVis.color }}>
                      <caseStatusVis.Icon size={13} />{caseStatusLabel}
                    </span>
                    <span className="inline-flex items-center gap-[4px] text-[11px] font-semibold px-[9px] py-[2px] rounded-full" style={{ background: casePriVis.soft, color: casePriVis.color }}>
                      <casePriVis.Icon size={13} />{casePriVis.label}
                    </span>
                  </div>
                  <div className="text-[21px] font-semibold tracking-[-0.015em] text-text-main">{activeResult.testCase.title}</div>

                  {/* Who recorded this outcome and when — the audit trail a
                      reviewer asks for first when a result looks wrong. */}
                  {activeResult.executedAt && (
                    <div className="mt-[6px] inline-flex items-center gap-[6px] text-[12.5px] text-text-faint">
                      <caseStatusVis.Icon size={13} style={{ color: caseStatusVis.color } as any} />
                      <span>
                        {caseStatusLabel} {formatThaiTime(activeResult.executedAt)}
                        {activeResult.executedBy && (
                          <>
                            {" by "}
                            <span className="text-text-muted font-medium">
                              {activeResult.executedBy.name ||
                                activeResult.executedBy.email?.split("@")[0]}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  )}

                  {activeResult.testCase.description && <div className="text-[13.5px] text-text-muted mt-2 mb-2 max-w-3xl leading-relaxed">{activeResult.testCase.description}</div>}
                  {activeResult.testCase.preconditions && (
                    <div className="text-[12.5px] text-text-faint bg-surface p-3 rounded-lg border border-border mb-3 max-w-3xl">
                      <span className="font-semibold block mb-1">Pre-conditions:</span>
                      {activeResult.testCase.preconditions}
                    </div>
                  )}

                  {tags.length > 0 && (
                    <div className="flex gap-[7px] mt-[9px] flex-wrap">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[11px] font-semibold px-[9px] py-[3px] rounded-[7px] bg-surface-hover border border-border text-text-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-[6px] shrink-0">
                  <button onClick={goPrev} disabled={activeIndex <= 0} title="Previous case" className="w-[32px] h-[32px] rounded-[8px] border border-border bg-surface flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"><ChevronLeft size={18} /></button>
                  <button onClick={goNext} disabled={activeIndex < 0 || activeIndex >= flatVisibleResults.length - 1} title="Next case" className="w-[32px] h-[32px] rounded-[8px] border border-border bg-surface flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"><ChevronRight size={18} /></button>
                  <button onClick={() => setActiveResultId(null)} title="Close" className="w-[32px] h-[32px] rounded-[8px] border border-border bg-surface flex items-center justify-center text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors"><X size={16} /></button>
                </div>
              </div>

              {/* Run Local automation (only when the case has a script) */}
              {automationScript && (
                <div className="mt-[14px]">
                  <Button size="sm" variant="secondary" onClick={handleRunAutomation} loading={isExecutingAutomated}>
                    {!isExecutingAutomated && <Play size={14} />} Run Local (Playwright)
                  </Button>
                </div>
              )}

              {/* steps */}
              {activeResult.testCase.steps && activeResult.testCase.steps.length > 0 && (
                <div className="mt-[14px] bg-surface border border-border rounded-[10px] overflow-hidden">
                  <div className="grid grid-cols-[34px_1fr_1fr_92px] gap-[14px] px-[18px] py-[8px] text-[11px] font-semibold tracking-[0.05em] uppercase text-text-faint border-b border-border">
                    <div>#</div><div>Action</div><div>Expected</div><div className="text-right">Result</div>
                  </div>
                  {activeResult.testCase.steps.map((step: any, idx: number) => {
                    const stepData = stepResults[step.id] || {};
                    const stepStatus = stepData.status;
                    const sv = statusVisual(stepStatus);
                    // Migrated runs often carry no per-step verdict, because
                    // Qase lets a case be settled without stamping its steps.
                    // A bare "—" reads as data lost in migration, so say which
                    // it is: inferred from the case result, or never recorded.
                    const derived = stepData.derivedFrom === "case-result";
                    const stepTitle = derived
                      ? "Inferred from the case result — the case passed, so every step passed. Click to set it yourself."
                      : stepStatus
                        ? "Click to cycle status"
                        : "No result was recorded for this step. Click to set one.";
                    const sBg = stepStatus === "FAILED" ? "var(--danger-soft)" : "transparent";
                    const actualResult = stepData.actualResult || "";
                    const attachments = stepData.attachments || [];
                    // Cycle the step result: untested → Pass → Fail → Block → Skip → untested
                    const cycle: Record<string, string> = { "": "PASSED", PASSED: "FAILED", FAILED: "BLOCKED", BLOCKED: "SKIPPED", SKIPPED: "" };
                    const next = cycle[stepStatus || ""];

                    return (
                      <div key={step.id} className="border-b border-border last:border-0" style={{ background: sBg }}>
                        <div className="grid grid-cols-[34px_1fr_1fr_92px] gap-[14px] px-[18px] py-[9px] items-start">
                          <div className="w-[20px] h-[20px] rounded-[6px] bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold text-text-muted tabular-nums">{idx + 1}</div>
                          <div className="text-[13px] text-text-main whitespace-pre-wrap">{step.action}</div>
                          <div className="text-[13px] text-text-muted whitespace-pre-wrap">{step.expectedResult}</div>
                          <div className="text-right">
                            <button
                              onClick={() => updateStepResult(step.id, { status: next || null, derivedFrom: null })}
                              title={stepTitle}
                              className="inline-flex items-center gap-[4px] text-[10.5px] font-bold px-[8px] py-[2px] rounded-full hover:opacity-80 transition-opacity"
                              style={{
                                background: sv.soft,
                                color: sv.color,
                                border: stepStatus ? "none" : "1px solid var(--border-color)",
                                // Dashed ring marks a verdict nobody typed.
                                ...(derived ? { boxShadow: "inset 0 0 0 1px var(--success)", opacity: 0.85 } : {}),
                              }}
                            >
                              <sv.Icon size={12} />{sv.label}
                              {derived && <span className="font-normal opacity-70">·&nbsp;inferred</span>}
                            </button>
                          </div>
                        </div>
                        {/* per-step actual result + evidence */}
                        <div className="px-[18px] pb-[9px] grid grid-cols-[34px_1fr] gap-[14px]">
                          <div />
                          <div className="space-y-2">
                            <textarea
                              value={actualResult}
                              onChange={(e) => setStepResults({ ...stepResults, [step.id]: { ...stepData, actualResult: e.target.value } })}
                              onBlur={(e) => updateStepResult(step.id, { actualResult: e.target.value })}
                              onPaste={(e) => handlePaste(e, step.id)}
                              placeholder="Actual result / notes…"
                              className="w-full text-[12px] bg-surface-hover text-text-main border border-border rounded-md p-2 min-h-[32px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition placeholder:text-text-faint"
                            />
                            {attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {attachments.map((att: any, i: number) => (
                                  <div key={i} className="relative w-28 h-20 border border-border rounded-md overflow-hidden group bg-surface-hover flex items-center justify-center cursor-pointer hover:border-primary transition-colors" onClick={() => setViewingAttachment({ url: att.url, name: att.name || "Attachment" })}>
                                    {isVideoUrl(att.url) ? (
                                      <video src={att.url} className="w-full h-full object-contain bg-black" />
                                    ) : isDocumentUrl(att.url) ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-text-faint"><FileText size={24} /><span className="text-[10px] truncate w-full px-1 text-center">{att.name || "File"}</span></div>
                                    ) : (
                                      <img src={att.url} alt={att.name || "Attachment"} className="w-full h-full object-contain" />
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); updateStepResult(step.id, { attachments: attachments.filter((_: any, index: number) => index !== i) }); }} className="absolute top-1 right-1 bg-black/50 text-danger rounded p-0.5 opacity-0 group-hover:opacity-100 transition hover:bg-danger/20 z-10"><XCircle size={14} /></button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <input type="file" id={`file-upload-${step.id}`} className="hidden" multiple accept="image/*,video/*,.txt,.log,.json,.har,.csv" onChange={(e) => { const files = Array.from(e.target.files || []); if (files.length) { handleFileUpload(step.id, files); } e.target.value = ""; }} />
                            <label htmlFor={`file-upload-${step.id}`} className="flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-border hover:border-primary bg-surface-hover hover:bg-surface rounded-md text-[11px] font-semibold text-text-faint hover:text-primary cursor-pointer transition w-full">
                              <ImageIcon size={13} /> <span>Upload screenshot / log</span>
                              {uploadingStepId === step.id && <RefreshCw size={12} className="animate-spin" />}
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Evidence + Console. Both are supplementary to the per-step
                  evidence above, so each only appears when it actually has
                  something — most manual runs record everything on the steps
                  and show neither. */}
              {(evidence.length > 0 || consoleLog) && (
              <div className={`mt-[16px] grid gap-[14px] ${evidence.length > 0 && consoleLog ? "grid-cols-[1fr_1fr]" : "grid-cols-1"}`}>
                {evidence.length > 0 && (
                  <div className="bg-surface border border-border rounded-[12px] p-[14px] shadow-sm">
                    <div className="flex items-center gap-[7px] font-semibold text-[13px] mb-[10px]"><ImageIcon size={17} className="text-text-faint" />Evidence</div>
                    <div className="grid grid-cols-2 gap-2">
                      {evidence.map((att, i) => (
                        <div key={i} className="aspect-[16/10] rounded-[9px] bg-surface-hover border border-border overflow-hidden cursor-pointer hover:border-primary transition-colors flex items-center justify-center" onClick={() => setViewingAttachment({ url: att.url, name: att.name || "Attachment" })}>
                          {isVideoUrl(att.url) ? (
                            <video src={att.url} className="w-full h-full object-contain bg-black" />
                          ) : isDocumentUrl(att.url) ? (
                            <div className="flex flex-col items-center gap-1 text-text-faint"><FileText size={24} /><span className="font-mono text-[10px] truncate w-full px-1 text-center">{att.name}</span></div>
                          ) : (
                            <img src={att.url} alt={att.name || "Evidence"} className="w-full h-full object-contain" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {consoleLog && (
                  <div className="bg-surface border border-border rounded-[12px] p-[14px] shadow-sm">
                    <div className="flex items-center gap-[7px] font-semibold text-[13px] mb-[10px]"><Terminal size={17} className="text-text-faint" />Console</div>
                    <div className="bg-surface-hover border border-border rounded-[9px] px-[12px] py-[11px] font-mono text-[11px] leading-[1.7] text-text-muted overflow-auto max-h-[200px]">
                      <pre className="whitespace-pre-wrap">{consoleLog}</pre>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* comment / notes (editable) */}
              <ResultCommentBox result={activeResult} onSave={(text) => saveComment(activeResult.id, text)} />

              {/* automation logs (live) */}
              {(isExecutingAutomated || automationLogs) && (
                <div className="mt-[16px] bg-[#0d1117] border border-border rounded-[12px] p-[14px] shadow-sm">
                  <div className="flex items-center gap-[7px] font-semibold text-[13px] mb-[10px] text-[#c9d1d9]"><Terminal size={17} />Automation log {isExecutingAutomated && <Loader2 size={13} className="animate-spin" />}</div>
                  <pre className="font-mono text-[11px] text-[#c9d1d9] whitespace-pre-wrap max-h-[240px] overflow-auto">{automationLogs}</pre>
                </div>
              )}

              </div>{/* end scroll content */}

              {/* runner action bar (pinned footer) */}
              <div className="shrink-0 border-t border-border bg-background px-[24px] py-[14px] flex items-center gap-[9px]">
                <button onClick={() => updateResult(activeResult.id, "PASSED")} className="flex-1 flex items-center justify-center gap-[7px] h-[44px] rounded-[10px] bg-success text-white font-bold text-[14px] shadow-sm hover:opacity-90 transition-opacity"><CheckCircle2 size={19} />Pass</button>
                <button onClick={() => updateResult(activeResult.id, "FAILED")} className="flex-1 flex items-center justify-center gap-[7px] h-[44px] rounded-[10px] bg-danger text-white font-bold text-[14px] shadow-sm hover:opacity-90 transition-opacity"><XCircle size={19} />Fail</button>
                <button onClick={() => updateResult(activeResult.id, "BLOCKED")} className="flex items-center justify-center gap-[7px] h-[44px] px-[18px] rounded-[10px] bg-surface border border-[var(--border-strong)] text-warning font-bold text-[14px] hover:bg-surface-hover transition-colors"><Ban size={19} />Block</button>
                <button onClick={() => updateResult(activeResult.id, "SKIPPED")} className="flex items-center justify-center gap-[7px] h-[44px] px-[18px] rounded-[10px] bg-surface border border-[var(--border-strong)] text-text-muted font-bold text-[14px] hover:bg-surface-hover transition-colors"><SkipForward size={19} />Skip</button>
                <button onClick={() => setReportingResult(activeResult)} title="Report bug / AI triage" className="w-[44px] h-[44px] rounded-[10px] bg-surface border border-border flex items-center justify-center text-danger hover:bg-danger-soft transition-colors"><Bug size={20} /></button>
              </div>
            </div>
              );
            })()
          ) : null}
        </div>
      </div>

      {/* Complete Run Modal */}
{/* Complete Run Modal */}
        {isCompleteModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-[480px] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-colors border border-border">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-text-main">
                  Complete run
                </h3>
                <button
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="text-text-muted hover:text-text-main"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-6 text-[15px] text-text-muted">
                Do you want to complete this run?
              </div>
              <div className="px-6 py-4 bg-surface-hover border-t border-border/50 flex justify-end space-x-3 transition-colors">
                <button
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="px-4 py-2 bg-background border border-border rounded-md text-sm font-bold text-text-main hover:bg-surface transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCompleteRun}
                  className="px-4 py-2 bg-primary rounded-md text-sm font-bold text-primary-foreground hover:bg-primary-hover transition-colors shadow-sm"
                >
                  Complete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Share Report Modal */}
        {isShareModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-[560px] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 transition-colors border border-border">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-text-main">
                  Share report
                </h3>
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="text-text-muted hover:text-text-main"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-6 space-y-6">
                <label className="flex items-center cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={isPublicLinkOn}
                      onChange={togglePublicLink}
                      disabled={isTogglingLink}
                    />
                    <div
                      className={`block w-11 h-6 rounded-full transition-colors ${isPublicLinkOn ? "bg-primary" : "bg-surface-hover border border-border"} ${isTogglingLink ? "opacity-50" : ""}`}
                    ></div>
                    <div
                      className={`absolute left-[2px] top-[2px] bg-surface w-5 h-5 rounded-full transition-transform transform ${isPublicLinkOn ? "translate-x-5" : ""} shadow-sm`}
                    ></div>
                  </div>
                  <div className="ml-3 text-[15px] font-medium text-text-main group-hover:text-primary transition-colors">
                    {isPublicLinkOn
                      ? "Public link is turned on"
                      : "Public link is turned off"}
                  </div>
                </label>

                {isPublicLinkOn ? (
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={
                        typeof window !== "undefined"
                          ? `${window.location.origin}/report/${runId}`
                          : ""
                      }
                      className="w-full border border-border rounded-md py-2.5 pl-3 pr-20 text-[15px] text-text-main bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-colors"
                    />
                    <button
                      onClick={handleCopyPublicLink}
                      className="absolute right-2 top-2 text-primary font-bold text-sm bg-primary/10 px-3 py-1 rounded hover:bg-primary/20 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-text-muted">
                    Turn on the public link to allow anyone with the link to
                    view the real-time execution report.
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-border/50 flex justify-end bg-surface">
                <button
                  onClick={() => setIsShareModalOpen(false)}
                  className="px-5 py-2 bg-primary rounded-md text-sm font-bold text-primary-foreground hover:bg-primary-hover transition-colors shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {isExportModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-surface rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.12)] w-[480px] overflow-visible flex flex-col animate-in zoom-in-95 duration-200 transition-colors border border-border">
              <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-text-main">
                  Export test run
                </h3>
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="text-text-muted hover:text-text-main"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="px-6 py-6 pb-24">
                <div className="relative border border-primary/50 rounded-md shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-colors">
                  <div className="flex items-center px-3 py-2 border-b border-border/50 bg-background">
                    <input
                      type="text"
                      placeholder="Type to search"
                      className="w-full text-sm outline-none text-text-main bg-transparent placeholder:text-text-muted"
                    />
                  </div>
                  <div className="py-1 bg-surface">
                    <div
                      className="px-3 py-2 text-sm text-text-main hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-between"
                      onClick={exportToCSV}
                    >
                      CSV
                    </div>
                    <div
                      className="px-3 py-2 text-sm text-text-main hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-between"
                      onClick={isExportingPdf ? undefined : exportToPDF}
                    >
                      {isExportingPdf ? (
                        <span className="flex items-center text-text-muted">
                          <Loader2 size={14} className="animate-spin mr-2" />{" "}
                          Generating PDF...
                        </span>
                      ) : (
                        "PDF"
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assign Modal */}
        {isAssignModalOpen && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface w-[400px] rounded-lg shadow-xl overflow-hidden border border-border animate-in zoom-in-95 duration-200 transition-colors">
              <div className="px-6 py-4 border-b border-border/50 flex justify-between items-center bg-background">
                <h3 className="text-lg font-bold text-text-main">
                  Select assignee
                </h3>
                <button
                  onClick={() => setIsAssignModalOpen(false)}
                  className="text-text-muted hover:text-text-main"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-text-main mb-2">
                  Assign to
                </label>
                <select
                  className="w-full bg-background border border-border text-text-main rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors"
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                >
                  <option value="" disabled>
                    Select user...
                  </option>
                  {projectMembers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-6 py-4 bg-background border-t border-border/50 flex justify-end space-x-3">
                <button
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-surface-hover text-text-main transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={submitAssignee}
                  className="px-4 py-2 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium shadow-sm transition-all"
                  disabled={!selectedAssigneeId}
                >
                  Assign
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen Attachment Viewer (lightbox) */}
        {viewingAttachment && (
          <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200" onClick={() => setViewingAttachment(null)}>
            {/* z-10 is load-bearing: the content layer below is `relative
                w-full h-full` and comes later in the DOM, so without it that
                layer paints over this corner and swallows the click on ✕
                (it stops propagation), leaving the viewer impossible to close. */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6 z-10">
              <button onClick={() => setViewingAttachment(null)} aria-label="Close" className="bg-surface/10 hover:bg-surface/20 text-white rounded-full p-2 transition backdrop-blur-sm"><XCircle size={32} /></button>
            </div>
            <div className="relative w-full h-full flex items-center justify-center animate-in zoom-in-95 duration-200 p-8 pt-16" onClick={(e) => e.stopPropagation()}>
              {isVideoUrl(viewingAttachment.url) ? (
                <video src={viewingAttachment.url} controls autoPlay className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl bg-black" />
              ) : viewingAttachment.isTrace ? (
                <div className="w-full h-full bg-surface rounded-lg overflow-hidden shadow-2xl flex flex-col">
                  <div className="bg-surface-hover border-b border-border px-4 py-3 flex items-center">
                    <span className="text-sm font-bold text-text-main flex items-center">
                      <img src="https://playwright.dev/img/playwright-logo.svg" className="w-5 h-5 mr-2" alt="Playwright" />
                      Playwright Trace Viewer
                    </span>
                  </div>
                  <iframe src={`https://trace.playwright.dev/?trace=${encodeURIComponent(viewingAttachment.url)}`} className="w-full flex-1 border-none" title="Playwright Trace Viewer" />
                </div>
              ) : isDocumentUrl(viewingAttachment.url) ? (
                <div className="bg-surface p-12 rounded-lg shadow-2xl flex flex-col items-center justify-center border border-border min-w-[300px]">
                  <FileText size={48} className="text-text-muted mb-4" />
                  <h3 className="text-lg font-bold text-text-main mb-6 text-center break-all max-w-sm">{viewingAttachment.name}</h3>
                  <a href={viewingAttachment.url} download target="_blank" rel="noreferrer" className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary-hover transition-colors shadow-sm">Download File</a>
                </div>
              ) : (
                <img src={viewingAttachment.url} alt={viewingAttachment.name} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
              )}
            </div>
          </div>
        )}

        <ReportBugModal
          isOpen={!!reportingResult}
          onClose={() => setReportingResult(null)}
          projectCode={projectCode}
          runId={runId}
          result={reportingResult}
          onReported={(issue) => {
            setRun((prev: any) => ({
              ...prev,
              results: prev.results.map((r: any) =>
                r.id === reportingResult?.id
                  ? { ...r, linkedIssues: [...(r.linkedIssues || []), issue] }
                  : r,
              ),
            }));
          }}
        />
    </>
  );
}
