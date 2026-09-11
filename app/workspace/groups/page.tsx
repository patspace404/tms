"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import {
  UserPlus,
  Search,
  X,
  Check,
  Pencil,
  Trash2,
  Loader2,
  ShoppingCart,
  CreditCard,
  Network,
  Flag,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { displayNameOf, initialsOf } from "@/lib/initials";

const GROUP_ICONS: LucideIcon[] = [ShoppingCart, CreditCard, Network, Flag, Building2];

interface GroupMember {
  id: string;
  name: string | null;
  email: string;
}
interface GroupProject {
  id: string;
  name: string;
  code: string;
}
interface Group {
  id: string;
  title: string;
  description: string | null;
  members: number;
  projects: number;
  memberList?: GroupMember[];
  projectList?: GroupProject[];
}
interface WorkspaceUser {
  id: string;
  name: string | null;
  email: string;
}

const AVATAR_COLORS = [
  "var(--primary-soft)",
  "var(--info-soft-fill)",
  "var(--pass-soft)",
  "var(--warn-soft)",
];
const TEXT_COLORS = [
  "var(--primary-text)",
  "var(--info)",
  "var(--pass)",
  "var(--warn)",
];

function avatarMeta(u: { name?: string | null; email: string }, idx: number) {
  const display = displayNameOf(u.name, u.email);
  const initials = initialsOf(u.name, u.email);
  return {
    display,
    initials,
    bg: AVATAR_COLORS[idx % AVATAR_COLORS.length],
    color: TEXT_COLORS[idx % TEXT_COLORS.length],
  };
}

