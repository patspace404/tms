"use client";

import React, { useState } from "react";
import { X, Loader2, Edit3 } from "lucide-react";

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  count: number;
  suites: any[];
  onApply: (fields: Record<string, string>) => Promise<void> | void;
  isSaving: boolean;
}

const KEEP = "__keep__";
const CLEAR = "__clear__";

const PRIORITY = [
  { v: "HIGH", l: "High" },
  { v: "MEDIUM", l: "Medium" },
  { v: "LOW", l: "Low" },
  { v: "NOT_SET", l: "Not set" },
];
const SEVERITY = [
  { v: "BLOCKER", l: "Blocker" },
  { v: "CRITICAL", l: "Critical" },
  { v: "MAJOR", l: "Major" },
  { v: "NORMAL", l: "Normal" },
  { v: "MINOR", l: "Minor" },
  { v: "TRIVIAL", l: "Trivial" },
  { v: "NOT_SET", l: "Not set" },
];
const AUTOMATION = [
  { v: "MANUAL", l: "Manual" },
  { v: "TO_BE_AUTOMATED", l: "To automate" },
  { v: "AUTOMATED", l: "Automated" },
];

function flattenSuites(
  suites: any[],
  depth = 0,
): { id: string; title: string; depth: number }[] {
  const out: { id: string; title: string; depth: number }[] = [];
  suites.forEach((s) => {
    out.push({ id: s.id, title: s.title, depth });
    if (s.children?.length) out.push(...flattenSuites(s.children, depth + 1));
  });
  return out;
}

export function BulkEditModal({
  isOpen,
  onClose,
  count,
  suites,
  onApply,
  isSaving,
}: BulkEditModalProps) {
  const [priority, setPriority] = useState(KEEP);
  const [severity, setSeverity] = useState(KEEP);
  const [automationStatus, setAutomationStatus] = useState(KEEP);
  const [suiteId, setSuiteId] = useState(KEEP);

  if (!isOpen) return null;

  const flatSuites = flattenSuites(suites);

  const handleApply = () => {
    const fields: Record<string, string> = {};
    if (priority !== KEEP) fields.priority = priority;
    if (severity !== KEEP) fields.severity = severity;
    if (automationStatus !== KEEP) fields.automationStatus = automationStatus;
    if (suiteId !== KEEP) fields.suiteId = suiteId === CLEAR ? "" : suiteId;
    onApply(fields);
  };

  const dirty =
    priority !== KEEP ||
    severity !== KEEP ||
    automationStatus !== KEEP ||
    suiteId !== KEEP;

  const selectCls =
    "w-full border border-border bg-surface-hover rounded-lg px-3 py-2 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-all appearance-none cursor-pointer";

  return (
    <div
      className="fixed inset-0 bg-[color:var(--overlay)] backdrop-blur-sm z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-6 py-4 border-b border-border">
          <h3 className="font-bold text-text-main flex items-center gap-2">
            <Edit3 size={16} className="text-primary" />
            Bulk Edit
            <span className="text-[11px] font-bold text-primary bg-primary-light px-2 py-0.5 rounded-full">
              {count} selected
            </span>
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-muted p-1 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-text-muted -mt-1">
            Only changed fields are applied. Leave as &ldquo;Keep
            unchanged&rdquo; to skip.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={selectCls}
            >
              <option value={KEEP}>Keep unchanged</option>
              {PRIORITY.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className={selectCls}
            >
              <option value={KEEP}>Keep unchanged</option>
              {SEVERITY.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Automation
            </label>
            <select
              value={automationStatus}
              onChange={(e) => setAutomationStatus(e.target.value)}
              className={selectCls}
            >
              <option value={KEEP}>Keep unchanged</option>
              {AUTOMATION.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider mb-1.5">
              Move to suite
            </label>
            <select
              value={suiteId}
              onChange={(e) => setSuiteId(e.target.value)}
              className={selectCls}
            >
              <option value={KEEP}>Keep unchanged</option>
              <option value={CLEAR}>— Unassigned —</option>
              {flatSuites.map((s) => (
                <option
                  key={s.id}
                  value={s.id}
                >{`${" ".repeat(s.depth * 2)}${s.title}`}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-6 py-4 bg-surface-hover/60 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-semibold text-text-muted bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!dirty || isSaving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            style={{ background: "var(--primary)" }}
          >
            {isSaving && <Loader2 size={14} className="animate-spin" />}
            Apply to {count}
          </button>
        </div>
      </div>
    </div>
  );
}
