"use client";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { UserPlus, X, Search, Users, Loader2, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initialsOf } from "@/lib/initials";

interface Group {
  id: string;
  title: string;
  description: string | null;
  memberCount: number;
  isAssigned: boolean;
}

interface Member {
  id: string;
  userId: string;
  /** ProjectRole — what this person can actually do *here*. */
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    workspaceRole: { title: string; permissions?: unknown } | null;
  };
}

interface WsMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  workspaceRole: { title: string; permissions?: unknown } | null;
}

/**
 * Whether this person already has full access from outside the project — a
 * system admin, or a workspace role carrying "all" (Administrator, Owner).
 * Their project role is not what decides anything, so the row must say so
 * rather than showing a "Viewer" badge that means nothing.
 */
function elevatedBy(user: {
  role: string;
  workspaceRole: { title: string; permissions?: unknown } | null;
}): string | null {
  if (user.role === "ADMIN") return "system admin";
  const perms = user.workspaceRole?.permissions;
  if (Array.isArray(perms) && perms.includes("all")) {
    return `workspace ${user.workspaceRole?.title ?? "role"}`;
  }
  return null;
}

/** ProjectRole → label. The three values ProjectMember.role can hold. */
const PROJECT_ROLES: Record<string, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const ROLE_HINT: Record<string, string> = {
  ADMIN: "Full access, including project settings and members",
  EDITOR: "Can create and edit cases, runs and results",
  VIEWER: "Read-only — no create or edit buttons",
};

const AVS = [
  { bg: 'var(--primary-soft)', color: 'var(--primary-text)' },
  { bg: 'var(--info-soft-fill)', color: 'var(--info)' },
  { bg: 'var(--pass-soft)', color: 'var(--pass)' },
  { bg: 'var(--warn-soft)', color: 'var(--warn)' }
];

function avatarInfo(name: string) {
  let n = 0;
  for (const c of name) n += c.charCodeAt(0);
  const colorSet = AVS[n % AVS.length];
  
  const initials = initialsOf(name);
  
  return { ...colorSet, initials };
}

