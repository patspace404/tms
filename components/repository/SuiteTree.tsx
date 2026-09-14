// components/repository/SuiteTree.tsx
"use client";
import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Plus,
  Loader2,
  X,
  FolderPlus,
  FileText,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { Suite } from "@/types/repository";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { useSuiteExpansion } from "@/components/providers/SuiteExpansionProvider";
import { DeleteSuiteModal } from "@/components/repository/DeleteSuiteModal";

interface SuiteItemProps {
  suite: any;
  level: number;
  projectCode: string;
  selectedSuiteId: string | null;
  onAddChild: (parentId: string) => void;
  onDeleteClick: (suite: any) => void;
  onRename: (suiteId: string, title: string) => Promise<void>;
}

const SuiteItem = ({
  suite,
  level,
  projectCode,
  selectedSuiteId,
  onAddChild,
  onDeleteClick,
  onRename,
}: SuiteItemProps) => {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suite.title);
  const [saving, setSaving] = useState(false);

  const startRename = () => {
    setDraft(suite.title);
    setEditing(true);
  };

  const commitRename = async () => {
    const next = draft.trim();
    setEditing(false);
    // An empty name is not a name, and an unchanged one is not a save.
    if (!next || next === suite.title) {
      setDraft(suite.title);
      return;
    }
    setSaving(true);
    try {
      await onRename(suite.id, next);
    } finally {
      setSaving(false);
    }
  };
  const { role } = useProjectRole();
  const { isExpanded, toggleSuite } = useSuiteExpansion();
  const isOpen = isExpanded(suite.id);
  const hasChildren = suite.children && suite.children.length > 0;

  const isActive = selectedSuiteId === suite.id;

  return (
    <div className="select-none group/item">
      <div
        onClick={() =>
          router.push(`/projects/${projectCode}/repository?suite=${suite.id}`)
        }
        className={cn(
          "flex items-center gap-[7px] py-[7px] pr-[14px] cursor-pointer transition-colors relative rounded-none",
          isActive ? "bg-primary-soft text-primary-text" : "hover:bg-surface-hover text-text-main"
        )}
        style={{ paddingLeft: `${level * 18 + 14}px`, boxShadow: isActive ? 'inset 3px 0 0 var(--primary)' : 'none' }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSuite(suite.id);
          }}
          className={cn(
            "p-0.5 rounded transition-colors shrink-0 flex items-center justify-center",
            isActive ? "text-primary-text" : "text-text-faint hover:text-text-muted",
            hasChildren ? "visible" : "invisible"
          )}
        >
          {isOpen ? (
            <ChevronDown size={17} strokeWidth={2.5} />
          ) : (
            <ChevronRight size={17} strokeWidth={2.5} />
          )}
        </button>

        <span className={cn(
          "shrink-0 flex items-center justify-center",
          isActive ? "text-primary-text" : "text-text-faint"
        )}>
          {isOpen ? (
             <FolderOpen size={17} className="fill-current text-opacity-20" strokeWidth={2} />
          ) : (
             <Folder size={17} strokeWidth={2} />
          )}
        </span>

        {editing ? (
          <input
            autoFocus
            value={draft}
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              // Escape restores the original — a rename must be abandonable.
              if (e.key === "Escape") {
                setDraft(suite.title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-[6px] border border-primary bg-surface px-[6px] py-[1px] text-[14px] font-medium text-text-main outline-none disabled:opacity-60"
          />
        ) : (
          <span
            title={suite.title}
            onDoubleClick={(e) => {
              if (role === "VIEWER" || suite.id === "unassigned") return;
              e.stopPropagation();
              startRename();
            }}
            className={cn(
            "flex-1 text-[14px] whitespace-nowrap overflow-hidden text-ellipsis",
            isActive ? "font-semibold" : "font-medium"
          )}>
            {suite.title}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {suite.caseCount !== undefined && (
            <span className="text-[12px] text-text-faint tabular-nums group-hover/item:hidden">
              {suite.caseCount}
            </span>
          )}

          {role !== "VIEWER" && suite.id !== "unassigned" && (
            <div className="hidden group-hover/item:flex items-center text-text-muted">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isOpen) toggleSuite(suite.id);
                  onAddChild(suite.id);
                }}
                className="p-0.5 hover:text-primary transition-colors mx-1"
                title="Add child suite"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startRename();
                }}
                className="p-0.5 hover:text-primary transition-colors mx-1"
                title="Rename suite (or double-click the name)"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(suite);
                }}
                className="p-0.5 hover:text-danger transition-colors mx-1"
                title="Delete suite"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen && hasChildren ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {hasChildren &&
            suite.children!.map((child: any) => (
              <SuiteItem
                key={child.id}
                suite={child}
                level={level + 1}
                projectCode={projectCode}
                selectedSuiteId={selectedSuiteId}
                onAddChild={onAddChild}
                onDeleteClick={onDeleteClick}
                onRename={onRename}
              />
            ))}
        </div>
      </div>
    </div>
  );
};

