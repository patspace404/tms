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
  GripVertical,
} from "lucide-react";
import { toast } from "sonner";
import { Suite } from "@/types/repository";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { useSuiteExpansion } from "@/components/providers/SuiteExpansionProvider";
import { useSuiteSelection } from "@/components/providers/SuiteSelectionProvider";
import { DeleteSuiteModal } from "@/components/repository/DeleteSuiteModal";

type DropPosition = "before" | "inside" | "after";

interface SuiteItemProps {
  suite: any;
  level: number;
  projectCode: string;
  selectedSuiteId: string | null;
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  onAddChild: (parentId: string) => void;
  onDeleteClick: (suite: any) => void;
  onRename: (suiteId: string, title: string) => Promise<void>;
  draggedSuiteId: string | null;
  draggedCaseId: string | null;
  dropTarget: { suiteId: string; position: DropPosition } | null;
  onDragStartSuite: (suiteId: string) => void;
  onDragStartCase: (caseId: string) => void;
  onDragOverSuite: (e: React.DragEvent, targetSuite: any) => void;
  onDragLeaveSuite: (suiteId: string) => void;
  onDropSuite: (e: React.DragEvent, targetSuite: any) => void;
  onDragEndSuite: () => void;
}

const SuiteItem = ({
  suite,
  level,
  projectCode,
  selectedSuiteId,
  activeCaseId,
  onSelectCase,
  onAddChild,
  onDeleteClick,
  onRename,
  draggedSuiteId,
  draggedCaseId,
  dropTarget,
  onDragStartSuite,
  onDragStartCase,
  onDragOverSuite,
  onDragLeaveSuite,
  onDropSuite,
  onDragEndSuite,
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
  const hasChildSuites = suite.children && suite.children.length > 0;
  const hasDirectCases = suite.cases && suite.cases.length > 0;
  const hasExpandable = hasChildSuites || hasDirectCases;

  const isActive = selectedSuiteId === suite.id;
  const canDrag = role !== "VIEWER" && suite.id !== "unassigned" && !editing;
  const isDragged = draggedSuiteId === suite.id;
  const isDropBefore =
    dropTarget?.suiteId === suite.id && dropTarget.position === "before";
  const isDropAfter =
    dropTarget?.suiteId === suite.id && dropTarget.position === "after";
  const isDropInside =
    dropTarget?.suiteId === suite.id && dropTarget.position === "inside";

  return (
    <div className={cn("select-none group/item", isDragged && "opacity-45")}>
      <div
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) {
            e.preventDefault();
            return;
          }
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("application/x-qmaster-suite", suite.id);
          e.dataTransfer.setData("text/plain", `suite:${suite.id}`);
          onDragStartSuite(suite.id);
        }}
        onDragOver={(e) => {
          onDragOverSuite(e, suite);
        }}
        onDragLeave={() => {
          onDragLeaveSuite(suite.id);
        }}
        onDrop={(e) => {
          onDropSuite(e, suite);
        }}
        onDragEnd={onDragEndSuite}
        onClick={() =>
          router.push(`/projects/${projectCode}/repository?suite=${suite.id}`)
        }
        className={cn(
          "flex items-center gap-[7px] py-[7px] pr-[14px] cursor-pointer transition-colors relative rounded-none",
          isActive
            ? "bg-primary-soft text-primary-text"
            : "hover:bg-surface-hover text-text-main",
          isDropInside && "bg-primary-soft/80 ring-2 ring-inset ring-primary",
        )}
        style={{
          paddingLeft: `${level * 18 + 10}px`,
          boxShadow: isActive ? "inset 3px 0 0 var(--primary)" : "none",
        }}
      >
        {isDropBefore && (
          <div
            className="pointer-events-none absolute top-0 right-2 h-[2px] bg-primary z-20"
            style={{ left: `${level * 18 + 14}px` }}
          >
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
          </div>
        )}
        {isDropAfter && (
          <div
            className="pointer-events-none absolute bottom-0 right-2 h-[2px] bg-primary z-20"
            style={{ left: `${level * 18 + 14}px` }}
          >
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
          </div>
        )}
        {canDrag && (
          <span
            className="opacity-0 group-hover/item:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-text-faint shrink-0 -ml-1"
            title="Drag to move or reorder suite"
          >
            <GripVertical size={13} />
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleSuite(suite.id);
          }}
          className={cn(
            "p-0.5 rounded transition-colors shrink-0 flex items-center justify-center",
            isActive ? "text-primary-text" : "text-text-faint hover:text-text-muted",
            hasExpandable ? "visible" : "invisible"
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
        style={{ gridTemplateRows: isOpen && hasExpandable ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {hasChildSuites &&
            suite.children!.map((child: any) => (
              <SuiteItem
                key={child.id}
                suite={child}
                level={level + 1}
                projectCode={projectCode}
                selectedSuiteId={selectedSuiteId}
                activeCaseId={activeCaseId}
                onSelectCase={onSelectCase}
                onAddChild={onAddChild}
                onDeleteClick={onDeleteClick}
                onRename={onRename}
                draggedSuiteId={draggedSuiteId}
                draggedCaseId={draggedCaseId}
                dropTarget={dropTarget}
                onDragStartSuite={onDragStartSuite}
                onDragStartCase={onDragStartCase}
                onDragOverSuite={onDragOverSuite}
                onDragLeaveSuite={onDragLeaveSuite}
                onDropSuite={onDropSuite}
                onDragEndSuite={onDragEndSuite}
              />
            ))}
          {hasDirectCases &&
            suite.cases!.map((tc: any) => {
              const isCaseActive = activeCaseId === tc.id;
              const isCaseDragged = draggedCaseId === tc.id;
              const canDragCase = role !== "VIEWER";
              const caseCode = `${projectCode}-${tc.sequenceNumber || tc.id.substring(0, 4)}`;
              return (
                <div
                  key={tc.id}
                  draggable={canDragCase}
                  onDragStart={(e) => {
                    if (!canDragCase) {
                      e.preventDefault();
                      return;
                    }
                    e.stopPropagation();
                    e.dataTransfer.effectAllowed = "move";
                    const ids = [tc.id];
                    e.dataTransfer.setData(
                      "application/x-qmaster-cases",
                      JSON.stringify(ids),
                    );
                    e.dataTransfer.setData(
                      "text/plain",
                      `cases:${JSON.stringify(ids)}`,
                    );
                    onDragStartCase(tc.id);
                  }}
                  onDragOver={(e) => {
                    if (
                      draggedCaseId ||
                      e.dataTransfer.types.includes(
                        "application/x-qmaster-cases",
                      )
                    ) {
                      onDragOverSuite(e, suite);
                    }
                  }}
                  onDrop={(e) => {
                    if (
                      draggedCaseId ||
                      e.dataTransfer.types.includes(
                        "application/x-qmaster-cases",
                      )
                    ) {
                      onDropSuite(e, suite);
                    }
                  }}
                  onDragEnd={onDragEndSuite}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectCase(tc.id);
                  }}
                  className={cn(
                    "group/case flex items-center gap-[6px] py-[5px] pr-[12px] cursor-pointer transition-colors text-[12.5px]",
                    isCaseActive
                      ? "bg-primary-soft text-primary-text font-medium"
                      : "hover:bg-surface-hover text-text-muted hover:text-text-main",
                    isCaseDragged && "opacity-45",
                  )}
                  style={{
                    paddingLeft: `${(level + 1) * 18 + 18}px`,
                    boxShadow: isCaseActive
                      ? "inset 3px 0 0 var(--primary)"
                      : "none",
                  }}
                  title={`${caseCode}: ${tc.title}`}
                >
                  {canDragCase && (
                    <span
                      className="opacity-0 group-hover/case:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing text-text-faint shrink-0 -ml-1"
                      title="Drag to move test case to another suite"
                    >
                      <GripVertical size={12} />
                    </span>
                  )}
                  <FileText
                    size={13.5}
                    className={cn(
                      "shrink-0",
                      isCaseActive ? "text-primary-text" : "text-text-faint",
                    )}
                  />
                  <span className="qm-mono text-[11px] text-text-faint shrink-0 tabular-nums">
                    {caseCode}
                  </span>
                  <span className="truncate flex-1">{tc.title}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export const SuiteTree = ({
  initialSuites,
  cases: initialCases = [],
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
  const [draggedSuiteId, setDraggedSuiteId] = useState<string | null>(null);
  const [draggedCaseId, setDraggedCaseId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    suiteId: string;
    position: DropPosition;
  } | null>(null);

  React.useEffect(() => {
    setSuites(initialSuites);
  }, [initialSuites]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role } = useProjectRole();
  const { expandAll, collapseAll, isExpanded, toggleSuite } = useSuiteExpansion();
  const {
    activeCaseId,
    setActiveCaseId,
    caseSuiteOverrides,
    setCaseSuiteOverride,
    clearSelection,
  } = useSuiteSelection();
  const selectedSuiteId = searchParams.get("suite");

  const cases = React.useMemo(
    () =>
      initialCases.map((tc) =>
        Object.prototype.hasOwnProperty.call(caseSuiteOverrides, tc.id)
          ? { ...tc, suiteId: caseSuiteOverrides[tc.id] }
          : tc,
      ),
    [initialCases, caseSuiteOverrides],
  );

  // Build tree from flat array and calculate case counts
  const buildTree = (flatList: any[], allCases: any[]) => {
    const map = new Map();
    const roots: any[] = [];

    // Group cases by suite
    const casesBySuite = new Map<string, any[]>();
    allCases.forEach((tc) => {
      const sId = tc.suiteId || "unassigned";
      if (!casesBySuite.has(sId)) casesBySuite.set(sId, []);
      casesBySuite.get(sId)!.push(tc);
    });
    casesBySuite.forEach((list) =>
      list.sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)),
    );
    const sortedList = [...flatList].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    sortedList.forEach((item) => {
      map.set(item.id, {
        ...item,
        children: [],
        cases: casesBySuite.get(item.id) || [],
      });
    });
    sortedList.forEach((item) => {
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
      let count = (casesBySuite.get(node.id) || []).length;
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
  const unassignedCases = React.useMemo(
    () =>
      cases
        .filter((tc) => !tc.suiteId)
        .sort((a, b) => (a.sequenceNumber ?? 0) - (b.sequenceNumber ?? 0)),
    [cases],
  );
  const unassignedCount = unassignedCases.length;

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

  const handleDragStartSuite = (suiteId: string) => {
    setDraggedCaseId(null);
    setDraggedSuiteId(suiteId);
  };

  const handleDragStartCase = (caseId: string) => {
    setDraggedSuiteId(null);
    setDraggedCaseId(caseId);
  };

  const isDraggingCases = (e: React.DragEvent) =>
    Boolean(draggedCaseId) ||
    e.dataTransfer.types.includes("application/x-qmaster-cases");

  const handleDragOverSuite = (e: React.DragEvent, targetSuite: any) => {
    if (isDraggingCases(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (
        dropTarget?.suiteId !== targetSuite.id ||
        dropTarget?.position !== "inside"
      ) {
        setDropTarget({ suiteId: targetSuite.id, position: "inside" });
      }
      return;
    }

    if (targetSuite.id === "unassigned") return;
    if (!draggedSuiteId || draggedSuiteId === targetSuite.id) return;

    // Prevent dropping onto own descendants
    const descendants = getDescendantIds(draggedSuiteId);
    if (descendants.includes(targetSuite.id)) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const height = rect.height || 1;
    const ratio = offsetY / height;

    let position: DropPosition = "inside";
    if (ratio < 0.28) {
      position = "before";
    } else if (ratio > 0.72) {
      position = "after";
    }

    if (
      dropTarget?.suiteId !== targetSuite.id ||
      dropTarget?.position !== position
    ) {
      setDropTarget({ suiteId: targetSuite.id, position });
    }
  };

  const handleDragLeaveSuite = (suiteId: string) => {
    if (dropTarget?.suiteId === suiteId) {
      setDropTarget(null);
    }
  };

  const handleDragEndSuite = () => {
    setDraggedSuiteId(null);
    setDraggedCaseId(null);
    setDropTarget(null);
  };

  const extractDraggedCaseIds = (e: React.DragEvent): string[] | null => {
    const raw = e.dataTransfer.getData("application/x-qmaster-cases");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
    const text = e.dataTransfer.getData("text/plain");
    if (text?.startsWith("cases:")) {
      try {
        const parsed = JSON.parse(text.slice("cases:".length));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
    if (draggedCaseId) return [draggedCaseId];
    return null;
  };

  const handleDropSuite = async (e: React.DragEvent, targetSuite: any) => {
    e.preventDefault();
    e.stopPropagation();

    const caseIds = extractDraggedCaseIds(e);
    if (caseIds && caseIds.length > 0) {
      setDraggedSuiteId(null);
      setDraggedCaseId(null);
      setDropTarget(null);

      const targetSuiteId: string | null =
        targetSuite.id === "unassigned" ? null : targetSuite.id;

      // Filter to cases whose suite actually changes
      const casesToMove = caseIds.filter((id) => {
        const found = cases.find((tc) => tc.id === id);
        return found && (found.suiteId ?? null) !== targetSuiteId;
      });

      if (casesToMove.length === 0) return;

      const prevSuitesByCase = new Map<string, string | null>();
      casesToMove.forEach((id) => {
        const found = cases.find((tc) => tc.id === id);
        prevSuitesByCase.set(id, found?.suiteId ?? null);
      });

      setCaseSuiteOverride(casesToMove, targetSuiteId);
      clearSelection();

      if (!isExpanded(targetSuite.id)) {
        toggleSuite(targetSuite.id);
      }

      try {
        const res = await fetch(`/api/projects/${projectCode}/cases/bulk`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caseIds: casesToMove,
            fields: { suiteId: targetSuiteId },
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to move test case(s)");
        }
        toast.success(
          `Moved ${casesToMove.length} test case${casesToMove.length > 1 ? "s" : ""} to "${targetSuite.title}"`,
        );
        router.refresh();
      } catch (err) {
        prevSuitesByCase.forEach((prevSuiteId, id) => {
          setCaseSuiteOverride([id], prevSuiteId);
        });
        toast.error(
          err instanceof Error ? err.message : "Failed to move test case(s)",
        );
      }
      return;
    }

    if (targetSuite.id === "unassigned") {
      setDraggedSuiteId(null);
      setDraggedCaseId(null);
      setDropTarget(null);
      return;
    }

    const rawText = e.dataTransfer.getData("text/plain");
    const sourceId =
      draggedSuiteId ||
      e.dataTransfer.getData("application/x-qmaster-suite") ||
      (rawText?.startsWith("suite:") ? rawText.slice("suite:".length) : rawText);
    const position = dropTarget?.position || "inside";
    setDraggedSuiteId(null);
    setDraggedCaseId(null);
    setDropTarget(null);

    if (!sourceId || sourceId === targetSuite.id) return;

    const descendants = getDescendantIds(sourceId);
    if (descendants.includes(targetSuite.id)) {
      toast.error("Cannot move a suite inside its own child suite");
      return;
    }

    const sourceSuite = suites.find((s) => s.id === sourceId);
    if (!sourceSuite) return;

    const newParentId: string | null =
      position === "inside" ? targetSuite.id : (targetSuite.parentId ?? null);

    // Get existing siblings in the destination parent (excluding source)
    const siblings = suites
      .filter((s) => (s.parentId ?? null) === newParentId && s.id !== sourceId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    let insertIndex = siblings.length;
    if (position === "before" || position === "after") {
      const targetIdx = siblings.findIndex((s) => s.id === targetSuite.id);
      if (targetIdx !== -1) {
        insertIndex = position === "before" ? targetIdx : targetIdx + 1;
      }
    }

    const orderedSiblings = [...siblings];
    orderedSiblings.splice(insertIndex, 0, {
      ...sourceSuite,
      parentId: newParentId,
    });
    const orderedSiblingIds = orderedSiblings.map((s) => s.id);
    const positionMap = new Map<string, number>();
    orderedSiblingIds.forEach((id, idx) => positionMap.set(id, idx));

    const previousSuites = suites;
    setSuites((prev) =>
      prev.map((s) => {
        if (s.id === sourceId) {
          return {
            ...s,
            parentId: newParentId,
            position: positionMap.get(s.id) ?? 0,
          };
        }
        if (positionMap.has(s.id)) {
          return { ...s, position: positionMap.get(s.id)! };
        }
        return s;
      }),
    );

    if (position === "inside" && !isExpanded(targetSuite.id)) {
      toggleSuite(targetSuite.id);
    }

    try {
      const res = await fetch(
        `/api/projects/${projectCode}/suites/${sourceId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentId: newParentId,
            position: positionMap.get(sourceId) ?? 0,
            orderedSiblingIds,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move suite");
      }
      toast.success("Suite moved");
      router.refresh();
    } catch (err) {
      setSuites(previousSuites);
      toast.error(err instanceof Error ? err.message : "Failed to move suite");
    }
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
            activeCaseId={activeCaseId}
            onSelectCase={setActiveCaseId}
            onAddChild={handleOpenCreateModal}
            onDeleteClick={setSuiteToDelete}
            onRename={handleRenameSuite}
            draggedSuiteId={draggedSuiteId}
            draggedCaseId={draggedCaseId}
            dropTarget={dropTarget}
            onDragStartSuite={handleDragStartSuite}
            onDragStartCase={handleDragStartCase}
            onDragOverSuite={handleDragOverSuite}
            onDragLeaveSuite={handleDragLeaveSuite}
            onDropSuite={handleDropSuite}
            onDragEndSuite={handleDragEndSuite}
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
              cases: unassignedCases,
            }}
            level={0}
            projectCode={projectCode}
            selectedSuiteId={selectedSuiteId}
            activeCaseId={activeCaseId}
            onSelectCase={setActiveCaseId}
            onAddChild={() => {}}
            onDeleteClick={() => {}}
            onRename={async () => {}}
            draggedSuiteId={draggedSuiteId}
            draggedCaseId={draggedCaseId}
            dropTarget={dropTarget}
            onDragStartSuite={() => {}}
            onDragStartCase={handleDragStartCase}
            onDragOverSuite={handleDragOverSuite}
            onDragLeaveSuite={handleDragLeaveSuite}
            onDropSuite={handleDropSuite}
            onDragEndSuite={handleDragEndSuite}
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
