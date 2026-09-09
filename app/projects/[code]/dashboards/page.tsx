import React from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  Bug,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  Circle,
  FileText,
  Flag,
  Folder,
  GripHorizontal,
  ListChecks,
  MinusCircle,
  PlayCircle,
  ShieldAlert,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProjectDashboardFilters } from "./ProjectDashboardFilters";
import { runStats } from "@/lib/run-stats";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const dynamic = "force-dynamic";

type TrendDatum = {
  date: string;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
};

type DashboardProject = {
  code: string;
  name: string;
  cases: number;
  runs: number;
  automated: number;
  lastRunHealth: number | null;
};

type RecentRun = {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  project: { name: string; code: string };
  environment: { title: string } | null;
  metrics: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    invalid: number;
    /** Only IN_PROGRESS — see lib/run-stats.ts. */
    untested: number;
    /** Everything with a verdict, skipped and invalid included. */
    decided: number;
  };
};

type Schedule = {
  id: string;
  title: string;
  cron: string;
  project: { name: string; code: string };
};

type ProjectFilter = { code: string; name: string };

type HeatmapProject = {
  code: string;
  name: string;
  dailyHealth: Array<{
    date: string;
    passRate: number | null;
    totalRuns: number;
  }>;
};

type AuditLogEntry = {
  id: string;
  action: string;
  entity: string;
  details: string | null;
  createdAt: Date;
  user: { name: string | null; email: string } | null;
  project: { name: string; code: string } | null;
};

type MilestoneOption = { id: string; title: string };
type EnvironmentOption = { id: string; title: string };
type MilestoneProgress = {
  id: string;
  title: string;
  due: string;
  done: number;
  total: number;
  pass: number;
  active: boolean;
};

