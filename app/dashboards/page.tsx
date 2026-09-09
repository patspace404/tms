import React from "react";
import Link from "next/link";
import { Inter } from "next/font/google";
import { getServerSession } from "next-auth/next";
import {
  Activity,
  ArrowUp,
  Bot,
  Bug,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  Circle,
  GripHorizontal,
  MinusCircle,
  Moon,
  PlayCircle,
  Rocket,
  TrendingDown,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DashboardFilters } from "./DashboardFilters";
import { runStats } from "@/lib/run-stats";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const dynamic = "force-dynamic";

type ProjectRow = {
  rank: number;
  code: string;
  name: string;
  abbr: string;
  cases: number;
  suites: number;
  health: number;
  healthBg: string;
  healthColor: string;
  auto: number;
  autow: string;
  activeRuns: number;
  totalRuns: number;
  lastActivity: string;
  actDot: string;
  spark: string;
  sparkColor: string;
  iconBg: string;
  iconColor: string;
};

type HeatRow = {
  name: string;
  cells: Array<{ rate: number | null; varRef: string }>;
};

type RiskItem = {
  proj: string;
  title: string;
  metric: string;
  metricColor: string;
  projBg: string;
  projColor: string;
  href: string;
};

type WorkItem = {
  title: string;
  proj: string;
  href: string;
  statusIcon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  statusColor: string;
  priIcon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  priColor: string;
};

type ActivityItem = {
  who: string;
  action: string;
  proj: string;
  when: string;
  icon: React.ComponentType<{ size?: number }>;
  iconBg: string;
  iconColor: string;
};

