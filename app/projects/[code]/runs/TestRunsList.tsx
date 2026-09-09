"use client";
// Force rebuild for TestRunsList

import React, { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreVertical,
  Filter,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Ban,
  SkipForward,
} from "lucide-react";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { runStats } from "@/lib/run-stats";

// Color thresholds mirror the design's <script> data shaping.
// Ring + completion bar use raw CSS vars (needed in SVG stroke / inline style).
const RING_TRACK = "var(--bg-surface-hover)";
const COLOR_PASS = "var(--success)";
const COLOR_WARN = "var(--warning)";
const COLOR_FAIL = "var(--danger)";
const COLOR_PRIMARY = "var(--primary)";

const ringColorFor = (pass: number) =>
  pass >= 90 ? COLOR_PASS : pass >= 75 ? COLOR_WARN : COLOR_FAIL;
const compColorFor = (comp: number) =>
  comp >= 90 ? COLOR_PASS : comp >= 60 ? COLOR_PRIMARY : COLOR_WARN;

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
function authorMeta(
  author: { name?: string | null; email?: string | null } | null | undefined,
) {
  const display = author?.name || author?.email?.split("@")[0] || "Unknown";
  const parts = display.split(" ");
  const initials = (
    parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : display.substring(0, 2)
  ).toUpperCase();
  let sum = 0;
  for (let i = 0; i < display.length; i++) sum += display.charCodeAt(i);
  return {
    display,
    initials,
    color: AVATAR_COLORS[sum % AVATAR_COLORS.length],
  };
}

interface TestRunsListProps {
  initialRuns: any[];
  code: string;
}