export default async function ProjectDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ timeframe?: string; milestone?: string; environment?: string }>;
}) {
  const { code } = await params;
  const resolvedSearchParams = await searchParams;
  const timeframeStr = resolvedSearchParams.timeframe || "30";
  const projectCodeFilter = code;
  const parsedTimeframe = parseInt(timeframeStr);
  const timeframeDays = [7, 14, 30, 60, 90].includes(parsedTimeframe) ? parsedTimeframe : 30;

  const projectMeta = await prisma.project.findUnique({
    where: { code },
    select: {
      id: true,
      name: true,
      code: true,
      milestones: { orderBy: { dueDate: "asc" }, select: { id: true, title: true } },
      environments: { orderBy: { title: "asc" }, select: { id: true, title: true } },
      _count: { select: { suites: true, members: true } },
    },
  });
  const milestoneOptions: MilestoneOption[] = projectMeta?.milestones || [];
  const environmentOptions: EnvironmentOption[] = projectMeta?.environments || [];
  const selectedMilestone = milestoneOptions.some((milestone) => milestone.id === resolvedSearchParams.milestone)
    ? resolvedSearchParams.milestone || ""
    : "";
  const selectedEnvironment = environmentOptions.some((environment) => environment.id === resolvedSearchParams.environment)
    ? resolvedSearchParams.environment || ""
    : "";
  const runFilter = {
    ...(projectCodeFilter ? { project: { code: projectCodeFilter } } : {}),
    ...(selectedMilestone ? { milestoneId: selectedMilestone } : {}),
    ...(selectedEnvironment ? { environmentId: selectedEnvironment } : {}),
  };

  let dashboardData = {
    metrics: { totalProjects: 0, totalCases: 0, totalRuns: 0, passRate: 0 },
    automation: { automated: 0, manual: 0, toBeAutomated: 0 },
    projects: [] as DashboardProject[],
    recentRuns: [] as RecentRun[],
    schedules: [] as Schedule[],
    trendData: [] as TrendDatum[],
    allProjectsForFilter: [] as ProjectFilter[],
    heatmapData: [] as HeatmapProject[],
    auditLogs: [] as AuditLogEntry[],
    milestoneProgress: [] as MilestoneProgress[],
  };

  // ── Extra analytics widgets (computed below) ──
  let widgets = {
    topFailing: [] as Array<{ title: string; suite: string; failed: number; total: number; href: string }>,
    flaky: [] as Array<{ title: string; suite: string; passed: number; failed: number; href: string }>,
    openDefects: [] as Array<{ id: string; key: string; url: string; summary: string; severity: string | null; project: string }>,
    openDefectCount: 0,
    execByUser: [] as Array<{ name: string; count: number }>,
    runStatus: { ACTIVE: 0, COMPLETED: 0, ABORTED: 0 } as Record<string, number>,
    statusDist: { PASSED: 0, FAILED: 0, BLOCKED: 0, SKIPPED: 0, IN_PROGRESS: 0 } as Record<string, number>,
    avgExecMs: 0,
    execCount: 0,
    coverageBySuite: [] as Array<{ title: string; total: number; passRate: number; href: string }>,
    priorityDist: [] as Array<{ priority: string; count: number }>,
    envBreakdown: [] as Array<{ title: string; count: number }>,
  };

  // "My work" — runs with cases still assigned to the current user to execute.
  let myWork = [] as Array<{
    runId: string;
    runTitle: string;
    projectCode: string;
    pending: number;
  }>;
  let myPendingTotal = 0;

  try {
    const allProjectsForFilter = await prisma.project.findMany({
      select: { code: true, name: true },
      orderBy: { name: "asc" },
    });

    const totalProjects = await prisma.project.count({
      where: projectCodeFilter ? { code: projectCodeFilter } : {},
    });
    const totalCases = await prisma.testCase.count({
      where: projectCodeFilter ? { project: { code: projectCodeFilter } } : {},
    });
    const totalRuns = await prisma.testRun.count({
      where: runFilter,
    });

    const automatedCasesCount = await prisma.testCase.count({
      where: {
        automationStatus: "AUTOMATED",
        ...(projectCodeFilter ? { project: { code: projectCodeFilter } } : {}),
      },
    });
    const manualCasesCount = await prisma.testCase.count({
      where: {
        automationStatus: "MANUAL",
        ...(projectCodeFilter ? { project: { code: projectCodeFilter } } : {}),
      },
    });
    const toBeAutomatedCount = await prisma.testCase.count({
      where: {
        automationStatus: "TO_BE_AUTOMATED",
        ...(projectCodeFilter ? { project: { code: projectCodeFilter } } : {}),
      },
    });

    // Project Quality Matrix Data
    const projectsList = await prisma.project.findMany({
      where: projectCodeFilter ? { code: projectCodeFilter } : {},
      include: {
        _count: { select: { testCases: true, testRuns: true } },
        testCases: { select: { automationStatus: true } },
        testRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { results: { select: { status: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Recent Runs Table Data
    const recentRuns = await prisma.testRun.findMany({
      where: runFilter,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        results: { select: { status: true } },
        project: { select: { name: true, code: true } },
        environment: { select: { title: true } },
      },
    });

    // Pipeline Schedules
    const schedules = await prisma.pipelineSchedule.findMany({
      where: {
        isActive: true,
        ...(projectCodeFilter ? { project: { code: projectCodeFilter } } : {}),
      },
      include: { project: { select: { name: true, code: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Fetch Trend Data for the timeframe
    const trendStartDate = new Date();
    trendStartDate.setDate(trendStartDate.getDate() - timeframeDays);

    // Bucket by the day each result was actually executed (updatedAt), not the
    // run's creation date — so a run created earlier but executed today moves
    // today's bar.
    const trendResults = await prisma.testRunResult.findMany({
      where: {
        updatedAt: { gte: trendStartDate },
        status: { not: "IN_PROGRESS" },
        testRun: runFilter,
      },
      select: { status: true, updatedAt: true },
    });

    // Group by Date
    const trendMap = new Map();
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      trendMap.set(dateStr, {
        date: dateStr,
        passed: 0,
        failed: 0,
        blocked: 0,
        skipped: 0,
      });
    }

    for (const res of trendResults) {
      const dateStr = new Date(res.updatedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
      const item = trendMap.get(dateStr);
      if (item) {
        if (res.status === "PASSED") item.passed++;
        if (res.status === "FAILED") item.failed++;
        if (res.status === "BLOCKED") item.blocked++;
        if (res.status === "SKIPPED") item.skipped++;
      }
    }

    let totalPassed = 0;
    let totalExecuted = 0;

    // Quality heatmap matrix: 30 days history of runs per project
    const heatmapStart = new Date();
    heatmapStart.setDate(heatmapStart.getDate() - timeframeDays);

    const heatmapRuns = await prisma.testRun.findMany({
      where: {
        ...runFilter,
        createdAt: { gte: heatmapStart },
      },
      include: {
        results: { select: { status: true } },
        project: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const projectDaysMap = new Map<string, Map<string, { passed: number, total: number, runs: number }>>();
    const dates: string[] = [];
    for (let i = timeframeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      dates.push(dateStr);
    }

    heatmapRuns.forEach((run) => {
      const dateStr = new Date(run.createdAt).toISOString().split("T")[0];
      const pCode = run.project.code;
      if (!projectDaysMap.has(pCode)) {
        projectDaysMap.set(pCode, new Map());
      }
      const dayMap = projectDaysMap.get(pCode)!;
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, { passed: 0, total: 0, runs: 0 });
      }
      const dayStats = dayMap.get(dateStr)!;
      dayStats.runs++;
      run.results.forEach((res) => {
        dayStats.total++;
        if (res.status === "PASSED") dayStats.passed++;
      });
    });

    const heatmapData = projectsList.map((p) => {
      const dayMap = projectDaysMap.get(p.code);
      const dailyHealth = dates.map((dateStr) => {
        const stats = dayMap?.get(dateStr);
        const passRate = stats && stats.total > 0 ? (stats.passed / stats.total) * 100 : null;
        return {
          date: dateStr,
          passRate,
          totalRuns: stats ? stats.runs : 0,
        };
      });

      return {
        code: p.code,
        name: p.name,
        dailyHealth,
      };
    });

    // Fetch real AuditLog entries
    const auditLogs = await prisma.auditLog.findMany({
      where: projectCodeFilter ? { project: { code: projectCodeFilter } } : {},
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        user: { select: { name: true, email: true } },
        project: { select: { name: true, code: true } },
      },
    });

    // ── Analytics widgets (one broad results fetch + a couple aggregates) ──
    const winStart = new Date();
    winStart.setDate(winStart.getDate() - timeframeDays);
    const runWindowWhere: any = {
      ...runFilter,
      createdAt: { gte: winStart },
    };

    const windowResults = await prisma.testRunResult.findMany({
      where: { testRun: runWindowWhere },
      select: {
        status: true,
        assigneeId: true,
        timeSpent: true,
        assignee: { select: { name: true, email: true } },
        testCase: {
          select: {
            id: true,
            title: true,
            project: { select: { code: true } },
            suite: { select: { id: true, title: true } },
          },
        },
      },
    });

    const windowRuns = await prisma.testRun.findMany({
      where: runWindowWhere,
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        environment: { select: { title: true } },
      },
    });

    const linkedIssues = await prisma.linkedIssue.findMany({
      where: projectCodeFilter ? { project: { code: projectCodeFilter } } : {},
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        key: true,
        url: true,
        summary: true,
        status: true,
        severity: true,
        project: { select: { code: true } },
      },
    });

    const priorityGroups = await prisma.testCase.groupBy({
      by: ["priority"],
      where: projectCodeFilter ? { project: { code: projectCodeFilter } } : {},
      _count: { _all: true },
    });

    // status distribution
    const statusDist = { PASSED: 0, FAILED: 0, BLOCKED: 0, SKIPPED: 0, IN_PROGRESS: 0 } as Record<string, number>;
    // per-case + per-suite aggregation
    const caseAgg = new Map<string, { id: string; code: string; title: string; suite: string; passed: number; failed: number; total: number }>();
    const suiteAgg = new Map<string, { id: string; code: string; title: string; passed: number; total: number }>();
    const userAgg = new Map<string, { name: string; count: number }>();
    const execTimes: number[] = []; // real per-result execution time (ms)
    for (const r of windowResults) {
      if (r.status in statusDist) statusDist[r.status]++;
      if (typeof r.timeSpent === "number" && r.timeSpent > 0)
        execTimes.push(r.timeSpent);
      const tc = r.testCase;
      if (tc) {
        const e = caseAgg.get(tc.id) || { id: tc.id, code: tc.project?.code || "", title: tc.title, suite: tc.suite?.title || "No Suite", passed: 0, failed: 0, total: 0 };
        e.total++;
        if (r.status === "PASSED") e.passed++;
        if (r.status === "FAILED") e.failed++;
        caseAgg.set(tc.id, e);
        const sKey = tc.suite?.id || "none";
        const s = suiteAgg.get(sKey) || { id: tc.suite?.id || "", code: tc.project?.code || "", title: tc.suite?.title || "No Suite", passed: 0, total: 0 };
        s.total++;
        if (r.status === "PASSED") s.passed++;
        suiteAgg.set(sKey, s);
      }
      if (r.assigneeId) {
        const name = r.assignee?.name || r.assignee?.email?.split("@")[0] || "Unknown";
        const u = userAgg.get(r.assigneeId) || { name, count: 0 };
        u.count++;
        userAgg.set(r.assigneeId, u);
      }
    }

    const runStatus = { ACTIVE: 0, COMPLETED: 0, ABORTED: 0 } as Record<string, number>;
    const envAgg = new Map<string, number>();
    for (const r of windowRuns) {
      const k = r.status === "COMPLETED" ? "COMPLETED" : r.status === "ABORTED" ? "ABORTED" : "ACTIVE";
      runStatus[k]++;
      const env = r.environment?.title || "Unspecified";
      envAgg.set(env, (envAgg.get(env) || 0) + 1);
    }

    const isOpen = (s: string | null) => !s || !/closed|done|resolved|fixed/i.test(s);
    const openDefectsList = linkedIssues.filter((i) => isOpen(i.status));

    const caseHref = (c: { code: string; id: string }) =>
      c.code ? `/projects/${c.code}/cases/${c.id}/edit` : "";
    const suiteHref = (s: { code: string; id: string }) =>
      s.code && s.id ? `/projects/${s.code}/repository?suite=${s.id}` : "";

    widgets = {
      topFailing: [...caseAgg.values()]
        .filter((c) => c.failed > 0)
        .sort((a, b) => b.failed - a.failed)
        .slice(0, 6)
        .map((c) => ({ title: c.title, suite: c.suite, failed: c.failed, total: c.total, href: caseHref(c) })),
      flaky: [...caseAgg.values()]
        .filter((c) => c.passed > 0 && c.failed > 0)
        .sort((a, b) => Math.min(b.passed, b.failed) - Math.min(a.passed, a.failed))
        .slice(0, 6)
        .map((c) => ({ title: c.title, suite: c.suite, passed: c.passed, failed: c.failed, href: caseHref(c) })),
      openDefects: openDefectsList.slice(0, 6).map((i) => ({
        id: i.id,
        key: i.key,
        url: i.url,
        summary: i.summary,
        severity: i.severity,
        project: i.project.code,
      })),
      openDefectCount: openDefectsList.length,
      execByUser: [...userAgg.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      runStatus,
      statusDist,
      avgExecMs: execTimes.length ? execTimes.reduce((a, b) => a + b, 0) / execTimes.length : 0,
      execCount: execTimes.length,
      coverageBySuite: [...suiteAgg.values()]
        .map((v) => ({ title: v.title, total: v.total, passRate: v.total ? Math.round((v.passed / v.total) * 100) : 0, href: suiteHref(v) }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 6),
      priorityDist: priorityGroups
        .map((g) => ({ priority: (g.priority as string) || "None", count: g._count._all }))
        .sort((a, b) => b.count - a.count),
      envBreakdown: [...envAgg.entries()]
        .map(([title, count]) => ({ title, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    };

    // ── My work: cases still assigned to me to execute (untested) ──
    const session = await getServerSession(authOptions);
    const myId = (session?.user as any)?.id as string | undefined;
    if (myId) {
      const myPending = await prisma.testRunResult.findMany({
        where: {
          assigneeId: myId,
          status: "IN_PROGRESS",
          testRun: {
            status: "ACTIVE",
            ...runFilter,
          },
        },
        select: {
          testRun: {
            select: { id: true, title: true, project: { select: { code: true } } },
          },
        },
      });
      myPendingTotal = myPending.length;
      const runMap = new Map<string, { runId: string; runTitle: string; projectCode: string; pending: number }>();
      for (const r of myPending) {
        const run = r.testRun;
        if (!run) continue;
        const e = runMap.get(run.id) || {
          runId: run.id,
          runTitle: run.title,
          projectCode: run.project.code,
          pending: 0,
        };
        e.pending++;
        runMap.set(run.id, e);
      }
      myWork = [...runMap.values()].sort((a, b) => b.pending - a.pending).slice(0, 6);
    }

    const milestoneRows = await prisma.milestone.findMany({
      where: {
        project: { code: projectCodeFilter },
        ...(selectedMilestone ? { id: selectedMilestone } : {}),
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 4,
      include: {
        testRuns: {
          where: selectedEnvironment ? { environmentId: selectedEnvironment } : {},
          include: { results: { select: { status: true } } },
        },
      },
    });
    const milestoneProgress: MilestoneProgress[] = milestoneRows.map((milestone) => {
      const results = milestone.testRuns.flatMap((run) => run.results);
      const total = results.length;
      const done = results.filter((result) => result.status !== "IN_PROGRESS").length;
      const passed = results.filter((result) => result.status === "PASSED").length;
      const due = milestone.dueDate ? `· due ${milestone.dueDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "· no due date";
      return {
        id: milestone.id,
        title: milestone.title,
        due,
        done,
        total,
        pass: done ? Math.round((passed / done) * 100) : 0,
        active: milestone.status !== "COMPLETED",
      };
    });

    dashboardData = {
      allProjectsForFilter,
      metrics: {
        totalProjects,
        totalCases,
        totalRuns,
        passRate: 0,
      },
      automation: {
        automated: automatedCasesCount,
        manual: manualCasesCount,
        toBeAutomated: toBeAutomatedCount,
      },
      projects: projectsList.map((p) => {
        const automated = p.testCases.filter(
          (tc) => tc.automationStatus === "AUTOMATED",
        ).length;
        const total = p.testCases.length;
        const autoPercent = total > 0 ? (automated / total) * 100 : 0;

        let lastRunHealth = null;
        if (p.testRuns.length > 0) {
          const run = p.testRuns[0];
          const passed = run.results.filter(
            (r) => r.status === "PASSED",
          ).length;
          const runTotal = run.results.length;
          lastRunHealth = runTotal > 0 ? (passed / runTotal) * 100 : null;
        }

        return {
          code: p.code,
          name: p.name,
          cases: total,
          runs: p._count.testRuns,
          automated: autoPercent,
          lastRunHealth,
        };
      }),
      recentRuns: recentRuns.map((run) => {
        const total = run.results.length;
        // Subtracting the known statuses used to sweep INVALID into
        // "untested"; runStats counts only IN_PROGRESS as awaiting a verdict.
        const s = runStats(run.results);
        const { passed, failed, blocked, skipped, invalid, untested, decided } = s;

        totalPassed += passed;
        totalExecuted += decided;

        return {
          id: run.id,
          title: run.title,
          status: run.status,
          createdAt: run.createdAt,
          project: run.project,
          environment: run.environment,
          metrics: { total, passed, failed, blocked, skipped, invalid, untested, decided },
        };
      }),
      schedules,
      trendData: Array.from(trendMap.values()),
      heatmapData,
      auditLogs,
      milestoneProgress,
    };

    dashboardData.metrics.passRate =
      totalExecuted > 0 ? (totalPassed / totalExecuted) * 100 : 0;
  } catch (err) {
    console.error("Failed to fetch QA dashboard data:", err);
  }

  const {
    metrics,
    automation,
    projects,
    recentRuns,
    schedules,
    trendData,
    allProjectsForFilter,
    heatmapData,
    auditLogs,
    milestoneProgress,
  } = dashboardData;

  const totalAutomationCases =
    automation.automated + automation.manual + automation.toBeAutomated;
  const automatedPercent =
    totalAutomationCases > 0
      ? (automation.automated / totalAutomationCases) * 100
      : 0;
  const failedOrBlocked = recentRuns.reduce(
    (sum, run) => sum + run.metrics.failed + run.metrics.blocked,
    0,
  );
  const activeRuns = recentRuns.filter(
    (run) => run.status !== "COMPLETED" && run.metrics.untested > 0,
  ).length;
  const executedResults = recentRuns.reduce(
    (sum, run) => sum + run.metrics.decided,
    0,
  );


  const maxExec = Math.max(1, ...widgets.execByUser.map((u) => u.count));
  const maxPrio = Math.max(1, ...widgets.priorityDist.map((p) => p.count));
  const maxEnv = Math.max(1, ...widgets.envBreakdown.map((e) => e.count));
  // Real per-execution time from result.timeSpent (ms), not run wall-clock.
  const avgExecSec = widgets.avgExecMs / 1000;
  const avgExecLabel =
    widgets.execCount === 0
      ? "—"
      : avgExecSec >= 60
        ? `${Math.floor(avgExecSec / 60)}m ${Math.round(avgExecSec % 60)}s`
        : `${Math.round(avgExecSec)}s`;
  const PRIORITY_COLOR: Record<string, string> = {
    HIGH: "var(--danger)",
    CRITICAL: "#dc2626",
    MEDIUM: "var(--warning)",
    LOW: "var(--success)",
    TRIVIAL: "var(--skip)",
    NONE: "#cbd5e1",
  };

  const nf = new Intl.NumberFormat("en-US");
  const pct = (value: number) => `${Math.round(value)}%`;
  const formatAge = (date: Date | null | undefined) => {
    if (!date) return "No activity";
    const diff = Date.now() - date.getTime();
    const mins = Math.max(1, Math.round(diff / 60000));
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };
  const spark = (values: number[]) => {
    const width = 78;
    const height = 26;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = max - min || 1;
    return values
      .map((value, index) => {
        const x = (index * (width / (values.length - 1))).toFixed(1);
        const y = (height - 2 - ((value - min) / spread) * (height - 4)).toFixed(1);
        return `${x},${y}`;
      })
      .join(" ");
  };
  const healthTone = (health: number | null) => {
    const value = health ?? 0;
    if (value >= 90) {
      return {
        bg: "var(--success-soft)",
        color: "var(--success-foreground)",
        dot: "var(--success)",
      };
    }
    if (value >= 75) {
      return {
        bg: "var(--warning-soft)",
        color: "var(--warning-foreground)",
        dot: "var(--warning)",
      };
    }
    return {
      bg: "var(--danger-soft)",
      color: "var(--danger-foreground)",
      dot: "var(--danger)",
    };
  };
  const projectRows = [...projects]
    .sort((a, b) => (b.lastRunHealth ?? -1) - (a.lastRunHealth ?? -1))
    .slice(0, 12)
    .map((project, index) => {
      const projectRuns = recentRuns.filter((run) => run.project.code === project.code);
      const running = projectRuns.filter((run) => run.status !== "COMPLETED").length;
      const lastRun = projectRuns[0];
      const health = project.lastRunHealth ?? 0;
      const tone = healthTone(project.lastRunHealth);
      const seed = health + project.automated + project.runs + index * 7;
      return {
        ...project,
        rank: index + 1,
        abbr: project.code.slice(0, 2).toUpperCase(),
        suites: Math.max(1, Math.round(project.cases / 64)),
        activeRuns: running,
        totalRuns: project.runs,
        lastActivity: formatAge(lastRun?.createdAt),
        fresh: !!lastRun && Date.now() - lastRun.createdAt.getTime() < 1000 * 60 * 60 * 24 * 2,
        health,
        tone,
        spark: spark([
          Math.max(1, seed - 9),
          Math.max(1, seed - 4),
          Math.max(1, seed - 6),
          Math.max(1, seed - 1),
          seed + 2,
          seed + 1,
          seed + 4,
        ]),
      };
    });

  const heatRows = heatmapData.slice(0, 12).map((row) => {
    const sourceCells = row.dailyHealth || [];
    return {
      ...row,
      dailyHealth: Array.from({ length: timeframeDays }, (_, index) => {
        const cell = sourceCells[index];
        return {
          date: cell?.date || `${index}`,
          passRate: cell?.passRate ?? null,
          totalRuns: cell?.totalRuns || 0,
        };
      }),
    };
  });
  const heatColor = (passRate: number | null, totalRuns: number) => {
    if (!totalRuns || passRate === null) return "var(--surface-2)";
    if (passRate < 65) return "var(--heat-0)";
    if (passRate < 80) return "var(--heat-1)";
    if (passRate < 90) return "var(--heat-2)";
    if (passRate < 97) return "var(--heat-3)";
    return "var(--heat-4)";
  };

  const topFailingItems =
    widgets.topFailing.length > 0
      ? widgets.topFailing.slice(0, 4).map((item) => ({
          project: item.suite,
          title: item.title,
          metric: `${item.failed}/${item.total}`,
          color: "var(--danger)",
          href: item.href,
        }))
      : recentRuns.slice(0, 4).map((run) => ({
          project: run.project.code,
          title: run.title,
          metric: `${run.metrics.failed + run.metrics.blocked}`,
          color: "var(--warning)",
          href: `/projects/${run.project.code}/runs/${run.id}`,
        }));
  const riskFailingItems = topFailingItems;
  const defectItems = widgets.openDefects.slice(0, 4);
  const activityItems =
    auditLogs.slice(0, 5).map((entry) => ({
          id: entry.id,
          who: entry.user?.name || entry.user?.email || "System",
          action: entry.action,
          project: entry.project?.code || entry.entity,
          when: formatAge(entry.createdAt),
          tone: "primary",
        }));
  const myWorkItems =
    myWork.map((work) => ({
          id: work.runId,
          title: work.runTitle,
          project: work.projectCode,
          href: `/projects/${work.projectCode}/runs/${work.runId}`,
          metric: `${work.pending} left`,
        }));
  const scheduleItems =
    schedules.slice(0, 5).map((schedule) => ({
          id: schedule.id,
          title: schedule.title,
          project: schedule.project.code,
          cron: schedule.cron,
          when: "active",
        }));

  const appKpis = [
    {
      label: "Pass rate",
      value: pct(metrics.passRate),
      icon: CheckCircle2,
      delta: `${nf.format(executedResults)} executed`,
      color: "var(--success)",
      spark: spark([metrics.passRate, metrics.passRate]),
    },
    {
      label: "Test runs",
      value: nf.format(metrics.totalRuns),
      icon: PlayCircle,
      delta: `${timeframeDays}d window`,
      color: "var(--primary)",
      spark: spark([metrics.totalRuns, metrics.totalRuns]),
    },
    {
      label: "Automation",
      value: pct(automatedPercent),
      icon: Bot,
      delta: `${nf.format(automation.automated)} automated`,
      color: "var(--primary)",
      spark: spark([automatedPercent, automatedPercent]),
    },
    {
      label: "Test cases",
      value: nf.format(metrics.totalCases),
      icon: Workflow,
      delta: `${nf.format(widgets.priorityDist.reduce((sum, item) => sum + item.count, 0))} prioritized`,
      color: "var(--primary)",
      spark: spark([metrics.totalCases, metrics.totalCases]),
    },
    {
      label: "Active runs",
      value: nf.format(activeRuns),
      icon: Activity,
      delta: `${widgets.runStatus.COMPLETED} completed`,
      color: "var(--primary)",
      spark: spark([activeRuns, activeRuns]),
    },
  ];
  const statusTotal = Object.values(widgets.statusDist).reduce((sum, value) => sum + value, 0);
  const statusSegments = [
    { label: "Passed", count: widgets.statusDist.PASSED, pct: statusTotal ? Math.round((widgets.statusDist.PASSED / statusTotal) * 100) : 0, color: "var(--success)" },
    { label: "Failed", count: widgets.statusDist.FAILED, pct: statusTotal ? Math.round((widgets.statusDist.FAILED / statusTotal) * 100) : 0, color: "var(--danger)" },
    { label: "Blocked", count: widgets.statusDist.BLOCKED, pct: statusTotal ? Math.round((widgets.statusDist.BLOCKED / statusTotal) * 100) : 0, color: "var(--warning)" },
    { label: "Skipped", count: widgets.statusDist.SKIPPED, pct: statusTotal ? Math.round((widgets.statusDist.SKIPPED / statusTotal) * 100) : 0, color: "var(--skip)" },
    { label: "Untested", count: widgets.statusDist.IN_PROGRESS, pct: statusTotal ? Math.round((widgets.statusDist.IN_PROGRESS / statusTotal) * 100) : 0, color: "var(--text-faint)" },
  ];
  const appRiskCards = [
    {
      title: "Top failing",
      icon: ShieldAlert,
      badge: `${riskFailingItems.length}`,
      badgeBg: "var(--danger-soft)",
      badgeColor: "var(--danger-foreground)",
      iconColor: "var(--danger)",
      items: riskFailingItems,
    },
    {
      title: "Flaky tests",
      icon: Activity,
      badge: `${widgets.flaky.length}`,
      badgeBg: "var(--info-soft)",
      badgeColor: "var(--info-foreground)",
      iconColor: "var(--info)",
      items: widgets.flaky.slice(0, 4).map((item) => ({
            project: item.suite,
            title: item.title,
            metric: `${item.passed}/${item.failed}`,
            color: "var(--info)",
            href: item.href,
          })),
    },
    {
      title: "Open defects",
      icon: AlertTriangle,
      badge: `${widgets.openDefectCount}`,
      badgeBg: "var(--warning-soft)",
      badgeColor: "var(--warning-foreground)",
      iconColor: "var(--warning)",
      items: defectItems.map((item) => ({
        project: item.key,
        title: item.summary,
        metric: item.severity || item.project,
        color: "var(--danger)",
        href: item.url,
      })),
    },
  ];
  const trendRates = trendData.map((day) => {
    const total = day.passed + day.failed + day.blocked + day.skipped;
    return total ? Math.round((day.passed / total) * 100) : 0;
  });
  const trendChartRates = trendRates.length ? trendRates : [0, 0];
  const trendChartPoints = trendChartRates.map((rate, index) => {
    const x = trendChartRates.length === 1 ? 0 : (index * 620) / (trendChartRates.length - 1);
    const y = 140 - (rate / 100) * 118 - 10;
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });
  const trendLinePath = trendChartPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const trendAreaPath = `M0 140 L${trendChartPoints.map((point) => `${point.x} ${point.y}`).join(" L")} L620 140 Z`;

  return (
    <div className={`${inter.className} min-h-screen bg-background text-[14px] leading-[1.45] text-text-main antialiased`}>
      {/* SCOPED PROJECT HEADER */}
      <div className="border-b border-border bg-surface p-[20px_22px]">
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[12px]">
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[13px] bg-primary text-[18px] font-bold text-primary-foreground shadow-sm">
            {code.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[4px]">
              <span className="font-mono text-[12px] font-semibold text-text-faint">{code}</span>
              <span className="text-[20px] font-semibold tracking-[-0.015em]">{projectMeta?.name || code}</span>
              <span className="inline-flex items-center gap-[5px] rounded-full bg-success-soft p-[2px_9px] text-[11px] font-bold text-success">
                <span className="h-[6px] w-[6px] rounded-full bg-success"></span>Healthy
              </span>
            </div>
            <div className="mt-[6px] flex items-center gap-[14px] text-[12.5px] text-text-muted">
              <span className="flex items-center gap-[5px]">
                <FileText size={15} className="text-text-faint" />
                {nf.format(metrics.totalCases)} cases
              </span>
              <span className="flex items-center gap-[5px]">
                <Folder size={15} className="text-text-faint" />
                {projectMeta?._count.suites || 0} suites
              </span>
              <span className="flex items-center gap-[5px]">
                <Activity size={15} className="text-text-faint" />
                {projectMeta?._count.members || 0} members
              </span>
            </div>
          </div>
          <ProjectDashboardFilters
            projectCode={code}
            milestones={milestoneOptions}
            environments={environmentOptions}
            selectedMilestone={selectedMilestone}
            selectedEnvironment={selectedEnvironment}
            timeframe={timeframeDays}
          />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1240px] p-[20px_22px]">
        {/* KPIs (this project) */}
        <div className="mb-[14px] grid grid-cols-4 gap-[14px]">
          <div className="rounded-[12px] border border-border bg-surface p-[15px_16px] shadow-sm">
            <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
              <CheckCircle2 size={16} className="text-text-faint" />
              Pass rate
            </div>
            <div className="mt-[9px] text-[27px] font-semibold tabular-nums tracking-[-0.02em]">
              {pct(metrics.passRate)}
            </div>
            <div className="mt-[6px] flex items-center gap-[4px] text-[12px] font-semibold text-success">
              <ArrowUpRight size={15} />
              {nf.format(executedResults)} executed
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface p-[15px_16px] shadow-sm">
            <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
              <FileText size={16} className="text-text-faint" />
              Test cases
            </div>
            <div className="mt-[9px] text-[27px] font-semibold tabular-nums tracking-[-0.02em]">
              {nf.format(metrics.totalCases)}
            </div>
            <div className="mt-[6px] flex items-center gap-[4px] text-[12px] font-semibold text-text-muted">
              <ArrowUpRight size={15} />
              {nf.format(widgets.priorityDist.reduce((sum, item) => sum + item.count, 0))} prioritized
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface p-[15px_16px] shadow-sm">
            <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
              <Bot size={16} className="text-text-faint" />
              Automation
            </div>
            <div className="mt-[9px] text-[27px] font-semibold tabular-nums tracking-[-0.02em]">
              {pct(automatedPercent)}
            </div>
            <div className="mt-[6px] flex items-center gap-[4px] text-[12px] font-semibold text-success">
              <ArrowUpRight size={15} />
              {nf.format(automation.automated)} automated
            </div>
          </div>
          <div className="rounded-[12px] border border-border bg-surface p-[15px_16px] shadow-sm">
            <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
              <Zap size={16} className="text-text-faint" />
              Active runs
            </div>
            <div className="mt-[9px] text-[27px] font-semibold tabular-nums tracking-[-0.02em]">
              {activeRuns}
            </div>
            <div className="mt-[6px] flex items-center gap-[4px] text-[12px] font-semibold text-text-muted">
              <Zap size={15} />{widgets.runStatus.COMPLETED} completed
            </div>
          </div>
        </div>

        {/* execution trend + run-status snapshot */}
        <div className="mb-[14px] grid grid-cols-[1.7fr_1fr] gap-[14px]">
          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[6px] flex items-center justify-between">
              <div className="text-[14.5px] font-semibold">Execution trend</div>
              <div className="flex items-center gap-[5px] text-[12px] text-text-muted">
                <span className="h-[9px] w-[9px] rounded-[3px] bg-primary"></span>
                Pass rate
              </div>
            </div>
            <svg viewBox="0 0 620 140" width="100%" height="150" preserveAspectRatio="none" className="block">
              <defs>
                <linearGradient id="potrend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22"></stop>
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0"></stop>
                </linearGradient>
              </defs>
              <line x1="0" y1="35" x2="620" y2="35" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4"></line>
              <line x1="0" y1="88" x2="620" y2="88" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4"></line>
              <path d={trendAreaPath} fill="url(#potrend)"></path>
              <path d={trendLinePath} fill="none" stroke="var(--primary)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"></path>
              {trendChartPoints.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r="2.6" fill="var(--surface)" stroke="var(--primary)" strokeWidth="1.6"></circle>
              ))}
            </svg>
            <div className="mt-[4px] flex justify-between text-[11px] text-text-faint">
              <span>4 wks ago</span>
              <span>3 wks</span>
              <span>2 wks</span>
              <span>last wk</span>
              <span>today</span>
            </div>
          </div>

          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[13px] text-[14.5px] font-semibold">Run status</div>
            <div className="flex flex-col gap-[11px]">
              {[
                { label: "Active", sub: "in progress now", count: activeRuns, icon: PlayCircle, iconBg: "var(--primary-soft)", iconColor: "var(--primary-text)" },
                { label: "Completed", sub: `last ${timeframeDays} days`, count: widgets.runStatus.COMPLETED, icon: CheckCircle2, iconBg: "var(--success-soft)", iconColor: "var(--success)" },
                { label: "Aborted", sub: "needs attention", count: widgets.runStatus.ABORTED, icon: XCircle, iconBg: "var(--danger-soft)", iconColor: "var(--danger)" },
              ].map((r, i) => {
                const Icon = r.icon;
                return (
                  <div key={i} className="flex items-center gap-[11px] rounded-[10px] bg-surface-hover p-[11px_12px]">
                    <div className="flex h-[32px] w-[32px] items-center justify-center rounded-[8px]" style={{ background: r.iconBg, color: r.iconColor }}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold">{r.label}</div>
                      <div className="text-[11px] text-text-faint">{r.sub}</div>
                    </div>
                    <div className="tabular-nums text-[20px] font-bold" style={{ color: r.iconColor }}>{r.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* milestone progress + coverage by suite */}
        <div className="mb-[14px] grid grid-cols-2 gap-[14px]">
          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[14px] text-[14.5px] font-semibold">Milestone progress</div>
            <div className="flex flex-col gap-[15px]">
              {milestoneProgress.length ? milestoneProgress.map((m) => (
                <div key={m.id}>
                  <div className="mb-[7px] flex items-center gap-[8px]">
                    <Flag size={16} style={{ color: m.active ? "var(--primary-text)" : "var(--text-faint)" }} />
                    <span className="text-[13px] font-semibold">{m.title}</span>
                    <span className="text-[11px] text-text-faint">{m.due}</span>
                    <span className="ml-auto tabular-nums text-[11.5px] font-bold text-success">{m.pass}% pass</span>
                  </div>
                  <div className="flex items-center gap-[9px]">
                    <div className="h-[8px] flex-1 overflow-hidden rounded-[4px] bg-surface-hover">
                      <div className="h-full" style={{ width: `${Math.round((m.done / m.total) * 100)}%`, background: m.active ? "var(--primary)" : "var(--success)" }}></div>
                    </div>
                    <span className="w-[74px] text-right tabular-nums text-[11.5px] font-semibold text-text-muted">{m.done}/{m.total} done</span>
                  </div>
                </div>
              )) : <div className="py-[18px] text-[12.5px] text-text-muted">No milestones with runs yet.</div>}
            </div>
          </div>

          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[14px] flex items-center justify-between">
              <div className="text-[14.5px] font-semibold">Coverage by suite</div>
              <span className="text-[12px] font-semibold text-primary">Repository</span>
            </div>
            <div className="flex flex-col gap-[13px]">
              {widgets.coverageBySuite.length > 0
                ? widgets.coverageBySuite.slice(0, 5).map((s, i) => {
                    const color = s.passRate >= 85 ? "var(--success)" : s.passRate >= 70 ? "var(--warning)" : "var(--danger)";
                    return (
                      <div key={i} className="flex items-center gap-[10px] text-[12.5px]">
                        <Folder size={16} className="text-text-faint" />
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span className="tabular-nums text-[11px] text-text-faint">{s.total} cases</span>
                        <div className="h-[6px] w-[92px] overflow-hidden rounded-[3px] bg-surface-hover">
                          <div className="h-full" style={{ width: `${s.passRate}%`, background: color }}></div>
                        </div>
                        <span className="w-[34px] text-right tabular-nums font-bold">{s.passRate}%</span>
                      </div>
                    );
                  })
                : <div className="py-[18px] text-[12.5px] text-text-muted">No suite coverage in this filter.</div>}
            </div>
          </div>
        </div>

        {/* recent runs + open defects */}
        <div className="mb-[14px] grid grid-cols-[1.5fr_1fr] gap-[14px]">
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between p-[14px_16px]">
              <div className="text-[14.5px] font-semibold">Recent runs</div>
              <span className="text-[12px] font-semibold text-primary">Test Runs</span>
            </div>
            <div className="grid grid-cols-[1fr_80px_110px_70px] gap-[10px] border-y border-border p-[7px_16px] text-[10px] font-semibold uppercase tracking-[0.05em] text-text-faint">
              <div>Run</div><div>Env</div><div>Result</div><div className="text-right">When</div>
            </div>
            {recentRuns.length > 0 ? recentRuns.slice(0, 4).map((run, i) => {
              const pass = run.metrics.total ? Math.round((run.metrics.passed / run.metrics.total) * 100) : 0;
              const passColor = pass >= 90 ? "var(--success)" : pass >= 75 ? "var(--warning)" : "var(--danger)";
              return (
                <div key={i} className="grid grid-cols-[1fr_80px_110px_70px] items-center gap-[10px] border-b border-border p-[11px_16px]">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{run.title}</div>
                    <div className="font-mono text-[10px] text-text-faint">{String(run.id).slice(0, 8)}</div>
                  </div>
                  <div className="text-[11.5px] text-text-muted">{run.environment?.title || "—"}</div>
                  <div className="flex items-center gap-[7px]">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-surface-hover">
                      <div className="h-full" style={{ width: `${pass}%`, background: passColor }}></div>
                    </div>
                    <span className="text-[11px] font-bold" style={{ color: passColor }}>{pass}%</span>
                  </div>
                  <div className="text-right text-[11px] text-text-faint">{formatAge(run.createdAt)}</div>
                </div>
              );
            }) : <div className="p-[18px_16px] text-[12.5px] text-text-muted">No runs in this filter.</div>}
          </div>

          <div className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
            <div className="flex items-center gap-[8px] border-b border-border p-[14px_16px]">
              <Bug size={18} className="text-warning" />
              <span className="text-[14.5px] font-semibold">Open defects</span>
              <span className="ml-auto rounded-full bg-warning-soft p-[1px_8px] text-[11px] font-bold text-warning">
                {widgets.openDefectCount}
              </span>
            </div>
            {defectItems.map((d, i) => {
              const pBg = d.severity === "P1" || d.severity === "CRITICAL" ? "var(--danger-soft)" : d.severity === "P2" || d.severity === "MEDIUM" ? "var(--warning-soft)" : "var(--surface-hover)";
              const pColor = d.severity === "P1" || d.severity === "CRITICAL" ? "var(--danger)" : d.severity === "P2" || d.severity === "MEDIUM" ? "var(--warning)" : "var(--text-faint)";
              return (
                <div key={i} className="flex items-center gap-[10px] border-b border-border p-[10px_16px]">
                  <span className="w-[52px] font-mono text-[10px] text-text-faint">{d.key}</span>
                  <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{d.summary}</div>
                  <span className="rounded-[6px] p-[1px_7px] text-[10px] font-bold" style={{ background: pBg, color: pColor }}>{d.severity}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* contributors + my work in this project */}
        <div className="grid grid-cols-2 gap-[14px]">
          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[13px] text-[14.5px] font-semibold">Contributors <span className="text-[12px] font-normal text-text-faint">· this project</span></div>
            <div className="flex flex-col gap-[12px]">
              {widgets.execByUser.length > 0 ? widgets.execByUser.slice(0, 4).map((c, i) => {
                const avs = [
                  ["var(--primary-soft)", "var(--primary-text)"],
                  ["var(--info-soft)", "var(--info)"],
                  ["var(--success-soft)", "var(--success)"],
                  ["var(--warning-soft)", "var(--warning)"],
                ];
                const avBg = avs[i % 4][0];
                const avColor = avs[i % 4][1];
                const maxC = widgets.execByUser.length > 0 ? Math.max(1, ...widgets.execByUser.map(x => x.count)) : 418;
                return (
                  <div key={i} className="flex items-center gap-[10px]">
                    <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: avBg, color: avColor }}>
                      {c.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium">{c.name}</div>
                      <div className="mt-[5px] h-[4px] overflow-hidden rounded-[2px] bg-surface-hover">
                        <div className="h-full bg-primary" style={{ width: `${Math.round((c.count / maxC) * 100)}%` }}></div>
                      </div>
                    </div>
                    <span className="text-[11.5px] text-text-faint">{i === 0 ? "Lead" : "Eng"}</span>
                    <span className="w-[40px] text-right tabular-nums text-[12px] font-bold">{c.count}</span>
                  </div>
                );
              }) : <div className="py-[18px] text-[12.5px] text-text-muted">No assigned executions in this filter.</div>}
            </div>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border p-[14px_16px]">
              <div className="text-[14.5px] font-semibold">My work <span className="text-[12px] font-normal text-text-faint">· in {projectMeta?.name || code}</span></div>
              <span className="rounded-full bg-primary-soft p-[2px_8px] text-[11px] font-bold text-primary">{myWorkItems.length}</span>
            </div>
            {myWorkItems.length > 0 ? myWorkItems.slice(0, 4).map((m: any, i) => {
              let Icon = Circle;
              let iconColor = "var(--text-faint)";
              if (m.status === "failed") { Icon = XCircle; iconColor = "var(--danger)"; }
              if (m.status === "blocked") { Icon = MinusCircle; iconColor = "var(--warning)"; }
              if (m.status === "passed") { Icon = CheckCircle2; iconColor = "var(--success)"; }
              
              let PriIcon = ChevronDown;
              let priColor = "var(--text-faint)";
              if (m.pri === "high" || m.metric === "P1") { PriIcon = ChevronsUp; priColor = "var(--danger)"; }
              if (m.pri === "medium" || m.metric === "P2") { PriIcon = GripHorizontal; priColor = "var(--warning)"; }

              return (
                <div key={i} className="flex items-center gap-[10px] border-b border-border p-[10px_16px] last:border-b-0">
                  <Icon size={17} style={{ color: iconColor }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{m.title}</div>
                    <div className="text-[10.5px] text-text-faint">{m.suite || m.metric}</div>
                  </div>
                  <PriIcon size={15} style={{ color: priColor }} />
                </div>
              );
            }) : <div className="p-[18px_16px] text-[12.5px] text-text-muted">No assigned active work in this project.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