export const SuiteTree = ({
  initialSuites,
  cases = [],
  projectCode,
}: {
  initialSuites: any[];
  cases?: any[];
  projectCode: string;
}) => {
  const [suites, setSuites] = useState<any[]>(initialSuites);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newSuiteTitle, setNewSuiteTitle] = useState("");
  const [targetParentId, setTargetParentId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [suiteToDelete, setSuiteToDelete] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  React.useEffect(() => {
    setSuites(initialSuites);
  }, [initialSuites]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useProjectRole();
  const { expandAll, collapseAll } = useSuiteExpansion();
  const selectedSuiteId = searchParams.get("suite");

  // Build tree from flat array and calculate case counts
  const buildTree = (flatList: any[], allCases: any[]) => {
    const map = new Map();
    const roots: any[] = [];

    // Group cases by suite
    const casesBySuite = new Map<string, number>();
    allCases.forEach((tc) => {
      const sId = tc.suiteId || "unassigned";
      casesBySuite.set(sId, (casesBySuite.get(sId) || 0) + 1);
    });
    flatList.forEach((item) => {
      map.set(item.id, { ...item, children: [] });
    });
    flatList.forEach((item) => {
      const node = map.get(item.id);
      if (item.parentId) {
        if (map.has(item.parentId)) {
          map.get(item.parentId).children.push(node);
        } else {
          roots.push(node); // Fallback if parent missing
        }
      } else {
        roots.push(node);
      }
    });

    // Recursively calculate counts
    const calculateCounts = (node: any) => {
      let count = casesBySuite.get(node.id) || 0;
      node.children.forEach((child: any) => {
        count += calculateCounts(child);
      });
      node.caseCount = count;
      return count;
    };

    roots.forEach(calculateCounts);

    return roots;
  };

  const suiteTree = React.useMemo(
    () => buildTree(suites, cases),
    [suites, cases],
  );
  const unassignedCount = React.useMemo(
    () => cases.filter((tc) => !tc.suiteId).length,
    [cases],
  );

  const casesBySuiteId = React.useMemo(() => {
    const map = new Map<string, any[]>();
    cases.forEach((tc) => {
      if (!tc.suiteId) return;
      if (!map.has(tc.suiteId)) map.set(tc.suiteId, []);
      map.get(tc.suiteId)!.push(tc);
    });
    return map;
  }, [cases]);

  const childrenMap = React.useMemo(() => {
    const map = new Map<string, any[]>();
    suites.forEach((s) => {
      if (!s.parentId) return;
      if (!map.has(s.parentId)) map.set(s.parentId, []);
      map.get(s.parentId)!.push(s);
    });
    return map;
  }, [suites]);

  const getDescendantIds = (parentId: string): string[] => {
    const children = childrenMap.get(parentId) || [];
    let ids = children.map((c) => c.id);
    children.forEach((c) => {
      ids = ids.concat(getDescendantIds(c.id));
    });
    return ids;
  };

  const handleRenameSuite = async (suiteId: string, title: string) => {
    const previous = suites;
    // Optimistic: the tree is the thing being edited, so it should not lag
    // behind the keystroke that changed it. Rolled back if the save fails.
    setSuites((prev) => prev.map((s) => (s.id === suiteId ? { ...s, title } : s)));
    try {
      const res = await fetch(`/api/projects/${projectCode}/suites/${suiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to rename suite");
      }
      toast.success("Suite renamed");
      router.refresh();
    } catch (err) {
      setSuites(previous);
      toast.error(err instanceof Error ? err.message : "Failed to rename suite");
    }
  };

  const handleDeleteSuite = async (retainCases: boolean) => {
    if (!suiteToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(
        `/api/projects/${projectCode}/suites/${suiteToDelete.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ retainCases }),
        },
      );
      if (res.ok) {
        const removedIds = new Set([
          suiteToDelete.id,
          ...getDescendantIds(suiteToDelete.id),
        ]);
        setSuites(suites.filter((s) => !removedIds.has(s.id)));
        toast.success("Suite deleted");
        setSuiteToDelete(null);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete suite");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error deleting suite");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenCreateModal = (parentId: string | null) => {
    setTargetParentId(parentId);
    setNewSuiteTitle("");
    setIsCreateModalOpen(true);
  };

  const handleCreateSuite = async () => {
    if (!newSuiteTitle.trim()) {
      toast.error("Suite name is required");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch(`/api/projects/${projectCode}/suites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSuiteTitle.trim(),
          parentId: targetParentId,
        }),
      });
      if (res.ok) {
        const newSuite = await res.json();
        setSuites([...suites, newSuite]);
        toast.success("Suite created successfully");
        setIsCreateModalOpen(false);
        router.refresh();
      } else {
        toast.error("Failed to create suite");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error creating suite");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-surface transition-colors border-r"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="px-[14px] pt-[13px] pb-[10px] flex justify-between items-center shrink-0"
      >
        <span className="font-bold text-[14.5px]">
          Suites
        </span>
        {role !== "VIEWER" && (
          <button
            onClick={() => handleOpenCreateModal(null)}
            className="text-text-faint hover:text-text-main"
          >
            <FolderPlus size={19} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {suiteTree.map((suite) => (
          <SuiteItem
            key={suite.id}
            suite={suite}
            level={0}
            projectCode={projectCode}
            selectedSuiteId={selectedSuiteId}
            onAddChild={handleOpenCreateModal}
            onDeleteClick={setSuiteToDelete}
            onRename={handleRenameSuite}
          />
        ))}
        {unassignedCount > 0 && (
          <SuiteItem
            key="unassigned"
            suite={{
              id: "unassigned",
              title: "Unassigned Test Cases",
              caseCount: unassignedCount,
              children: [],
            }}
            level={0}
            projectCode={projectCode}
            selectedSuiteId={selectedSuiteId}
            onAddChild={() => {}}
            onDeleteClick={() => {}}
            onRename={async () => {}}
          />
        )}
      </div>
      
      <div className="mt-auto px-[14px] py-[12px] border-t border-border flex items-center gap-[7px] text-[12px] text-text-faint">
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        {cases.length} cases · {suites.length} suites
      </div>

      {/* Create Suite Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-[color:var(--overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-border">
              <h3 className="font-bold text-lg text-text-main">Create Suite</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-text-muted hover:text-text-muted transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-text-main mb-2">
                Suite Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={newSuiteTitle}
                onChange={(e) => setNewSuiteTitle(e.target.value)}
                placeholder="e.g. Authentication, Shopping Cart"
                className="w-full border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateSuite();
                  }
                }}
              />
            </div>

            <div className="px-6 py-4 bg-surface-hover border-t border-border flex justify-end space-x-3">
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-text-muted bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSuite}
                disabled={isCreating}
                className="flex items-center px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 size={16} className="animate-spin mr-2" />{" "}
                    Creating...
                  </>
                ) : (
                  "Create Suite"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Suite Modal */}
      <DeleteSuiteModal
        isOpen={!!suiteToDelete}
        onClose={() => setSuiteToDelete(null)}
        suite={suiteToDelete || {}}
        casesBySuiteId={casesBySuiteId}
        childrenMap={childrenMap}
        onDelete={handleDeleteSuite}
        isDeleting={isDeleting}
      />
    </div>
  );
};