export function TestRunsList({ initialRuns, code }: TestRunsListProps) {
  const router = useRouter();
  const { role } = useProjectRole();
  const [runs, setRuns] = useState(initialRuns);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showFilters, setShowFilters] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDelete = async (runId: string) => {
    const backup = [...runs];
    setRuns((prev) => prev.filter((r) => r.id !== runId));
    setActiveDropdown(null);

    try {
      const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      if (!res.ok) {
        setRuns(backup);
        toast.error("Failed to delete test run.");
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      setRuns(backup);
      toast.error("An error occurred while deleting the test run.");
    }
  };

  const filteredRuns = runs.filter((run) => {
    const matchesSearch = run.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRuns.length / rowsPerPage));
  const paginatedRuns = filteredRuns.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  );

  // ── Status-grouped board zones ──
  const zoneOf = (run: any) => {
    if (run.status === "COMPLETED") return "COMPLETED";
    if (run.status === "ABORTED") return "ABORTED";
    return "ACTIVE";
  };
  const ZONES = [
    { key: "ACTIVE", label: "Active", dot: "#6366f1" },
    { key: "COMPLETED", label: "Completed", dot: "#10b981" },
    { key: "ABORTED", label: "Aborted", dot: "#e11d48" },
  ] as const;
  const grouped: Record<string, any[]> = {
    ACTIVE: [],
    COMPLETED: [],
    ABORTED: [],
  };
  filteredRuns.forEach((r) => grouped[zoneOf(r)].push(r));

  const renderRunRow = (run: any) => {
    // Shared with every other screen — see lib/run-stats.ts for why skipped
    // counts as decided.
    const { passed, failed, blocked, skipped, completionPercent, passRate, isFullyDecided } =
      runStats(run.results);
    // Tested everything but nobody closed the run — worth a nudge, since
    // nothing else on this board says so.
    const readyToClose = isFullyDecided && run.status === "ACTIVE";

    // Color thresholds from the design <script>.
    const compColor = compColorFor(completionPercent);
    const ringColor = ringColorFor(passRate);
    const C = 113.1;
    const ringOffset = (C * (1 - passRate / 100)).toFixed(1);

    const a = authorMeta(run.author);

    return (
      <div
        key={run.id}
        className="relative group bg-surface border border-border rounded-[12px] p-[14px] shadow-sm hover:shadow-md transition-shadow"
      >
        <div className="flex items-start gap-[12px]">
          <div className="flex-1 min-w-0">
            <Link href={`/projects/${code}/runs/${run.id}`} className="block">
              <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-text-main group-hover:text-primary transition-colors truncate">
                {run.title}
              </div>
              <div className="font-mono text-[10.5px] text-text-faint mt-[2px] truncate">
                {run.id}
              </div>
            </Link>
            {/* Every case has a verdict but the run is still open. Nothing else
                on this board says so, so a finished run can sit in Active
                indefinitely without anyone noticing. */}
            {readyToClose && (
              <span
                className="mt-[6px] inline-flex items-center gap-[4px] rounded-[6px] bg-success-soft px-[7px] py-[2px] text-[10.5px] font-semibold text-success"
                title="All cases have a result — this run can be completed"
              >
                <CheckCircle2 size={11} />Ready to close
              </span>
            )}
          </div>
          
          {/* Circular progress SVG */}
          <div className="relative shrink-0 w-[46px] h-[46px]">
            <svg width="46" height="46" viewBox="0 0 46 46">
              <circle cx="23" cy="23" r="18" fill="none" stroke={RING_TRACK} strokeWidth="5"></circle>
              <circle
                cx="23" cy="23" r="18" fill="none"
                stroke={ringColor} strokeWidth="5" strokeLinecap="round"
                strokeDasharray="113.1" strokeDashoffset={ringOffset}
                transform="rotate(-90 23 23)"
                className="transition-all duration-1000 ease-out"
              ></circle>
              <text x="23" y="24" textAnchor="middle" dominantBaseline="middle" className="text-[11px] font-bold fill-text-main font-sans">
                {passRate}
              </text>
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-[7px] my-[13px] mb-[10px]">
          <span className="text-[11px] text-text-faint">Completion</span>
          <div className="flex-1 h-[6px] rounded-[3px] bg-surface-hover overflow-hidden">
            <div className="h-full transition-all duration-1000 ease-out" style={{ width: `${completionPercent}%`, background: compColor }}></div>
          </div>
          <span className="text-[11.5px] font-bold tabular-nums text-text-main">{completionPercent}%</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-[6px]">
            <span className="flex items-center gap-[4px] text-[11px] font-semibold text-success">
              <CheckCircle2 size={13} />{passed}
            </span>
            <span className="flex items-center gap-[4px] text-[11px] font-semibold text-danger">
              <XCircle size={13} />{failed}
            </span>
            <span className="flex items-center gap-[4px] text-[11px] font-semibold text-warning">
              <Ban size={13} />{blocked}
            </span>
            {/* Only when there are any: shown so the counts add up to the run's
                total. Skipped cases used to be invisible here, leaving a gap
                nothing on the card explained. */}
            {skipped > 0 && (
              <span
                className="flex items-center gap-[4px] text-[11px] font-semibold text-text-faint"
                title={`${skipped} skipped`}
              >
                <SkipForward size={13} />{skipped}
              </span>
            )}
          </div>
          <div className="flex items-center gap-[6px]">
            <span className="text-[11px] text-text-faint truncate max-w-[60px]">{run.environment?.title || "No Env"}</span>
            <div className="w-[21px] h-[21px] rounded-full bg-primary-light text-primary flex items-center justify-center text-[9.5px] font-bold" title={a.display}>
              {a.initials}
            </div>
          </div>
        </div>
        
        {/* Dropdown menu action */}
        <div className="absolute top-[14px] right-[14px] opacity-0 group-hover:opacity-100 transition-opacity" ref={activeDropdown === run.id ? dropdownRef : null}>
          <button
            onClick={(e) => { e.preventDefault(); setActiveDropdown(activeDropdown === run.id ? null : run.id); }}
            className="p-[2px] rounded-md text-text-faint hover:text-text-main hover:bg-surface-hover"
          >
            <MoreVertical size={16} />
          </button>
          {activeDropdown === run.id && (
            <div className="absolute right-0 mt-1 w-40 bg-surface border border-border rounded-xl shadow-premium z-30 py-1 overflow-hidden animate-in zoom-in-95 duration-200">
              <Link href={`/projects/${code}/runs/${run.id}`} className="w-full text-left px-4 py-2 text-[13px] text-text-main hover:bg-surface-hover flex items-center">
                <Play size={13} className="mr-2 text-text-muted" /> Open run
              </Link>
              <button onClick={() => { setActiveDropdown(null); setConfirmDeleteId(run.id); }} className="w-full text-left px-4 py-2 text-[13px] text-danger hover:bg-danger-soft flex items-center">
                <Trash2 size={13} className="mr-2" /> Delete run
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col h-full bg-bg">
      {/* Board Header */}
      <div className="flex items-center justify-between p-[18px_20px_12px] shrink-0">
        <div>
          <div className="text-[21px] font-semibold tracking-[-0.015em] text-text-main">Test runs</div>
          <div className="text-text-muted text-[13px] mt-[2px]">{runs.length} runs · grouped by status</div>
        </div>
        <div className="flex items-center gap-[8px]">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-[7px] h-[34px] px-[12px] bg-surface border border-border rounded-[9px] font-medium text-[13px] text-text-main hover:bg-surface-hover transition-colors"
          >
            <Filter size={17} className="text-text-faint" />Filter
          </button>
          {role !== "VIEWER" && (
            <Link
              href={`/projects/${code}/runs/create`}
              className="flex items-center gap-[7px] h-[34px] px-[14px] bg-primary text-white rounded-[9px] font-semibold text-[13px] shadow-sm hover:bg-primary-hover transition-colors"
            >
              <Plus size={17} />New run
            </Link>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="px-[20px] pb-[12px] flex gap-2">
           <input
             type="text"
             placeholder="Search test runs…"
             value={searchQuery}
             onChange={(e) => setSearchQuery(e.target.value)}
             className="px-[12px] py-[6px] text-[13px] border border-border bg-surface text-text-main rounded-[8px] focus:outline-none focus:ring-2 focus:ring-primary/20 w-[200px]"
           />
           <select
             value={statusFilter}
             onChange={(e) => setStatusFilter(e.target.value)}
             className="px-[12px] py-[6px] text-[13px] border border-border bg-surface text-text-main rounded-[8px] focus:outline-none"
           >
             <option value="ALL">All Statuses</option>
             <option value="ACTIVE">Active</option>
             <option value="COMPLETED">Completed</option>
             <option value="ABORTED">Aborted</option>
           </select>
        </div>
      )}

      {/* Board Columns */}
      <div className="grid grid-cols-3 gap-[14px] p-[4px_20px_24px] overflow-y-auto flex-1 min-h-0 items-start">
        {ZONES.map((zone) => {
          const zoneRuns = grouped[zone.key];
          return (
            <div key={zone.key} className="flex flex-col">
              <div className="flex items-center gap-[8px] p-[0_4px_11px] sticky top-0 bg-bg z-10">
                <span className="w-[9px] h-[9px] rounded-[3px]" style={{ background: zone.dot }} />
                <span className="font-semibold text-[13px] text-text-main">{zone.label}</span>
                <span className="text-[11px] font-bold bg-surface-hover border border-border text-text-muted px-[7px] py-[1px] rounded-full">
                  {zoneRuns.length}
                </span>
              </div>
              
              <div className="flex flex-col gap-[11px]">
                {zoneRuns.length === 0 ? (
                  <div className="h-[100px] border border-dashed border-border rounded-[12px] flex items-center justify-center text-[13px] text-text-faint">
                    No {zone.label.toLowerCase()} runs
                  </div>
                ) : (
                  zoneRuns.map((run) => renderRunRow(run))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete test run"
          message="This test run and all its results will be permanently deleted. This action cannot be undone."
          onConfirm={() => {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            handleDelete(id);
          }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