export function MembersListClient({
  initialMembers,
  projectCode,
}: {
  initialMembers: Member[];
  projectCode: string;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>(initialMembers);

  const [query, setQuery] = useState("");
  const [allWsMembers, setAllWsMembers] = useState<WsMember[]>([]);
  const [suggestions, setSuggestions] = useState<WsMember[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupSearch, setGroupSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [grpRes, usrRes] = await Promise.all([
          fetch(`/api/projects/${projectCode}/groups`),
          fetch("/api/workspace/users"),
        ]);
        if (grpRes.ok) setGroups(await grpRes.json());
        if (usrRes.ok) setAllWsMembers(await usrRes.json());
      } catch (err) {
        console.error(err);
      } finally {
        setGroupsLoading(false);
      }
    })();
  }, [projectCode]);

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    const q = val.toLowerCase();
    const existingIds = new Set(members.map((m) => m.userId));
    const filtered = allWsMembers
      .filter((u) => !existingIds.has(u.id))
      .filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.name || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
    setSuggestions(filtered);
    setShowDropdown(filtered.length > 0);
  };

  const addMember = async (u: WsMember) => {
    setAddingId(u.id);
    setShowDropdown(false);
    setQuery("");
    setSuggestions([]);
    try {
      const res = await fetch(`/api/projects/${projectCode}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, role: "VIEWER" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setMembers((prev) => [
        ...prev,
        {
          id: `${u.id}-${projectCode}`,
          userId: u.id,
          role: "VIEWER",
          user: {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            workspaceRole: u.workspaceRole,
          },
        },
      ]);
      toast.success(`${u.name || u.email} added to project`);
    } catch (e: any) {
      toast.error(e.message || "Failed to add member");
    } finally {
      setAddingId(null);
    }
  };

  const removeMember = async (userId: string) => {
    const prev = members;
    setMembers((m) => m.filter((x) => x.userId !== userId));
    try {
      const res = await fetch(
        `/api/projects/${projectCode}/members/${userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setMembers(prev);
        toast.error("Failed to remove member");
      } else toast.success("Member removed from project");
    } catch {
      setMembers(prev);
      toast.error("Something went wrong");
    }
  };

  const toggleGroup = async (group: Group) => {
    setTogglingId(group.id);
    const prev = groups;
    setGroups((gs) =>
      gs.map((g) =>
        g.id === group.id ? { ...g, isAssigned: !g.isAssigned } : g,
      ),
    );
    try {
      const res = await fetch(`/api/projects/${projectCode}/groups`, {
        method: group.isAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      });
      if (!res.ok) {
        setGroups(prev);
        toast.error("Failed");
      } else
        toast.success(
          group.isAssigned
            ? `Removed "${group.title}"`
            : `Assigned "${group.title}"`,
        );
    } catch {
      setGroups(prev);
    } finally {
      setTogglingId(null);
    }
  };

  const filteredGroups = groups.filter((g) => {
    const q = groupSearch.trim().toLowerCase();
    return (
      !q ||
      g.title.toLowerCase().includes(q) ||
      (g.description || "").toLowerCase().includes(q)
    );
  });

  const resetModal = () => {
    setIsModalOpen(false);
    setQuery("");
    setSuggestions([]);
    setShowDropdown(false);
  };

  const changeRole = async (userId: string, role: string) => {
    const prev = members;
    setMembers((ms) => ms.map((m) => (m.userId === userId ? { ...m, role } : m)));
    try {
      const res = await fetch(`/api/projects/${projectCode}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      toast.success(`Role changed to ${PROJECT_ROLES[role] ?? role}`);
    } catch (e: any) {
      setMembers(prev);
      toast.error(e.message || "Could not change the role");
    }
  };

  const getRoleStyle = (projectRole: string) => {
    if (projectRole === "ADMIN") return { bg: 'var(--warning-soft)', color: 'var(--warning-foreground)' };
    if (projectRole === "EDITOR") return { bg: 'var(--info-soft-fill)', color: 'var(--info)' };
    return { bg: 'var(--surface-2)', color: 'var(--text-faint)' };
  };

  return (
    <div className="animate-in fade-in duration-300 w-full max-w-[960px]">
      
      {/* toolbar */}
      <div className="flex items-center gap-[10px] mb-[16px]">
        <div className="text-[16px] font-semibold text-text-main">
          Users <span className="font-normal text-text-faint ml-[4px]">· {members.length}</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="primary"
          size="sm"
          onClick={() => { setIsModalOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        >
          <UserPlus size={16} />
          Invite member
        </Button>
      </div>

      {/* users table */}
      <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden mb-[32px]">
        <div className="grid grid-cols-[2fr_1fr_60px] gap-[14px] p-[10px_18px] text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-faint border-b border-border bg-surface-hover/30">
          <div>Member</div>
          <div>Role</div>
          <div></div>
        </div>
        
        {members.map(m => {
          const name = m.user.name || "Unknown";
          const av = avatarInfo(name !== "Unknown" ? name : m.user.email);
          const rStyle = getRoleStyle(m.role);
          const elevated = elevatedBy(m.user);
          
          return (
            <div key={m.userId} className="grid grid-cols-[2fr_1fr_60px] gap-[14px] p-[12px_18px] items-center border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
              <div className="flex items-center gap-[11px] min-w-0">
                <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: av.bg, color: av.color }}>
                  {av.initials}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-text-main truncate">{name}</div>
                  <div className="text-[11.5px] text-text-faint truncate">{m.user.email}</div>
                </div>
              </div>
              
              {/* The role that actually decides what this person can do here.
                  This is the screen someone opens to answer "why can't they
                  create a run?", so it shows the deciding role — and says when
                  the decision is being made above the project instead. */}
              <div>
                {elevated ? (
                  <span
                    title={`Full access from their ${elevated} — the project role does not apply`}
                    className="inline-flex items-center gap-[5px] text-[11.5px] font-semibold p-[3px_9px] rounded-[7px]"
                    style={{ background: 'var(--warning-soft)', color: 'var(--warning-foreground)' }}
                  >
                    Admin
                    <span className="font-normal opacity-70">· {elevated}</span>
                  </span>
                ) : (
                  <select
                    value={m.role}
                    onChange={(e) => changeRole(m.userId, e.target.value)}
                    title={ROLE_HINT[m.role]}
                    className="text-[11.5px] font-semibold p-[3px_9px] rounded-[7px] border-0 outline-none cursor-pointer appearance-none focus:ring-2 focus:ring-[color:var(--ring)]"
                    style={{ background: rStyle.bg, color: rStyle.color }}
                  >
                    {Object.entries(PROJECT_ROLES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              
              <div className="flex justify-end">
                <button 
                  onClick={() => removeMember(m.userId)}
                  className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-text-faint hover:bg-danger-soft hover:text-danger transition-colors"
                  title="Remove from project"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
          );
        })}
        
        {members.length === 0 && (
          <div className="p-8 text-center text-text-muted text-[13px]">No members found.</div>
        )}
      </div>

      {/* groups toolbar */}
      <div className="flex items-center gap-[10px] mb-[16px] mt-[10px]">
        <div className="text-[16px] font-semibold text-text-main">
          Groups <span className="font-normal text-text-faint ml-[4px]">· {groups.filter(g => g.isAssigned).length}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-[8px] h-[36px] px-[11px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] rounded-[9px] text-text-faint text-[12.5px] min-w-[200px] focus-within:shadow-[inset_0_0_0_2px_var(--primary-color)] transition-shadow">
          <Search size={17} />
          <input
            type="text"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search groups"
            className="w-full bg-transparent outline-none text-text-main"
          />
        </div>
      </div>

      {/* groups table */}
      <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden mb-[32px]">
        <div className="grid grid-cols-[1fr_90px] gap-[14px] p-[10px_18px] text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-faint border-b border-border bg-surface-hover/30">
          <div>Group</div>
          <div></div>
        </div>
        
        {groupsLoading ? (
          <div className="p-8 flex justify-center text-primary"><Loader2 size={20} className="animate-spin" /></div>
        ) : filteredGroups.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-[13px]">No groups found.</div>
        ) : (
          filteredGroups.map(group => (
            <div key={group.id} className="grid grid-cols-[1fr_90px] gap-[14px] p-[12px_18px] items-center border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
              <div className="flex items-center gap-[11px] min-w-0">
                <div className="w-[32px] h-[32px] rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-text-muted" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-text-main truncate">{group.title}</div>
                  <div className="text-[11.5px] text-text-faint truncate">
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'} {group.description ? `· ${group.description}` : ''}
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={() => toggleGroup(group)}
                  disabled={togglingId === group.id}
                  className={`h-[28px] px-[12px] rounded-[7px] text-[12px] font-semibold flex items-center gap-[4px] transition-colors ${
                    group.isAssigned 
                      ? "bg-primary-soft text-primary-text hover:bg-danger-soft hover:text-danger" 
                      : "bg-surface-2 text-text-muted hover:bg-surface-hover hover:text-text-main"
                  }`}
                  title={group.isAssigned ? "Remove from project" : "Add to project"}
                >
                  {togglingId === group.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : group.isAssigned ? (
                    <Check size={15} />
                  ) : (
                    <Plus size={15} />
                  )}
                  {group.isAssigned ? "Assigned" : "Assign"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[64px]" style={{ background: "color(display-p3 0 0 0 / 0.4)" }} onClick={resetModal}>
          <div 
            className="w-[440px] bg-surface border border-border rounded-[15px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-[10px] p-[18px_20px_0] mb-[16px]">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-primary-soft text-primary-text flex items-center justify-center">
                <UserPlus size={19} />
              </div>
              <div className="text-[15.5px] font-semibold text-text-main">Add member to project</div>
            </div>

            <div className="px-[20px] pb-[20px] flex flex-col gap-[14px]">
              <div className="relative">
                <div className="flex items-center gap-[8px] h-[40px] px-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] rounded-[10px] text-[13px] focus-within:shadow-[inset_0_0_0_2px_var(--primary-color)] transition-shadow">
                  <Search size={18} className="text-text-faint" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Search by name or email…"
                    className="w-full bg-transparent outline-none text-text-main"
                  />
                </div>
                
                {showDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-[4px] bg-surface border border-border rounded-[11px] shadow-lg overflow-hidden max-h-[220px] overflow-y-auto z-50">
                    {suggestions.map((u) => {
                      const av = avatarInfo(u.name || u.email);
                      return (
                        <div 
                          key={u.id}
                          onMouseDown={() => addMember(u)}
                          className={`flex items-center gap-[11px] p-[10px_12px] cursor-pointer hover:bg-surface-hover transition-colors ${addingId === u.id ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: av.bg, color: av.color }}>
                            {av.initials}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-text-main truncate">{u.name || u.email}</div>
                            <div className="text-[11px] text-text-faint truncate">{u.email}</div>
                          </div>
                          <div className="text-[11.5px] font-semibold text-primary-text">Add</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-[9px] p-[14px_20px] border-t border-border bg-surface">
              <Button variant="ghost" size="sm" onClick={resetModal}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