export default function WorkspaceGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<{
    title: string;
    description: string;
    memberIds: Set<string>;
  }>({
    title: "",
    description: "",
    memberIds: new Set(),
  });
  const [memberSearch, setMemberSearch] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/workspace/groups");
      if (res.ok) setGroups(await res.json());
    } catch (err) {
      console.error(err);
      toast.error("Failed to load groups");
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      await loadGroups();
      try {
        const res = await fetch("/api/workspace/users");
        if (res.ok) setUsers(await res.json());
      } catch (err) {
        console.error(err);
      }
      setIsLoading(false);
    })();
  }, [loadGroups]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: "", description: "", memberIds: new Set() });
    setMemberSearch("");
    setDrawerOpen(true);
  };

  const openEdit = async (group: Group) => {
    setEditingId(group.id);
    let memberIds = new Set<string>((group.memberList || []).map((m) => m.id));
    if (!group.memberList) {
      const res = await fetch("/api/workspace/groups");
      if (res.ok) {
        const all: Group[] = await res.json();
        const g = all.find((x) => x.id === group.id);
        memberIds = new Set((g?.memberList || []).map((m) => m.id));
      }
    }
    setForm({
      title: group.title,
      description: group.description || "",
      memberIds,
    });
    setMemberSearch("");
    setDrawerOpen(true);
  };

  const toggleMember = (id: string) => {
    setForm((f) => {
      const next = new Set(f.memberIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...f, memberIds: next };
    });
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error("Group name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        memberIds: Array.from(form.memberIds),
      };
      const res = await fetch(
        editingId ? `/api/workspace/groups/${editingId}` : "/api/workspace/groups",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (res.ok) {
        toast.success(editingId ? "Group updated successfully" : "Group created successfully");
        setDrawerOpen(false);
        await loadGroups();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to save group");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error saving group");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setConfirmDeleteId(null);
    const backup = [...groups];
    setGroups((prev) => prev.filter((g) => g.id !== id));
    try {
      const res = await fetch(`/api/workspace/groups/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Group deleted successfully");
      } else {
        setGroups(backup);
        toast.error("Failed to delete group");
      }
    } catch (err) {
      console.error(err);
      setGroups(backup);
      toast.error("Error deleting group");
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  if (isLoading) {
    return (
      <div className="w-full max-w-[1000px] mx-auto p-[20px_22px] flex items-center justify-center h-[200px]">
        <div className="animate-spin w-8 h-8 rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  const getGroupIconInfo = (idx: number) => {
    const ic = [
      ["var(--primary-soft)", "var(--primary-text)"],
      ["var(--info-soft-fill)", "var(--info)"],
      ["var(--pass-soft)", "var(--pass)"],
      ["var(--warn-soft)", "var(--warn)"]
    ];
    return {
      Icon: GROUP_ICONS[idx % GROUP_ICONS.length],
      bg: ic[idx % 4][0],
      color: ic[idx % 4][1]
    };
  };

  return (
    <div className="w-full max-w-[1000px] mx-auto p-[20px_22px] relative min-h-0 antialiased font-sans">
      <div className="flex items-center gap-[12px] mb-[16px]">
        <div className="text-[16px] font-semibold text-text-main">
          Groups <span className="text-text-faint font-normal">· {groups.length}</span>
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate}>
          <UserPlus size={16} />
          Create group
        </Button>
      </div>

      <div className="flex flex-col gap-[11px]">
        {groups.map((g, idx) => {
          const iconInfo = getGroupIconInfo(idx);
          const projects = g.projectList?.slice(0, 3) || [];
          const members = g.memberList?.slice(0, 4) || [];
          
          return (
            <div key={g.id} className="flex items-center gap-[16px] bg-surface border border-border rounded-[13px] p-[15px_18px] shadow-sm transition-shadow">
              <div
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: iconInfo.bg, color: iconInfo.color }}
              >
                <iconInfo.Icon size={20} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-text-main">{g.title}</div>
                <div className="flex gap-[5px] mt-[5px] flex-wrap">
                  {projects.length > 0 ? (
                    projects.map((p) => (
                      <span key={p.id} className="text-[10.5px] font-semibold px-[8px] py-[1px] rounded-[6px] bg-surface-hover text-text-muted">
                        {p.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10.5px] font-semibold px-[8px] py-[1px] rounded-[6px] bg-surface-hover text-text-faint">
                      No projects
                    </span>
                  )}
                  {(g.projectList?.length || 0) > 3 && (
                    <span className="text-[10.5px] font-semibold px-[8px] py-[1px] rounded-[6px] bg-surface-hover text-text-muted">
                      +{(g.projectList?.length || 0) - 3}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-[14px]">
                <div className="flex items-center gap-[8px]">
                  <div className="flex">
                    {members.map((m, i) => {
                      const a = avatarMeta(m, i);
                      return (
                        <div 
                          key={m.id} 
                          className="w-[24px] h-[24px] rounded-full flex items-center justify-center text-[9px] font-bold shadow-[0_0_0_2px_var(--surface)]"
                          style={{ background: a.bg, color: a.color, marginLeft: i === 0 ? "0" : "-7px" }}
                          title={m.name || m.email}
                        >
                          {a.initials}
                        </div>
                      )
                    })}
                  </div>
                  <span className="text-[11.5px] text-text-faint">{g.members} members</span>
                </div>
                
                <div className="flex gap-[3px]">
                  <button onClick={() => openEdit(g)} className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors">
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setConfirmDeleteId(g.id)} className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-text-faint hover:bg-danger-soft hover:text-danger transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        
        {groups.length === 0 && (
          <div className="p-[40px] text-center border border-dashed border-border-strong rounded-[13px] bg-surface mt-[20px]">
            <div className="text-[14px] font-semibold text-text-main">No groups found</div>
            <div className="text-[13px] text-text-muted mt-[4px]">Create a group to manage user permissions across projects.</div>
          </div>
        )}
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "color(display-p3 0 0 0 / 0.4)" }} onClick={() => setDrawerOpen(false)}>
          <div 
            className="w-[380px] h-full bg-surface border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-[10px] p-[16px_18px] border-b border-border">
              <div className="flex-1">
                <div className="text-[15px] font-semibold text-text-main">{editingId ? "Edit group" : "Create group"}</div>
                {editingId && <div className="text-[12px] text-text-faint">{form.title}</div>}
              </div>
              <button onClick={() => setDrawerOpen(false)} className="text-text-faint hover:text-text-main transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-[16px_18px] flex flex-col gap-[16px] flex-1 overflow-y-auto">
              <div>
                <label className="block text-[12px] text-text-muted mb-[6px]">Group name</label>
                <div className="flex items-center h-[40px] px-[13px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] text-[13.5px] focus-within:shadow-[inset_0_0_0_1.5px_var(--primary-color)] transition-shadow">
                  <input 
                    type="text" 
                    value={form.title}
                    onChange={e => setForm({...form, title: e.target.value})}
                    placeholder="e.g. Payments squad"
                    className="w-full bg-transparent outline-none text-text-main"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-[12px] text-text-muted mb-[6px]">Description</label>
                <div className="flex p-[8px_13px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] text-[13.5px] focus-within:shadow-[inset_0_0_0_1.5px_var(--primary-color)] transition-shadow">
                  <textarea 
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    placeholder="Group description..."
                    className="w-full bg-transparent outline-none text-text-main h-[60px] resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-text-muted mb-[8px]">
                  Members <span className="text-text-faint font-normal">· {form.memberIds.size} selected</span>
                </label>
                <div className="flex items-center gap-[8px] h-[36px] px-[11px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] rounded-[9px] text-[12.5px] mb-[10px] focus-within:shadow-[inset_0_0_0_1px_var(--primary-color)] transition-shadow">
                  <Search size={16} className="text-text-faint shrink-0" />
                  <input
                    type="text" 
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="Search members"
                    className="w-full bg-transparent outline-none text-text-main"
                  />
                </div>
                
                <div className="flex flex-col gap-[2px]">
                  {filteredUsers.length === 0 ? (
                    <div className="text-[12px] text-text-muted text-center py-4">No members found.</div>
                  ) : (
                    filteredUsers.map((u, i) => {
                      const selected = form.memberIds.has(u.id);
                      const a = avatarMeta(u, i);
                      return (
                        <div 
                          key={u.id}
                          onClick={() => toggleMember(u.id)}
                          className="flex items-center gap-[10px] p-[8px_8px] rounded-[9px] cursor-pointer transition-colors"
                          style={{ background: selected ? "var(--primary-soft)" : "transparent" }}
                        >
                          <div 
                            className="w-[18px] h-[18px] rounded-[5px] flex items-center justify-center shrink-0"
                            style={{ 
                              background: selected ? "var(--primary)" : "var(--surface)",
                              boxShadow: selected ? "none" : "inset 0 0 0 1.5px var(--border-strong)"
                            }}
                          >
                            {selected && <Check size={13} strokeWidth={3} className="text-primary-fg" />}
                          </div>
                          
                          <div 
                            className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{ background: a.bg, color: a.color }}
                          >
                            {a.initials}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-medium text-text-main whitespace-nowrap overflow-hidden text-ellipsis">{a.display}</div>
                          </div>
                          <span className="text-[10.5px] text-text-faint truncate max-w-[80px]">{u.email}</span>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-[9px] p-[14px_18px] border-t border-border bg-surface">
              <Button variant="ghost" size="sm" fullWidth onClick={() => setDrawerOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" fullWidth onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {editingId ? "Save group" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this group? Members will not be removed from the workspace."
          onConfirm={() => handleDelete(confirmDeleteId)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}
