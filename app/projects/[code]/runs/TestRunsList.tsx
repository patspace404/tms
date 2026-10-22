"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreVertical,
  Play,
  Plus,
  Search,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  Ban,
} from "lucide-react";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { runStats } from "@/lib/run-stats";
import { initialsOf, shortNameOf } from "@/lib/initials";
import { relativeDate } from "@/lib/relative-date";

const COLOR_PASS = "var(--success)";
const COLOR_WARN = "var(--warning)";
const COLOR_FAIL = "var(--danger)";

const rateColorFor = (pass: number) =>
  pass >= 90 ? COLOR_PASS : pass >= 70 ? COLOR_WARN : COLOR_FAIL;

const STATUSES = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "COMPLETED", label: "Completed" },
  { key: "ABORTED", label: "Aborted" },
] as const;

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "var(--primary)",
  COMPLETED: "var(--success)",
  ABORTED: "var(--border-strong)",
};

type SortKey = "title" | "rate" | "date";

interface TestRunsListProps {
  initialRuns: any[];
  code: string;
}

export function TestRunsList({ initialRuns, code }: TestRunsListProps) {
  const router = useRouter();
  const { role } = useProjectRole();
  const [runs, setRuns] = useState(initialRuns);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // The list opens on Active, because that is the run somebody came here to get
  // back into. A project with none would open on an empty page, which reads as
  // a fault rather than a filter, so those start on All.
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    initialRuns.some((r) => r.status === "ACTIVE") ? "ACTIVE" : "ALL",
  );
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "date",
    dir: -1,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleStatusChange = async (runId: string, status: "ABORTED" | "ACTIVE") => {
    setActiveDropdown(null);
    const previous = runs;
    setRuns((prev: any[]) => prev.map((r) => (r.id === runId ? { ...r, status } : r)));
    try {
      // Same verb the runner page uses, so both screens move a run through its
      // lifecycle the same way.
      const res = await fetch(
        `/api/runs/${runId}/${status === "ABORTED" ? "abort" : "reopen"}`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update the run");
      }
      toast.success(status === "ABORTED" ? "Run aborted" : "Run reopened");
      router.refresh();
    } catch (err) {
      setRuns(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update the run");
    }
  };

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

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: runs.length, ACTIVE: 0, COMPLETED: 0, ABORTED: 0 };
    for (const r of runs) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [runs]);

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = runs.filter(
      (run) =>
        (statusFilter === "ALL" || run.status === statusFilter) &&
        (!q || run.title.toLowerCase().includes(q)),
    );

    return [...list].sort((a, b) => {
      let v: number;
      if (sort.key === "title") v = a.title.localeCompare(b.title);
      else if (sort.key === "rate") v = runStats(a.results).passRate - runStats(b.results).passRate;
      else v = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      // Ties keep a stable order instead of reshuffling on every render.
      if (v === 0) v = a.id.localeCompare(b.id);
      return v * sort.dir;
    });
  }, [runs, searchQuery, statusFilter, sort]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, rowsPerPage, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / rowsPerPage));
  const page = Math.min(currentPage, totalPages);
  const from = (page - 1) * rowsPerPage;
  const pageRuns = visible.slice(from, from + rowsPerPage);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: (prev.dir * -1) as 1 | -1 }
        : { key, dir: key === "title" ? 1 : -1 },
    );

  const SortHeader = ({ label, k, align }: { label: string; k: SortKey; align?: "end" }) => {
    const on = sort.key === k;
    const Arrow = on && sort.dir === -1 ? ChevronDown : ChevronUp;
    return (
      <button
        type="button"
        onClick={() => toggleSort(k)}
        aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
        className={`group inline-flex items-center gap-[5px] transition-colors hover:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] rounded-[4px] ${
          on ? "text-text-main" : ""
        } ${align === "end" ? "justify-self-end" : ""}`}
      >
        {label}
        <Arrow
          size={11}
          strokeWidth={3}
          className={on ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-40"}
        />
      </button>
    );
  };

  /** Page numbers with the far ends always reachable: 1 2 3 … 12 */
  const pageNumbers = useMemo(() => {
    const set = new Set<number>([1, totalPages, page, page - 1, page + 1]);
    if (page <= 3) [2, 3, 4].forEach((n) => set.add(n));
    if (page >= totalPages - 2) [totalPages - 1, totalPages - 2, totalPages - 3].forEach((n) => set.add(n));
    return [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  return (
    <div className="w-full flex flex-col h-full bg-bg">
      <div className="flex items-end justify-between gap-[16px] p-[18px_20px_14px] shrink-0">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.015em] text-text-main">Test runs</h1>
          <p className="text-text-muted text-[13px] mt-[3px]">
            {counts.ALL} {counts.ALL === 1 ? "run" : "runs"} · {counts.ACTIVE} active
            {counts.ABORTED > 0 && ` · ${counts.ABORTED} aborted`}
          </p>
        </div>
        {role !== "VIEWER" && (
          <Link
            href={`/projects/${code}/runs/create`}
            className="flex items-center gap-[7px] h-[34px] px-[14px] bg-primary text-white rounded-[9px] font-semibold text-[13px] shadow-sm hover:bg-primary-hover transition-colors shrink-0"
          >
            <Plus size={17} />
            New run
          </Link>
        )}
      </div>

      <div className="flex items-center gap-[9px] px-[20px] pb-[13px] shrink-0 flex-wrap">
        <div className="relative flex-1 min-w-[210px] max-w-[340px]">
          <Search size={15} className="absolute left-[11px] top-[9.5px] text-text-faint pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test runs"
            className="w-full h-[34px] pl-[33px] pr-[12px] text-[13px] bg-surface border border-border rounded-[9px] text-text-main placeholder:text-text-faint focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors"
          />
        </div>
        <div className="inline-flex bg-surface border border-border rounded-[9px] p-[3px] gap-[2px]">
          {STATUSES.filter((s) => s.key === "ALL" || counts[s.key] > 0).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              aria-pressed={statusFilter === s.key}
              className={`inline-flex items-center gap-[6px] h-[26px] px-[11px] rounded-[7px] text-[12.5px] transition-colors ${
                statusFilter === s.key
                  ? "bg-text-main text-white font-semibold"
                  : "text-text-muted hover:text-text-main font-medium"
              }`}
            >
              {s.label}
              <span className="text-[11px] font-semibold opacity-60 tabular-nums">
                {counts[s.key] || 0}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-[20px] pb-[24px] flex-1 min-h-0 overflow-y-auto">
        <div className="bg-surface border border-border rounded-[12px] shadow-sm overflow-hidden">
          <div
            className="runs-grid runs-head px-[18px] h-[34px] border-b border-border text-[10.5px] font-semibold uppercase tracking-[0.06em] text-text-faint"
          >
            <span>Status</span>
            <SortHeader label="Run" k="title" />
            <span>Progress</span>
            <SortHeader label="Pass" k="rate" align="end" />
            <span>Owner</span>
            <SortHeader label="Updated" k="date" />
            <span />
          </div>

          {pageRuns.length === 0 ? (
            <div className="py-[56px] px-[18px] text-center">
              <p className="text-[13.5px] text-text-muted">
                {runs.length === 0
                  ? "No test runs yet."
                  : "No test runs match this filter."}
              </p>
              <p className="text-[12.5px] text-text-faint mt-[5px]">
                {runs.length === 0
                  ? "Create one to start recording results."
                  : "Try another status, or clear the search."}
              </p>
            </div>
          ) : (
            pageRuns.map((run) => {
              const { passed, failed, blocked, skipped, completionPercent, passRate, isFullyDecided } =
                runStats(run.results);
              const total = run.results?.length ?? 0;
              const decided = Math.max(passed + failed + blocked + skipped, 1);
              const readyToClose = isFullyDecided && run.status === "ACTIVE";
              const a = authorMeta(run.author);

              return (
                <div
                  key={run.id}
                  className="runs-grid relative px-[18px] h-[52px] border-b border-border last:border-b-0 hover:bg-surface-hover transition-colors group"
                >
                  {/* The whole row opens the run. An overlay rather than a
                      wrapper, so the menu button is not nested in a link. */}
                  <Link
                    href={`/projects/${code}/runs/${run.id}`}
                    className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)] rounded-[2px]"
                  >
                    <span className="sr-only">{run.title}</span>
                  </Link>

                  <span className="runs-status relative z-10 pointer-events-none inline-flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
                    <span
                      className="w-[6px] h-[6px] rounded-full shrink-0"
                      style={{ background: STATUS_DOT[run.status] ?? "var(--border-strong)" }}
                    />
                    <span className={run.status === "ACTIVE" ? "text-[color:var(--primary-text)] font-semibold" : ""}>
                      {run.status.charAt(0) + run.status.slice(1).toLowerCase()}
                    </span>
                    {readyToClose && <span className="runs-flag">Ready to close</span>}
                  </span>

                  <span className="runs-name relative z-10 pointer-events-none min-w-0 flex items-center gap-[8px]">
                    <span className="text-[13.5px] font-medium tracking-[-0.005em] text-text-main truncate group-hover:text-[color:var(--primary-text)] transition-colors">
                      {run.title}
                    </span>
                    {readyToClose && (
                      <span
                        className="runs-flag shrink-0 text-[10px] font-semibold text-success border border-success/30 px-[6px] py-[1px] rounded-[5px]"
                        title="Every case has a result — this run can be completed"
                      >
                        Ready to close
                      </span>
                    )}
                  </span>

                  {total === 0 ? (
                    <>
                      <span className="runs-progress relative z-10 pointer-events-none text-[12px] text-text-faint">
                        No cases
                      </span>
                      <span className="runs-rate relative z-10 pointer-events-none text-[13.5px] text-[color:var(--border-strong)] justify-self-end">
                        —
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="runs-progress relative z-10 pointer-events-none flex items-center gap-[9px]">
                        <span
                          className="flex-1 flex h-[4px] rounded-[2px] overflow-hidden bg-[color:var(--border-color)]"
                          title={`${passed} passed · ${failed} failed · ${blocked} blocked${skipped ? ` · ${skipped} skipped` : ""}`}
                        >
                          <i style={{ width: `${(passed / decided) * 100}%`, background: COLOR_PASS }} />
                          <i style={{ width: `${(failed / decided) * 100}%`, background: COLOR_FAIL }} />
                          <i style={{ width: `${(blocked / decided) * 100}%`, background: COLOR_WARN }} />
                          <i style={{ width: `${(skipped / decided) * 100}%`, background: "var(--border-strong)" }} />
                        </span>
                        <span className="text-[12px] text-text-faint tabular-nums min-w-[32px] text-right">
                          {completionPercent}%
                        </span>
                      </span>
                      <span
                        className="runs-rate relative z-10 pointer-events-none text-[13.5px] font-semibold tabular-nums justify-self-end"
                        style={{ color: rateColorFor(passRate) }}
                      >
                        {passRate}%
                      </span>
                    </>
                  )}

                  <span className="runs-owner relative z-10 pointer-events-none flex items-center gap-[8px] min-w-0">
                    <span
                      className="w-[23px] h-[23px] rounded-full grid place-items-center text-[9.5px] font-bold shrink-0"
                      style={
                        run.author
                          ? { background: "var(--primary-light)", color: "var(--primary-text)" }
                          : { background: "var(--bg-surface-hover)", color: "var(--text-faint)" }
                      }
                    >
                      {run.author ? a.initials : "–"}
                    </span>
                    <span className="text-[12.5px] text-text-muted truncate">{a.display}</span>
                  </span>

                  {/* "Today" is computed from the clock, so the server and the
                      browser can legitimately disagree — across midnight, or in
                      a different timezone. React is told to accept the
                      difference rather than treat it as a broken render. */}
                  <span
                    suppressHydrationWarning
                    title={new Date(run.updatedAt).toLocaleString()}
                    className="runs-updated relative z-10 pointer-events-none text-[12.5px] text-text-faint whitespace-nowrap"
                  >
                    {relativeDate(run.updatedAt)}
                  </span>

                  <div
                    className="runs-menu relative z-20 justify-self-end"
                    ref={activeDropdown === run.id ? dropdownRef : null}
                  >
                    <button
                      type="button"
                      aria-label={`Actions for ${run.title}`}
                      onClick={() => setActiveDropdown(activeDropdown === run.id ? null : run.id)}
                      className="p-[3px] rounded-md text-text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text-main hover:bg-surface-hover transition-opacity"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {activeDropdown === run.id && (
                      <div className="absolute right-0 mt-1 w-44 bg-surface border border-border rounded-xl shadow-premium z-30 py-1 overflow-hidden animate-in zoom-in-95 duration-200">
                        <Link
                          href={`/projects/${code}/runs/${run.id}`}
                          className="w-full text-left px-4 py-2 text-[13px] text-text-main hover:bg-surface-hover flex items-center"
                        >
                          <Play size={13} className="mr-2 text-text-muted" /> Open run
                        </Link>
                        {role !== "VIEWER" && run.status === "ACTIVE" && (
                          <button
                            onClick={() => handleStatusChange(run.id, "ABORTED")}
                            className="w-full text-left px-4 py-2 text-[13px] text-text-main hover:bg-surface-hover flex items-center"
                          >
                            <Ban size={13} className="mr-2 text-text-muted" /> Abort run
                          </button>
                        )}
                        {role !== "VIEWER" && run.status !== "ACTIVE" && (
                          <button
                            onClick={() => handleStatusChange(run.id, "ACTIVE")}
                            className="w-full text-left px-4 py-2 text-[13px] text-text-main hover:bg-surface-hover flex items-center"
                          >
                            <RotateCcw size={13} className="mr-2 text-text-muted" /> Reopen run
                          </button>
                        )}
                        {role !== "VIEWER" && (
                          <button
                            onClick={() => {
                              setActiveDropdown(null);
                              setConfirmDeleteId(run.id);
                            }}
                            className="w-full text-left px-4 py-2 text-[13px] text-danger hover:bg-danger-soft flex items-center"
                          >
                            <Trash2 size={13} className="mr-2" /> Delete run
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {visible.length > 0 && (
            <div className="flex items-center gap-[14px] px-[18px] py-[11px] border-t border-border flex-wrap">
              <span className="text-[12.5px] text-text-muted tabular-nums">
                {from + 1}–{Math.min(from + rowsPerPage, visible.length)} of {visible.length}
              </span>
              <span className="flex-1" />
              <label className="text-[12.5px] text-text-muted inline-flex items-center gap-[7px]">
                Rows
                <select
                  value={rowsPerPage}
                  onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  className="h-[28px] px-[5px] text-[12.5px] bg-surface border border-border rounded-[7px] text-text-main focus:outline-none focus:border-primary"
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-[2px]">
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  aria-label="Previous page"
                  className="min-w-[28px] h-[28px] grid place-items-center rounded-[7px] text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={15} />
                </button>
                {pageNumbers.map((n, i) => (
                  <React.Fragment key={n}>
                    {i > 0 && n - pageNumbers[i - 1] > 1 && (
                      <span className="min-w-[16px] grid place-items-center text-[12px] text-[color:var(--border-strong)]">
                        …
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCurrentPage(n)}
                      aria-current={n === page ? "page" : undefined}
                      className={`min-w-[28px] h-[28px] px-[8px] rounded-[7px] text-[12.5px] tabular-nums transition-colors ${
                        n === page
                          ? "bg-text-main text-white font-semibold"
                          : "text-text-muted font-medium hover:bg-surface-hover hover:text-text-main"
                      }`}
                    >
                      {n}
                    </button>
                  </React.Fragment>
                ))}
                <button
                  type="button"
                  onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  aria-label="Next page"
                  className="min-w-[28px] h-[28px] grid place-items-center rounded-[7px] text-text-muted hover:bg-surface-hover hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
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

function authorMeta(author: { name?: string | null; email?: string | null } | null | undefined) {
  return {
    // Short, because the column is 132px and a full SSO name truncates to
    // something that identifies nobody.
    display: shortNameOf(author?.name, author?.email),
    initials: initialsOf(author?.name, author?.email),
  };
}