type ScheduleItem = {
  name: string;
  proj: string;
  cron: string;
  when: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const nf = new Intl.NumberFormat("en-US");

const sparkFn = (values: number[]) => {
  const safe = values.length > 1 ? values : [values[0] || 0, values[0] || 0];
  const width = 78;
  const height = 26;
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const spread = max - min || 1;
  return safe
    .map((value, index) => {
      const x = (index * (width / (safe.length - 1))).toFixed(1);
      const y = (height - 2 - ((value - min) / spread) * (height - 4)).toFixed(1);
      return `${x},${y}`;
    })
    .join(" ");
};

const formatPct = (value: number) => `${Math.round(value)}%`;
const formatDelta = (value: number, unit = "") => `${value >= 0 ? "+" : ""}${unit === "pts" ? value.toFixed(1) : Math.round(value)}${unit ? ` ${unit}` : ""}`;
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d;
};
const formatAge = (date?: Date | null) => {
  if (!date) return "No activity";
  const diff = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

const healthTone = (h: number) =>
  h >= 90
    ? ["var(--success-soft)", "var(--success)"]
    : h >= 75
      ? ["var(--warning-soft)", "var(--warning)"]
      : ["var(--danger-soft)", "var(--danger)"];

const projectBadgeTone = (code: string): [string, string] => {
  const tones: Array<[string, string]> = [
    ["var(--primary-soft)", "var(--primary-text)"],
    ["var(--info-soft)", "var(--info)"],
    ["var(--success-soft)", "var(--success)"],
    ["var(--warning-soft)", "var(--warning)"],
    ["var(--bg-surface-hover)", "var(--text-muted)"],
  ];
  const index = code.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % tones.length;
  return tones[index];
};

const heatColor = (rate: number | null) => {
  if (rate === null) return "var(--bg-surface-hover)";
  if (rate < 65) return "var(--heat-0)";
  if (rate < 80) return "var(--heat-1)";
  if (rate < 90) return "var(--heat-2)";
  if (rate < 97) return "var(--heat-3)";
  return "var(--heat-4)";
};

const statusMeta = (status: string) => {
  if (status === "FAILED") return { icon: XCircle, color: "var(--danger)" };
  if (status === "BLOCKED") return { icon: MinusCircle, color: "var(--warning)" };
  if (status === "PASSED") return { icon: CheckCircle2, color: "var(--success)" };
  return { icon: Circle, color: "var(--skip)" };
};

const priorityMeta = (priority?: string | null) => {
  if (priority === "HIGH") return { icon: ChevronsUp, color: "var(--danger)" };
  if (priority === "MEDIUM") return { icon: GripHorizontal, color: "var(--warning)" };
  return { icon: ChevronDown, color: "var(--text-faint)" };
};

const scheduleIcon = (cron: string) => {
  if (/deploy/i.test(cron)) return Rocket;
  if (/^0 2 /.test(cron)) return Moon;
  if (/\*/.test(cron)) return Zap;
  return CalendarDays;
};

export default async function GlobalDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; timeframe?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const timeframe = [7, 14, 30, 60, 90].includes(Number(resolvedSearchParams.timeframe))
    ? Number(resolvedSearchParams.timeframe)
    : 30;
  const now = new Date();
  const currentStart = daysAgo(timeframe);
  const previousStart = daysAgo(timeframe * 2);

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const allProjectsForFilter = await prisma.project.findMany({
    where: { isArchived: false },
    orderBy: { name: "asc" },
    select: { code: true, name: true },
  });
  const selectedProject = allProjectsForFilter.some((project) => project.code === resolvedSearchParams.project)
    ? resolvedSearchParams.project || ""
    : "";
  const selectedProjectWhere = selectedProject ? { code: selectedProject } : {};
  const resultProjectWhere = selectedProject ? { testRun: { project: { code: selectedProject } } } : {};
  const runProjectWhere = selectedProject ? { project: { code: selectedProject } } : {};
  const issueProjectWhere = selectedProject ? { project: { code: selectedProject } } : {};
  const auditProjectWhere = selectedProject ? { project: { code: selectedProject } } : {};
  const scheduleProjectWhere = selectedProject ? { project: { code: selectedProject } } : {};

  const [projectData, currentResults, previousResults, currentRuns, previousRuns, linkedIssues, auditLogs, schedulesData, myPending] = await Promise.all([
    prisma.project.findMany({
      where: { isArchived: false, ...selectedProjectWhere },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { suites: true, testCases: true, testRuns: true } },
        testCases: { select: { id: true, automationStatus: true, suiteId: true, priority: true, title: true } },
        testRuns: {
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { results: { select: { status: true } } },
        },
      },
    }),
    prisma.testRunResult.findMany({
      where: { updatedAt: { gte: currentStart, lte: now }, status: { not: "IN_PROGRESS" }, ...resultProjectWhere },
      select: {
        status: true,
        updatedAt: true,
        testRun: { select: { id: true, title: true, createdAt: true, project: { select: { code: true, name: true } } } },
        testCase: { select: { id: true, title: true, priority: true, suite: { select: { title: true } } } },
      },
    }),
    prisma.testRunResult.findMany({
      where: { updatedAt: { gte: previousStart, lt: currentStart }, status: { not: "IN_PROGRESS" }, ...resultProjectWhere },
      select: { status: true },
    }),
    prisma.testRun.findMany({
      where: { createdAt: { gte: currentStart, lte: now }, ...runProjectWhere },
      select: { id: true, title: true, status: true, createdAt: true, project: { select: { code: true, name: true } }, results: { select: { status: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.testRun.findMany({
      where: { createdAt: { gte: previousStart, lt: currentStart }, ...runProjectWhere },
      select: { id: true },
    }),
    prisma.linkedIssue.findMany({
      where: issueProjectWhere,
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, key: true, summary: true, severity: true, status: true, url: true, project: { select: { code: true } } },
    }),
    prisma.auditLog.findMany({
      where: auditProjectWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { name: true, email: true } }, project: { select: { code: true, name: true } } },
    }),
    prisma.pipelineSchedule.findMany({
      where: { isActive: true, ...scheduleProjectWhere },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { project: { select: { code: true, name: true } } },
    }),
    userId
      ? prisma.testRunResult.findMany({
          where: { assigneeId: userId, status: "IN_PROGRESS", testRun: { status: "ACTIVE", ...runProjectWhere } },
          take: 4,
          include: {
            testRun: { select: { id: true, title: true, project: { select: { code: true, name: true } } } },
            testCase: { select: { title: true, priority: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const totalCases = projectData.reduce((sum, project) => sum + project._count.testCases, 0);
  const totalRuns = projectData.reduce((sum, project) => sum + project._count.testRuns, 0);
  const totalAutomated = projectData.reduce(
    (sum, project) => sum + project.testCases.filter((testCase) => testCase.automationStatus === "AUTOMATED").length,
    0,
  );
  const currentExecuted = currentResults.length;
  const currentPassed = currentResults.filter((result) => result.status === "PASSED").length;
  const previousExecuted = previousResults.length;
  const previousPassed = previousResults.filter((result) => result.status === "PASSED").length;
  const passRate = currentExecuted ? (currentPassed / currentExecuted) * 100 : 0;
  const previousPassRate = previousExecuted ? (previousPassed / previousExecuted) * 100 : 0;
  const automationRate = totalCases ? (totalAutomated / totalCases) * 100 : 0;

  const kpiSparkSeed = (base: number) => [base * 0.82, base * 0.86, base * 0.9, base * 0.94, base * 0.98, base].map((v) => Math.max(0, Math.round(v)));
  const orgKpis = [
    { label: "Overall pass rate", value: formatPct(passRate), icon: CheckCircle2, delta: formatDelta(passRate - previousPassRate, "pts"), suffix: "vs prev", spark: sparkFn(kpiSparkSeed(passRate)), sparkColor: "var(--success)", deltaColor: passRate >= previousPassRate ? "var(--success)" : "var(--danger)", arrow: ArrowUp },
    { label: "Total projects", value: nf.format(projectData.length), icon: Workflow, delta: formatDelta(projectData.filter((p) => p.createdAt >= currentStart).length), suffix: "new", spark: sparkFn(kpiSparkSeed(projectData.length)), sparkColor: "var(--primary)", deltaColor: "var(--text-muted)", arrow: ArrowUp },
    { label: "Total runs", value: nf.format(totalRuns), icon: PlayCircle, delta: formatDelta(currentRuns.length - previousRuns.length), suffix: "vs prev", spark: sparkFn(kpiSparkSeed(totalRuns)), sparkColor: "var(--primary)", deltaColor: "var(--text-muted)", arrow: ArrowUp },
    { label: "Org automation", value: formatPct(automationRate), icon: Bot, delta: nf.format(totalAutomated), suffix: "automated", spark: sparkFn(kpiSparkSeed(automationRate)), sparkColor: "var(--primary)", deltaColor: "var(--success)", arrow: ArrowUp },
  ];

  const projectResultMap = new Map<string, { passed: number; total: number }>();
  const projectDailyMap = new Map<string, Map<string, { passed: number; total: number }>>();
  for (const result of currentResults) {
    const code = result.testRun.project.code;
    const current = projectResultMap.get(code) || { passed: 0, total: 0 };
    current.total += 1;
    if (result.status === "PASSED") current.passed += 1;
    projectResultMap.set(code, current);

    const day = dateKey(result.updatedAt);
    const days = projectDailyMap.get(code) || new Map<string, { passed: number; total: number }>();
    const dayValue = days.get(day) || { passed: 0, total: 0 };
    dayValue.total += 1;
    if (result.status === "PASSED") dayValue.passed += 1;
    days.set(day, dayValue);
    projectDailyMap.set(code, days);
  }

  const projects = projectData
    .map((project) => {
      const resultStats = projectResultMap.get(project.code);
      const health = resultStats?.total ? Math.round((resultStats.passed / resultStats.total) * 100) : 0;
      const automated = project.testCases.filter((testCase) => testCase.automationStatus === "AUTOMATED").length;
      const auto = project.testCases.length ? Math.round((automated / project.testCases.length) * 100) : 0;
      const activeRuns = project.testRuns.filter((run) => run.status === "ACTIVE").length;
      const latestRun = project.testRuns[0];
      const recentHealth = project.testRuns.slice(0, 7).reverse().map((run) => {
        // Same rule as everywhere else — see lib/run-stats.ts.
        const { decided, passRate } = runStats(run.results);
        return decided ? passRate : health;
      });
      const [healthBg, healthColor] = healthTone(health);
      const [iconBg, iconColor] = projectBadgeTone(project.code);
      return {
        code: project.code,
        name: project.name,
        abbr: project.code.slice(0, 2).toUpperCase(),
        cases: project._count.testCases,
        suites: project._count.suites,
        health,
        healthBg,
        healthColor,
        auto,
        autow: `${auto}%`,
        activeRuns,
        totalRuns: project._count.testRuns,
        lastActivity: formatAge(latestRun?.createdAt),
        actDot: latestRun && latestRun.createdAt >= daysAgo(2) ? "var(--success)" : "var(--text-faint)",
        spark: sparkFn(recentHealth.length ? recentHealth : [health, health]),
        sparkColor: recentHealth.at(-1)! >= recentHealth[0] ? "var(--success)" : "var(--danger)",
        iconBg,
        iconColor,
      };
    })
    .sort((a, b) => b.health - a.health || b.cases - a.cases)
    .map((project, index) => ({ ...project, rank: index + 1 }));

  const dayKeys = Array.from({ length: timeframe }, (_, index) => dateKey(daysAgo(timeframe - 1 - index)));
  const heat: HeatRow[] = projects.map((project) => {
    const daily = projectDailyMap.get(project.code);
    return {
      name: project.name,
      cells: dayKeys.map((day) => {
        const value = daily?.get(day);
        const rate = value?.total ? Math.round((value.passed / value.total) * 100) : null;
        return { rate, varRef: heatColor(rate) };
      }),
    };
  });

  const caseRiskMap = new Map<string, { title: string; proj: string; failed: number; total: number }>();
  for (const result of currentResults) {
    const key = result.testCase.id;
    const item = caseRiskMap.get(key) || { title: result.testCase.title, proj: result.testRun.project.code, failed: 0, total: 0 };
    item.total += 1;
    if (result.status === "FAILED" || result.status === "BLOCKED") item.failed += 1;
    caseRiskMap.set(key, item);
  }
  const topFailing = [...caseRiskMap.values()]
    .filter((item) => item.failed > 0)
    .sort((a, b) => b.failed / b.total - a.failed / a.total)
    .slice(0, 4)
    .map<RiskItem>((item) => {
      const [projBg, projColor] = projectBadgeTone(item.proj);
      return {
        proj: item.proj,
        title: item.title,
        metric: formatPct((item.failed / item.total) * 100),
        metricColor: "var(--danger)",
        projBg,
        projColor,
        href: `/projects/${item.proj}/repository`,
      };
    });
  const openDefects = linkedIssues
    .filter((issue) => !issue.status || !/closed|done|resolved|fixed/i.test(issue.status))
    .slice(0, 4)
    .map<RiskItem>((issue) => {
      const [projBg, projColor] = projectBadgeTone(issue.project.code);
      return {
        proj: issue.project.code,
        title: issue.summary,
        metric: issue.severity || issue.key,
        metricColor: issue.severity === "P1" || issue.severity === "BLOCKER" ? "var(--danger)" : "var(--warning)",
        projBg,
        projColor,
        href: issue.url || `/dashboards`,
      };
    });
  const riskCards = [
    { title: selectedProject ? "Top failing — selected project" : "Top failing — across all projects", icon: TrendingDown, iconColor: "var(--danger)", badge: topFailing.length ? `${topFailing.length}` : "0", badgeBg: "var(--danger-soft)", badgeColor: "var(--danger)", items: topFailing },
    { title: selectedProject ? "Open defects — selected project" : "Open defects — across all projects", icon: Bug, iconColor: "var(--warning)", badge: `${openDefects.length}`, badgeBg: "var(--warning-soft)", badgeColor: "var(--warning)", items: openDefects },
  ];

  const mywork: WorkItem[] = myPending.map((item) => {
    const priority = priorityMeta(item.testCase.priority);
    return {
      title: item.testCase.title,
      proj: item.testRun.project.name,
      href: `/projects/${item.testRun.project.code}/runs/${item.testRun.id}`,
      statusIcon: Circle,
      statusColor: "var(--skip)",
      priIcon: priority.icon,
      priColor: priority.color,
    };
  });

  const activity: ActivityItem[] = auditLogs.map((entry) => ({
    who: entry.user?.name || entry.user?.email || "System",
    action: entry.action.toLowerCase().replaceAll("_", " "),
    proj: entry.project.code,
    when: formatAge(entry.createdAt),
    icon: entry.action.includes("DELETE") ? XCircle : entry.action.includes("CREATE") ? CheckSquare : Activity,
    iconBg: entry.action.includes("DELETE") ? "var(--danger-soft)" : "var(--primary-soft)",
    iconColor: entry.action.includes("DELETE") ? "var(--danger)" : "var(--primary-text)",
  }));

  const schedules: ScheduleItem[] = schedulesData.map((schedule) => ({
    name: schedule.title,
    proj: schedule.project.name,
    cron: schedule.cron,
    when: "active",
    icon: scheduleIcon(schedule.cron),
  }));
  const scopeLabel = selectedProject ? "selected project" : "all projects";

  return (
    <div className={`${inter.className} min-h-screen bg-background text-[14px] leading-[1.45] text-text-main antialiased`}>
      <div className="mx-auto w-full max-w-[1320px] p-[20px]">
        <div className="mb-[18px] flex items-end justify-between">
          <div>
            <div className="flex items-center gap-[9px]">
              <span className="text-[21px] font-semibold tracking-[-0.015em]">QA Overview</span>
              <span className="rounded-full bg-surface-hover px-[8px] py-[2px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-text-muted">Portfolio</span>
            </div>
            <div className="mt-[3px] text-[13px] text-text-muted">Quality across {selectedProject ? projectData[0]?.name || selectedProject : `all ${projectData.length} projects`} · last {timeframe} days</div>
          </div>
          <DashboardFilters projects={allProjectsForFilter} selectedProject={selectedProject} timeframe={timeframe} />
        </div>

        <div className="mb-[14px] grid grid-cols-4 gap-[14px]">
          {orgKpis.map((k, i) => {
            const Icon = k.icon;
            const Arrow = k.arrow;
            return (
              <div key={i} className="rounded-[12px] border border-border bg-surface p-[15px_16px] shadow-sm">
                <div className="flex items-center gap-[7px] text-[12.5px] font-medium text-text-muted">
                  <Icon size={16} className="text-text-faint" />
                  {k.label}
                </div>
                <div className="mt-[9px] flex items-end justify-between">
                  <div className="text-[27px] font-semibold tabular-nums tracking-[-0.02em]">{k.value}</div>
                  <svg width="78" height="26" viewBox="0 0 78 26" className="overflow-visible">
                    <polyline points={k.spark} fill="none" stroke={k.sparkColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="mt-[6px] flex items-center gap-[4px] text-[12px] font-semibold" style={{ color: k.deltaColor }}>
                  <Arrow size={15} />
                  {k.delta}
                  <span className="font-normal text-text-faint">{k.suffix}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mb-[14px] overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
          <div className="flex items-center justify-between p-[14px_18px]">
            <div className="text-[14.5px] font-semibold">Projects, ranked by health</div>
            <span className="text-[12px] text-text-faint">click a project to open its overview</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-[24px_1.9fr_96px_150px_110px_130px_96px_28px] gap-[12px] border-y border-border p-[8px_18px] text-[10px] font-semibold uppercase tracking-[0.05em] text-text-faint">
                <div>#</div><div>Project</div><div>Health</div><div>Automation</div><div>Runs</div><div>Last activity</div><div>Trend</div><div />
              </div>
              {projects.length ? projects.map((p) => (
                <Link href={`/projects/${p.code}/dashboards`} key={p.code} className="grid grid-cols-[24px_1.9fr_96px_150px_110px_130px_96px_28px] items-center gap-[12px] border-b border-border p-[12px_18px] transition-colors hover:bg-surface-hover">
                  <div className="text-[12px] font-bold tabular-nums text-text-faint">{p.rank}</div>
                  <div className="flex min-w-0 items-center gap-[11px]">
                    <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] text-[12px] font-bold" style={{ background: p.iconBg, color: p.iconColor }}>{p.abbr}</div>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold">{p.name}</div>
                      <div className="text-[10.5px] text-text-faint">{p.cases} cases · {p.suites} suites</div>
                    </div>
                  </div>
                  <div><span className="rounded-full p-[3px_9px] text-[11.5px] font-bold tabular-nums" style={{ background: p.healthBg, color: p.healthColor }}>{p.health}%</span></div>
                  <div className="flex items-center gap-[8px]"><div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-surface-hover"><div className="h-full bg-primary" style={{ width: p.autow }} /></div><span className="text-[11.5px] font-semibold tabular-nums text-text-muted">{p.auto}%</span></div>
                  <div className="text-[12.5px] tabular-nums"><span className="font-bold text-primary">{p.activeRuns}</span><span className="text-text-faint"> / {p.totalRuns}</span></div>
                  <div className="flex items-center gap-[6px] text-[11.5px] text-text-muted"><span className="h-[6px] w-[6px] rounded-full" style={{ background: p.actDot }} />{p.lastActivity}</div>
                  <div><svg width="78" height="24" viewBox="0 0 78 26" preserveAspectRatio="none" className="overflow-visible"><polyline points={p.spark} fill="none" stroke={p.sparkColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" /></svg></div>
                  <div className="flex justify-center text-text-faint"><ChevronRight size={18} /></div>
                </Link>
              )) : <div className="p-[28px_18px] text-center text-[13px] text-text-muted">No projects yet.</div>}
            </div>
          </div>
        </div>

        <div className="mb-[14px] rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
          <div className="mb-[14px] flex items-center justify-between">
            <div className="text-[14.5px] font-semibold">Quality grid <span className="text-[12.5px] font-normal text-text-faint">· daily pass rate per project · {timeframe}d</span></div>
            <div className="flex items-center gap-[6px] text-[11px] text-text-faint">low<span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--heat-0)]" /><span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--heat-2)]" /><span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--heat-4)]" />high</div>
          </div>
          <div className="flex flex-col gap-[6px]">
            {heat.length ? heat.map((row, i) => (
              <div key={i} className="flex items-center gap-[10px]">
                <div className="w-[96px] shrink-0 truncate text-right text-[12px] text-text-muted">{row.name}</div>
                <div className="flex flex-1 gap-[3px]">{row.cells.map((c, j) => <div key={j} title={c.rate === null ? "No runs" : `${c.rate}% pass`} className="h-[16px] flex-1 rounded-[3px]" style={{ background: c.varRef }} />)}</div>
              </div>
            )) : <div className="py-6 text-center text-[13px] text-text-muted">No execution data in the last 30 days.</div>}
          </div>
        </div>

        <div className="mb-[14px] grid grid-cols-2 gap-[14px]">
          {riskCards.map((rc, i) => {
            const Icon = rc.icon;
            return (
              <div key={i} className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
                <div className="mb-[6px] flex items-center gap-[8px]"><Icon size={18} style={{ color: rc.iconColor }} /><span className="text-[14px] font-semibold">{rc.title}</span><span className="ml-auto rounded-full p-[1px_8px] text-[11px] font-bold" style={{ background: rc.badgeBg, color: rc.badgeColor }}>{rc.badge}</span></div>
                {rc.items.length ? rc.items.map((it, j) => (
                  <Link key={j} href={it.href} className="flex items-center gap-[9px] border-t border-border py-[8px]">
                    <span className="shrink-0 rounded-[6px] p-[1px_7px] text-[10px] font-bold" style={{ background: it.projBg, color: it.projColor }}>{it.proj}</span>
                    <div className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{it.title}</div>
                    <span className="tabular-nums text-[12px] font-bold" style={{ color: it.metricColor }}>{it.metric}</span>
                  </Link>
                )) : <div className="border-t border-border py-[18px] text-[12.5px] text-text-muted">No items to review.</div>}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-[14px]">
          <div className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-border p-[14px_16px]"><div className="text-[14px] font-semibold">My work <span className="text-[12px] font-normal text-text-faint">· {scopeLabel}</span></div><span className="rounded-full bg-primary-soft p-[2px_8px] text-[11px] font-bold text-primary">{mywork.length}</span></div>
            {mywork.length ? mywork.map((m, i) => {
              const StatusIcon = m.statusIcon;
              const PriIcon = m.priIcon;
              return <Link href={m.href} key={i} className="flex items-center gap-[10px] border-b border-border p-[10px_16px] last:border-b-0"><StatusIcon size={17} style={{ color: m.statusColor }} /><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{m.title}</div><div className="text-[10.5px] text-text-faint">{m.proj}</div></div><PriIcon size={15} style={{ color: m.priColor }} /></Link>;
            }) : <div className="p-[18px_16px] text-[12.5px] text-text-muted">No assigned active work.</div>}
          </div>

          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[13px] text-[14px] font-semibold">Org activity</div>
            <div className="flex flex-col">
              {activity.length ? activity.map((a, i) => {
                const Icon = a.icon;
                return <div key={i} className="flex gap-[11px]"><div className="flex shrink-0 flex-col items-center"><div className="flex h-[26px] w-[26px] items-center justify-center rounded-full" style={{ background: a.iconBg, color: a.iconColor }}><Icon size={14} /></div>{i !== activity.length - 1 && <div className="my-[3px] min-h-[8px] w-[2px] flex-1 bg-border" />}</div><div className="min-w-0 pb-[14px]"><div className="text-[12.5px]"><span className="font-semibold">{a.who}</span> <span className="text-text-muted">{a.action}</span></div><div className="mt-[2px] text-[10.5px] text-text-faint">{a.proj} · {a.when}</div></div></div>;
              }) : <div className="text-[12.5px] text-text-muted">No recent activity.</div>}
            </div>
          </div>

          <div className="rounded-[12px] border border-border bg-surface p-[16px] shadow-sm">
            <div className="mb-[13px] text-[14px] font-semibold">Upcoming schedules <span className="text-[12px] font-normal text-text-faint">· {scopeLabel}</span></div>
            <div className="flex flex-col gap-[12px]">
              {schedules.length ? schedules.map((s, i) => {
                const Icon = s.icon;
                return <div key={i} className="flex items-center gap-[10px]"><div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-surface-hover"><Icon size={17} className="text-text-muted" /></div><div className="min-w-0 flex-1"><div className="truncate text-[12.5px] font-medium">{s.name}</div><div className="text-[10.5px] text-text-faint">{s.proj} · <span className="font-mono">{s.cron}</span></div></div><span className="text-[11px] font-bold text-primary">{s.when}</span></div>;
              }) : <div className="text-[12.5px] text-text-muted">No active schedules.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
