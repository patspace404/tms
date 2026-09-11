"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search, User, LogOut, Radar, KeyRound } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { initialsOf } from "@/lib/initials";

const NAV_LINKS = [
  { name: "Projects", href: "/projects" },
  { name: "Workspace", href: "/workspace" },
  { name: "Dashboards", href: "/dashboards" },
  { name: "Monitor", href: "/monitor" },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");

  useEffect(() => {
    const close = () => setDropdownOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // Pull the custom workspace logo (if any) once on mount, and update live when
  // the settings page reports a change.
  useEffect(() => {
    fetch("/api/workspace/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data?.WORKSPACE_LOGO_URL) setLogoUrl(data.WORKSPACE_LOGO_URL);
      })
      .catch(() => {});

    const onUpdate = (e: Event) => {
      const url = (e as CustomEvent).detail;
      if (typeof url === "string") setLogoUrl(url);
    };
    window.addEventListener("workspace-logo-updated", onUpdate);
    return () => window.removeEventListener("workspace-logo-updated", onUpdate);
  }, []);

  // An email may arrive in the name slot; initialsOf takes it as the fallback.
  const getInitials = (name?: string | null) =>
    name?.includes("@") ? initialsOf(null, name) : initialsOf(name);

  return (
    <header className="relative z-50 w-full shrink-0 bg-surface border-b border-border">
      <div className="flex h-[52px] items-center gap-5 px-[18px]">
        {/* Left: Logo */}
        <Link href="/projects" className="group flex items-center gap-[9px]">
          <div className="flex h-[26px] w-[26px] items-center justify-center overflow-hidden rounded-[7px] bg-primary text-primary-fg">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Workspace logo" className="h-full w-full object-cover" />
            ) : (
              <Radar size={18} />
            )}
          </div>
          <span className="text-[15px] font-bold tracking-[-0.01em] text-text-main">
            QMaster
          </span>
        </Link>

        {/* Center: Nav */}
        <nav className="ml-[6px] flex items-center gap-[2px]">
          {NAV_LINKS.map(({ name, href }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={name}
                href={href}
                className={cn(
                  "rounded-[8px] px-[11px] py-1.5 text-[14px] transition-colors duration-150",
                  isActive
                    ? "bg-primary-light font-semibold text-primary-text"
                    : "font-medium text-text-muted hover:bg-surface-hover hover:text-text-main",
                )}
              >
                {name}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1"></div>

        {/* Right: Search + Avatar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event("open-command-palette"))}
            className="flex h-[34px] min-w-[220px] items-center gap-[8px] rounded-[9px] border border-border bg-surface-hover px-[12px] pr-[10px] text-text-faint transition-colors hover:border-border-strong hover:text-text-muted"
            aria-label="Open command palette"
          >
            <Search size={18} />
            <span className="mr-auto hidden text-[13px] sm:inline">Search</span>
            <kbd className="qm-mono hidden rounded-[5px] border border-border px-[6px] py-[2px] text-[11px] sm:inline">
              ⌘K
            </kbd>
          </button>

          <ThemeToggle isCollapsed />

          <div className="relative flex items-center ml-1">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setDropdownOpen(!dropdownOpen);
              }}
              className="flex items-center gap-1.5 rounded-full transition-all focus:outline-none"
            >
              <div className="flex h-[30px] w-[30px] select-none items-center justify-center rounded-full bg-primary-light text-[12px] font-bold text-primary-text ring-2 ring-transparent transition-all hover:ring-border">
                {getInitials(session?.user?.name || session?.user?.email)}
              </div>
            </button>

            {dropdownOpen && (
              <div className="qm-panel absolute right-0 top-[40px] z-50 w-72 animate-fade-up py-2">
                <div className="m-2 mt-0 border-b border-border bg-surface-hover/60 px-5 py-4 rounded-xl">
                  <p className="truncate text-[15px] font-extrabold text-text-main">
                    {session?.user?.name || "User"}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] font-medium text-text-muted">
                    {session?.user?.email}
                  </p>
                </div>
                <div className="px-2 py-1">
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 rounded-[9px] px-4 py-2.5 text-[14px] font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-text-main"
                  >
                    <User size={16} />
                    Profile settings
                  </Link>
                  {/* Personal, not workspace config — a token acts as this user,
                      and every user needs to be able to mint one without admin
                      rights on the workspace. */}
                  <Link
                    href="/profile/api-tokens"
                    className="flex items-center gap-3 rounded-[9px] px-4 py-2.5 text-[14px] font-semibold text-text-muted transition-colors hover:bg-surface-hover hover:text-text-main"
                  >
                    <KeyRound size={16} />
                    API tokens
                  </Link>
                </div>
                <div className="mt-1 border-t border-border/50 px-2 py-1">
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-3 rounded-[9px] px-4 py-2.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger-soft"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <CommandPalette />
    </header>
  );
}

