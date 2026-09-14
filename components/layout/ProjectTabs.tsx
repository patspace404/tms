"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { Settings, ChevronDown, ChevronsUpDown, Folders } from "lucide-react";

export function ProjectTabs({ projectCode }: { projectCode: string }) {
  const pathname = usePathname();
  const { role, isSystemAdmin } = useProjectRole();
  const [configOpen, setConfigOpen] = useState(false);
  const configRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(e.target as Node)) {
        setConfigOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const base = `/projects/${projectCode}`;
  const tabs = [
    { name: "Dashboards", href: `${base}/dashboards`, match: "/dashboards" },
    { name: "Repository", href: `${base}/repository`, match: "/repository" },
    { name: "Test Plans", href: `${base}/plans`, match: "/plans" },
    { name: "Test Runs", href: `${base}/runs`, match: "/runs" },
    { name: "Milestones", href: `${base}/milestones`, match: "/milestones" },
    { name: "Automation", href: `${base}/automation`, match: "/automation" },
  ];

  const configItems = [
    { name: "Settings", href: `${base}/settings`, match: `${base}/settings` },
    { name: "Integrations", href: `${base}/settings/integrations` },
    { name: "Audit Logs", href: `${base}/activity` },
    { name: "Shared Steps", href: `${base}/shared-steps` },
    { name: "Environments", href: `${base}/environments` },
    { name: "Trash", href: `${base}/trash` },
  ];

  const isActive = (match: string) =>
    pathname === `${base}${match}` || pathname.startsWith(`${base}${match}/`);

  const configActive = configItems.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
  );

  return (
    <div className="flex items-center gap-[18px] px-[18px] bg-surface border-b border-border antialiased w-full text-[14px]">
      <div className="flex items-center gap-[7px] py-[11px] shrink-0 cursor-pointer">
        <span className="font-semibold text-[13.5px] tracking-[-0.015em] text-text-main">
          {projectCode}
        </span>
        <ChevronsUpDown size={18} className="text-text-faint" />
      </div>

      <div className="w-px h-[18px] bg-border shrink-0"></div>

      <div className="flex gap-[2px] flex-1 min-w-0 overflow-x-auto h-full items-end">
        {tabs.map((t) => {
          const active = isActive(t.match);
          return (
            <Link
              key={t.name}
              href={t.href}
              className={cn(
                "pt-[11px] px-[12px] pb-[9px] text-[13px] whitespace-nowrap transition-colors mb-[-1px]",
                active
                  ? "font-semibold text-primary-text border-b-2 border-primary"
                  : "font-medium text-text-muted hover:text-text-main border-b-2 border-transparent",
              )}
            >
              {t.name}
            </Link>
          );
        })}
      </div>

      {/* Config overflow */}
      {(role === "ADMIN" || isSystemAdmin) && (
        <div className="relative shrink-0" ref={configRef}>
          <button
            onClick={() => setConfigOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 px-[11px] py-[5px] rounded-[9px] text-[12.5px] font-semibold border transition-all duration-200",
              configActive || configOpen
                ? "bg-primary-light text-primary border-primary/30"
                : "bg-surface text-text-muted border-transparent hover:text-text-main hover:bg-surface-hover hover:border-border",
            )}
          >
            <Settings size={15} />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {configOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-surface border border-border shadow-md rounded-[11px] py-1 z-[100] overflow-hidden animate-fade-up">
              {configItems.map((c) => {
                const active =
                  pathname === c.href || pathname.startsWith(`${c.href}/`);
                return (
                  <Link
                    key={c.name}
                    href={c.href}
                    onClick={() => setConfigOpen(false)}
                    className={cn(
                      "block px-[14px] py-[8px] text-[13px] transition-colors",
                      active
                        ? "bg-primary-soft text-primary-text font-semibold"
                        : "text-text-main font-medium hover:bg-surface-hover",
                    )}
                  >
                    {c.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
