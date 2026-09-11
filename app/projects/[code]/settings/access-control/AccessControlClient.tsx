"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Globe, Lock, Users, Search, Loader2, Check, Plus, Minus, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initialsOf } from "@/lib/initials";

interface Owner {
  id?: string;
  name: string | null;
  email: string;
}
interface AssignedGroup {
  id: string;
  title: string;
  description: string | null;
  memberCount: number;
}
interface AssignedMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
}
interface Group {
  id: string;
  title: string;
  description: string | null;
  memberCount: number;
  isAssigned: boolean;
}
interface WorkspaceMember {
  id: string;
  name: string | null;
  email: string;
}

type PrivateTab = "groups" | "members";

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

export function AccessControlClient({
  projectCode,
  accessType: initialAccessType,
  owner: initialOwner,
  assignedMembers: initialMembers,
}: {
  projectCode: string;
  accessType: "PUBLIC" | "PRIVATE";
  owner: Owner | null;
  assignedGroups: AssignedGroup[];
  assignedMembers: AssignedMember[];
}) {
  const [accessType, setAccessType] = useState<"PUBLIC" | "PRIVATE">(initialAccessType);
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState<Owner | null>(initialOwner);
  const [activeTab, setActiveTab] = useState<PrivateTab>("groups");

  const [editOwnerOpen, setEditOwnerOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");

  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [togglingGroupId, setTogglingGroupId] = useState<string | null>(null);

  const [wsMembers, setWsMembers] = useState<WorkspaceMember[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [assignedMembers, setAssignedMembers] = useState<AssignedMember[]>(initialMembers);

  useEffect(() => {
    (async () => {
      setGroupsLoading(true);
      try {
        const [grpRes, usrRes] = await Promise.all([
          fetch(`/api/projects/${projectCode}/groups`),
          fetch("/api/workspace/users"),
        ]);
        if (grpRes.ok) setAllGroups(await grpRes.json());
        if (usrRes.ok) setWsMembers(await usrRes.json());
      } finally {
        setGroupsLoading(false);
      }
    })();
  }, [projectCode]);

  const saveAccessType = async (type: "PUBLIC" | "PRIVATE") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectCode}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessType: type }),
      });
      if (!res.ok) throw new Error();
      setAccessType(type);
      toast.success(`Project set to ${type === "PUBLIC" ? "Public" : "Private"}`);
    } catch {
      toast.error("Failed to update access type");
    } finally {
      setSaving(false);
    }
  };

  const changeOwner = async (user: WorkspaceMember) => {
    try {
      await fetch(`/api/projects/${projectCode}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "ADMIN" }),
      });
      setOwner({ id: user.id, name: user.name, email: user.email });
      setEditOwnerOpen(false);
      setOwnerSearch("");
      toast.success(`Owner changed to ${user.name || user.email}`);
    } catch {
      toast.error("Failed to change owner");
    }
  };

  const toggleGroup = async (group: Group) => {
    setTogglingGroupId(group.id);
    const prev = allGroups;
    setAllGroups((gs) => gs.map((g) => g.id === group.id ? { ...g, isAssigned: !g.isAssigned } : g));
    try {
      const res = await fetch(`/api/projects/${projectCode}/groups`, {
        method: group.isAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.id }),
      });
      if (!res.ok) {
        setAllGroups(prev);
        toast.error("Failed to update group");
      } else {
        toast.success(group.isAssigned ? `Removed "${group.title}"` : `Added "${group.title}"`);
      }
    } catch {
      setAllGroups(prev);
    } finally {
      setTogglingGroupId(null);
    }
  };

  const addMember = async (user: WorkspaceMember) => {
    if (assignedMembers.some((m) => m.id === user.id)) return;
    setAddingMemberId(user.id);
    try {
      const res = await fetch(`/api/projects/${projectCode}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, role: "VIEWER" }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      setAssignedMembers((prev) => [...prev, { id: user.id, name: user.name, email: user.email, role: "VIEWER" }]);
      toast.success(`Added ${user.name || user.email}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to add member");
    } finally {
      setAddingMemberId(null);
    }
  };

  const removeMember = async (memberId: string) => {
    const prev = assignedMembers;
    setAssignedMembers((m) => m.filter((x) => x.id !== memberId));
    try {
      const res = await fetch(`/api/projects/${projectCode}/members/${memberId}`, { method: "DELETE" });
      if (!res.ok) {
        setAssignedMembers(prev);
        toast.error("Failed to remove member");
      } else toast.success("Member removed");
    } catch {
      setAssignedMembers(prev);
    }
  };

  const filteredGroups = allGroups.filter((g) => !groupSearch || g.title.toLowerCase().includes(groupSearch.toLowerCase()));
  const assignedGroups = allGroups.filter((g) => g.isAssigned);
  const filteredWsMembers = wsMembers.filter((u) => {
    const q = memberSearch.toLowerCase();
    return !q || (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
  const ownerCandidates = wsMembers.filter((u) => {
    const q = ownerSearch.toLowerCase();
    return !q || (u.name || "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const ownerName = owner?.name || owner?.email || "Unknown";
  const ownerAv = avatarInfo(ownerName);

  return (
    <div className="animate-in fade-in duration-300 w-full max-w-[960px]">
      
      {/* Access control section */}
      <div className="mb-[6px] text-[17px] font-semibold tracking-[-0.01em] text-text-main">Access control</div>
      <div className="text-[13.5px] text-text-muted mb-[22px]">Manage project owner and privacy settings.</div>

      {/* Owner */}
      <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden mb-[24px]">
        <div className="p-[18px] flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold text-text-main mb-[4px]">Project owner</div>
            <div className="text-[13px] text-text-muted">The primary contact for this project</div>
          </div>
          <div className="flex items-center gap-[14px]">
            <div className="flex items-center gap-[10px]">
              <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: ownerAv.bg, color: ownerAv.color }}>
                {ownerAv.initials}
              </div>
              <span className="text-[13.5px] font-semibold text-text-main">{ownerName}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditOwnerOpen(true)}>
              Change
            </Button>
          </div>
        </div>
      </div>

      {/* Access Type */}
      <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden mb-[24px]">
        <div className="p-[18px]">
          <div className="text-[14px] font-semibold text-text-main mb-[12px]">Project privacy</div>
          
          <div className="flex flex-col gap-[10px]">
            <div 
              className={`flex items-center gap-[14px] p-[16px] rounded-[11px] border cursor-pointer transition-colors ${accessType === 'PUBLIC' ? 'border-primary bg-primary-soft/10' : 'border-border hover:bg-surface-hover'}`}
              onClick={() => saveAccessType("PUBLIC")}
            >
              <div className="w-[40px] h-[40px] rounded-[9px] bg-surface-2 flex items-center justify-center shrink-0">
                <Globe size={20} className={accessType === 'PUBLIC' ? 'text-primary' : 'text-text-muted'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-text-main mb-[2px]">Public</div>
                <div className="text-[12.5px] text-text-muted">Visible to all members of the workspace</div>
              </div>
              <div className={`w-[22px] h-[22px] rounded-full border-[6px] transition-colors ${accessType === 'PUBLIC' ? 'border-primary bg-surface' : 'border-surface-2 bg-surface-2'}`} />
            </div>

            <div 
              className={`flex items-center gap-[14px] p-[16px] rounded-[11px] border cursor-pointer transition-colors ${accessType === 'PRIVATE' ? 'border-primary bg-primary-soft/10' : 'border-border hover:bg-surface-hover'}`}
              onClick={() => saveAccessType("PRIVATE")}
            >
              <div className="w-[40px] h-[40px] rounded-[9px] bg-surface-2 flex items-center justify-center shrink-0">
                <Lock size={20} className={accessType === 'PRIVATE' ? 'text-primary' : 'text-text-muted'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-semibold text-text-main mb-[2px]">Private</div>
                <div className="text-[12.5px] text-text-muted">Only visible to explicitly assigned users and groups</div>
              </div>
              <div className={`w-[22px] h-[22px] rounded-full border-[6px] transition-colors ${accessType === 'PRIVATE' ? 'border-primary bg-surface' : 'border-surface-2 bg-surface-2'}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Private Details */}
      {accessType === "PRIVATE" && (
        <div className="animate-in fade-in duration-300">
          <div className="flex gap-[4px] mb-[16px] border-b border-border">
            <button 
              onClick={() => setActiveTab("groups")}
              className={`px-[12px] pb-[10px] text-[13.5px] font-semibold border-b-[2px] transition-colors ${activeTab === 'groups' ? 'border-primary text-primary-text' : 'border-transparent text-text-muted hover:text-text-main'}`}
            >
              Groups <span className="font-normal opacity-70">({assignedGroups.length})</span>
            </button>
            <button 
              onClick={() => setActiveTab("members")}
              className={`px-[12px] pb-[10px] text-[13.5px] font-semibold border-b-[2px] transition-colors ${activeTab === 'members' ? 'border-primary text-primary-text' : 'border-transparent text-text-muted hover:text-text-main'}`}
            >
              Members <span className="font-normal opacity-70">({assignedMembers.length})</span>
            </button>
          </div>

          {activeTab === "groups" && (
            <div>
              <div className="flex items-center gap-[8px] h-[36px] px-[12px] bg-surface border border-border rounded-[9px] mb-[14px] text-[13px] focus-within:border-primary transition-colors">
                <Search size={18} className="text-text-faint" />
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)} 
                  placeholder="Search groups" 
                  className="w-full bg-transparent outline-none text-text-main" 
                />
              </div>

              <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden">
                {groupsLoading ? (
                  <div className="p-8 flex justify-center text-primary"><Loader2 size={20} className="animate-spin" /></div>
                ) : filteredGroups.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-[13px]">No groups match your search.</div>
                ) : (
                  filteredGroups.map(g => (
                    <div key={g.id} className="flex items-center justify-between p-[12px_18px] border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                      <div className="flex items-center gap-[12px]">
                        <div className="w-[32px] h-[32px] rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                          <Users size={16} className="text-text-muted" />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold text-text-main">{g.title}</div>
                          <div className="text-[11.5px] text-text-faint">
                            {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'} {g.description ? `· ${g.description}` : ''}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleGroup(g)}
                        disabled={togglingGroupId === g.id}
                        className={`h-[28px] px-[12px] rounded-[7px] text-[12px] font-semibold flex items-center gap-[4px] transition-colors ${
                          g.isAssigned 
                            ? "bg-primary-soft text-primary-text hover:bg-danger-soft hover:text-danger" 
                            : "bg-surface-2 text-text-muted hover:bg-surface-hover hover:text-text-main"
                        }`}
                      >
                        {togglingGroupId === g.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : g.isAssigned ? (
                          <Check size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                        {g.isAssigned ? "Assigned" : "Assign"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === "members" && (
            <div>
              <div className="flex items-center gap-[8px] h-[36px] px-[12px] bg-surface border border-border rounded-[9px] mb-[14px] text-[13px] focus-within:border-primary transition-colors">
                <Search size={18} className="text-text-faint" />
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)} 
                  placeholder="Search workspace members" 
                  className="w-full bg-transparent outline-none text-text-main" 
                />
              </div>

              <div className="bg-surface border border-border rounded-[13px] shadow-sm overflow-hidden">
                {filteredWsMembers.length === 0 ? (
                  <div className="p-8 text-center text-text-muted text-[13px]">No users found.</div>
                ) : (
                  filteredWsMembers.map(u => {
                    const isAdded = assignedMembers.some((m) => m.id === u.id);
                    const av = avatarInfo(u.name || u.email);
                    return (
                      <div key={u.id} className="flex items-center justify-between p-[12px_18px] border-b border-border last:border-0 hover:bg-surface-hover transition-colors">
                        <div className="flex items-center gap-[12px]">
                          <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: av.bg, color: av.color }}>
                            {av.initials}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-text-main">{u.name || u.email}</div>
                            <div className="text-[11.5px] text-text-faint">{u.email}</div>
                          </div>
                        </div>
                        {isAdded ? (
                          <button
                            onClick={() => removeMember(u.id)}
                            className="h-[28px] px-[12px] rounded-[7px] text-[12px] font-semibold flex items-center gap-[4px] bg-primary-soft text-primary-text hover:bg-danger-soft hover:text-danger transition-colors group"
                          >
                            <Check size={15} className="group-hover:hidden" />
                            <Minus size={15} className="hidden group-hover:inline-block" />
                            <span className="group-hover:hidden">Added</span>
                            <span className="hidden group-hover:inline-block">Remove</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => addMember(u)}
                            disabled={addingMemberId === u.id}
                            className="h-[28px] px-[12px] rounded-[7px] text-[12px] font-semibold flex items-center gap-[4px] bg-surface-2 text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
                          >
                            {addingMemberId === u.id ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              <Plus size={15} />
                            )}
                            Add
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Owner Modal */}
      {editOwnerOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[64px]" style={{ background: "color(display-p3 0 0 0 / 0.4)" }} onClick={() => setEditOwnerOpen(false)}>
          <div 
            className="w-[440px] bg-surface border border-border rounded-[15px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-[10px] p-[18px_20px_0] mb-[16px]">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-primary-soft text-primary-text flex items-center justify-center">
                <User size={19} />
              </div>
              <div className="text-[15.5px] font-semibold text-text-main">Change project owner</div>
            </div>

            <div className="px-[20px] pb-[20px] flex flex-col gap-[14px]">
              <div className="flex items-center gap-[8px] h-[40px] px-[12px] bg-surface shadow-[inset_0_0_0_1px_var(--border-color)] rounded-[10px] text-[13px] focus-within:shadow-[inset_0_0_0_2px_var(--primary-color)] transition-shadow">
                <Search size={18} className="text-text-faint" />
                <input
                  type="text"
                  value={ownerSearch}
                  onChange={(e) => setOwnerSearch(e.target.value)}
                  placeholder="Search members…"
                  autoFocus
                  className="w-full bg-transparent outline-none text-text-main"
                />
              </div>

              <div className="border border-border rounded-[11px] overflow-hidden max-h-[240px] overflow-y-auto">
                {ownerCandidates.length === 0 ? (
                  <div className="p-8 text-center text-[13px] text-text-muted">No users found</div>
                ) : (
                  ownerCandidates.map((u) => {
                    const isCurrent = owner?.id === u.id || owner?.email === u.email;
                    const av = avatarInfo(u.name || u.email);
                    return (
                      <div 
                        key={u.id}
                        onClick={() => changeOwner(u)}
                        className={`flex items-center gap-[11px] p-[10px_12px] cursor-pointer hover:bg-surface-hover transition-colors border-b border-border last:border-0 ${isCurrent ? 'bg-primary-soft/30' : ''}`}
                      >
                        <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ background: av.bg, color: av.color }}>
                          {av.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-text-main truncate">{u.name || u.email}</div>
                          <div className="text-[11px] text-text-faint truncate">{u.email}</div>
                        </div>
                        {isCurrent && (
                          <Check size={18} className="text-primary" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-[9px] p-[14px_20px] border-t border-border bg-surface">
              <Button variant="ghost" size="sm" onClick={() => setEditOwnerOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
