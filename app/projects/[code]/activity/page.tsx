"use client";

import React, { useState, useEffect, use } from "react";
import {
  Loader2,
  Zap,
  Shapes,
  User,
  ChevronDown,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Bug,
  Pencil,
  PlusCircle,
  type LucideIcon,
} from "lucide-react";
import { initialsOf } from "@/lib/initials";

type AuditLog = {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
};

const ACTION_CONFIG: Record<string, { kind: string }> = {
  CREATED: { kind: 'add' },
  DELETED: { kind: 'fail' },
  UPDATED: { kind: 'edit' },
  EXECUTED: { kind: 'run' },
  SHARED: { kind: 'pass' },
};

const AVS = [
  { bg: 'var(--primary-soft)', color: 'var(--primary-text)' },
  { bg: 'var(--info-soft-fill)', color: 'var(--info)' },
  { bg: 'var(--pass-soft)', color: 'var(--pass)' },
  { bg: 'var(--warn-soft)', color: 'var(--warn)' }
];

const IC: Record<string, { icon: LucideIcon; bg: string; color: string }> = {
  run: { icon: PlayCircle, bg: 'var(--primary-soft)', color: 'var(--primary-text)' },
  pass: { icon: CheckCircle2, bg: 'var(--pass-soft)', color: 'var(--pass)' },
  fail: { icon: XCircle, bg: 'var(--fail-soft)', color: 'var(--fail)' },
  defect: { icon: Bug, bg: 'var(--warn-soft)', color: 'var(--warn)' },
  edit: { icon: Pencil, bg: 'var(--info-soft-fill)', color: 'var(--info)' },
  add: { icon: PlusCircle, bg: 'var(--primary-soft)', color: 'var(--primary-text)' }
};

function avatarInfo(name: string) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  const colorSet = AVS[n % AVS.length];
  
  const initials = initialsOf(name);
  
  return { ...colorSet, initials };
}

function groupByDate(logs: AuditLog[]) {
  const map: Record<string, AuditLog[]> = {};
  logs.forEach((log) => {
    const d = new Date(log.createdAt);
    // Use relative terms if close to today, else date
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let key = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (d.toDateString() === today.toDateString()) key = "Today";
    else if (d.toDateString() === yesterday.toDateString()) key = "Yesterday";
    
    if (!map[key]) map[key] = [];
    map[key].push(log);
  });
  return map;
}

export default function AuditLogsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${code}/audit`)
      .then((r) => (r.ok ? r.json() : Promise.reject("Failed to fetch")))
      .then((d) => setLogs(d.logs || []))
      .catch((e) => setError(String(e)))
      .finally(() => setIsLoading(false));
  }, [code]);

  const grouped = groupByDate(logs);

  if (isLoading)
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Loader2 className="animate-spin text-primary" size={28} />
      </div>
    );

  if (error)
    return <div className="p-[20px_22px] text-center text-danger text-[13px]">{error}</div>;

  return (
    <div className="w-full max-w-[860px] mx-auto p-[20px_22px] antialiased font-sans pb-20">
      
      <div className="flex items-center gap-[10px] mb-[16px]">
        <div>
          <div className="text-[19px] font-semibold tracking-[-0.015em] text-text-main">Activity</div>
          <div className="text-[13px] text-text-muted mt-[2px]">Everything that happened in this project</div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-[6px] h-[34px] px-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] rounded-[9px] text-[12.5px] font-medium text-text-main cursor-pointer hover:bg-surface-hover transition-colors">
          <Zap size={16} className="text-text-faint" />All actions
          <ChevronDown size={17} className="text-text-faint" />
        </div>
        <div className="flex items-center gap-[6px] h-[34px] px-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] rounded-[9px] text-[12.5px] font-medium text-text-main cursor-pointer hover:bg-surface-hover transition-colors">
          <Shapes size={16} className="text-text-faint" />All entities
          <ChevronDown size={17} className="text-text-faint" />
        </div>
        <div className="flex items-center gap-[6px] h-[34px] px-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] rounded-[9px] text-[12.5px] font-medium text-text-main cursor-pointer hover:bg-surface-hover transition-colors">
          <User size={16} className="text-text-faint" />Anyone
          <ChevronDown size={17} className="text-text-faint" />
        </div>
      </div>

      {logs.length === 0 && (
        <div className="text-center p-8 text-text-muted text-[13px]">No activity recorded yet</div>
      )}

      {Object.entries(grouped).map(([date, items]) => (
        <React.Fragment key={date}>
          <div className="flex items-center gap-[10px] m-[18px_0_10px]">
            <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-text-faint">{date}</span>
            <div className="flex-1 h-[1px] bg-border" />
          </div>
          
          <div className="bg-surface border border-border rounded-[13px] shadow-[var(--shadow-sm)] overflow-hidden mb-[10px]">
            {items.map((log, index) => {
              const name = log.user.name || log.user.email.split("@")[0];
              const av = avatarInfo(name);
              
              const actionCfg = ACTION_CONFIG[log.action] || { kind: 'edit', icon: 'edit' };
              const ic = IC[actionCfg.kind] || IC.edit;
              const EventIcon = ic.icon;
              
              const time = new Date(log.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              const entityName = log.entity.replace(/_/g, " ").toLowerCase();
              
              return (
                <div key={log.id} className="flex items-center gap-[12px] p-[11px_16px] border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                  <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: av.bg, color: av.color }}>
                    {av.initials}
                  </div>
                  
                  <div className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center shrink-0" style={{ background: ic.bg, color: ic.color }}>
                    <EventIcon size={14} />
                  </div>
                  
                  <div className="flex-1 min-w-0 text-[13px]">
                    <span className="font-semibold text-text-main">{name}</span>{" "}
                    <span className="text-text-muted">{actionCfg.kind === 'run' ? 'executed' : log.action.toLowerCase()}</span>{" "}
                    <span className="font-medium font-mono text-[11.5px] text-text-main">{entityName}</span>{" "}
                    {log.details && <span className="text-text-muted truncate">{log.details}</span>}
                  </div>
                  
                  <span className="text-[11.5px] text-text-faint shrink-0">{time}</span>
                </div>
              );
            })}
          </div>
        </React.Fragment>
      ))}

    </div>
  );
}
