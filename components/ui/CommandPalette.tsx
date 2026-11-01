"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FolderKanban,
  LayoutDashboard,
  Users,
  CornerDownLeft,
  Folder,
  FileText,
  PlayCircle,
  BookOpen,
} from "lucide-react";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
}

/**
 * ⌘K / Ctrl+K command palette. Static destinations + live project jump.
 * Keyboard-first: arrows to move, Enter to run, Esc to close.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<{ code: string; name: string }[]>([]);
  const [results, setResults] = useState<{ cases: any[]; runs: any[] }>({
    cases: [],
    runs: [],
  });
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  // Global ⌘K / Ctrl+K toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const openEvt = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", openEvt);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", openEvt);
    };
  }, []);

  // Fetch projects once when first opened
  useEffect(() => {
    if (open && projects.length === 0) {
      fetch("/api/projects")
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d) ? d : d?.projects;
          if (Array.isArray(list)) {
            setProjects(list.map((p: any) => ({ code: p.code, name: p.name })));
          }
        })
        .catch(() => {});
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open, projects.length]);

  // Debounced global search across cases & runs
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults({ cases: [], runs: [] });
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) =>
          setResults({ cases: d.cases || [], runs: d.runs || [] }),
        )
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

  const commands = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: "projects", label: "Projects", hint: "Go to projects", icon: FolderKanban, run: () => go("/projects") },
      { id: "workspace", label: "Workspace", hint: "Members, roles, groups", icon: Users, run: () => go("/workspace") },
      { id: "dashboards", label: "Dashboards", hint: "Global metrics", icon: LayoutDashboard, run: () => go("/dashboards") },
      { id: "api-docs", label: "API Documentation", hint: "REST API v1 reference & OpenAPI spec", icon: BookOpen, run: () => go("/docs/api") },
    ];
    const projectCmds: Cmd[] = projects.map((p) => ({
      id: `prj-${p.code}`,
      label: p.name,
      hint: `${p.code} · Open repository`,
      icon: Folder,
      run: () => go(`/projects/${p.code}/repository`),
    }));
    return [...base, ...projectCmds];
  }, [projects, go]);

  // Live search hits (cases + runs) — only shown when a query is present.
  const searchCmds = useMemo<Cmd[]>(() => {
    const caseCmds: Cmd[] = results.cases.map((c) => ({
      id: `case-${c.id}`,
      label: c.title,
      hint: `${c.code} · ${c.projectName}`,
      icon: FileText,
      run: () => go(`/projects/${c.projectCode}/cases/${c.id}/edit`),
    }));
    const runCmds: Cmd[] = results.runs.map((r) => ({
      id: `run-${r.id}`,
      label: r.title,
      hint: `Run · ${r.projectName}`,
      icon: PlayCircle,
      run: () => go(`/projects/${r.projectCode}/runs/${r.id}`),
    }));
    return [...caseCmds, ...runCmds];
  }, [results, go]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    const localMatches = commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q),
    );
    return [...localMatches, ...searchCmds];
  }, [commands, query, searchCmds]);

  useEffect(() => setActive(0), [query]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[active]?.run();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh] bg-black/40 backdrop-blur-[2px]"
      onClick={close}
    >
      <div
        className="w-full max-w-xl qm-panel overflow-hidden animate-fade-up"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search size={17} className="text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onListKey}
            placeholder="Search cases, runs, projects…"
            className="flex-1 py-3.5 text-[15px] text-text-main placeholder:text-text-faint bg-transparent outline-none"
          />
          <kbd className="text-[10px] font-semibold text-text-muted bg-surface-hover px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {searching ? "Searching…" : `No matches for “${query}”`}
            </div>
          ) : (
            filtered.map((c, i) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.id}
                  onClick={c.run}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    i === active ? "bg-primary-light" : "hover:bg-surface-hover"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      i === active ? "bg-primary text-primary-foreground" : "bg-surface-hover text-text-muted"
                    }`}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-text-main truncate">{c.label}</span>
                    {c.hint && <span className="block text-xs text-text-muted truncate">{c.hint}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
