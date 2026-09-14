"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useProjectRole } from "@/components/providers/ProjectRoleProvider";
import { formatThaiTime } from "@/lib/utils";
import { displayNameOf, initialsOf } from "@/lib/initials";

type TrashedCase = {
  id: string;
  title: string;
  sequenceNumber: number;
  suite: string | null;
  deletedAt: string;
  deletedBy: { id: string; name: string | null; email: string } | null;
};

export function TrashClient({ projectCode }: { projectCode: string }) {
  const { role } = useProjectRole();
  const [cases, setCases] = useState<TrashedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmPurge, setConfirmPurge] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectCode}/trash`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed to load");
      const data = await res.json();
      setCases(data.cases ?? []);
      setSelected(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the trash");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    method: "POST" | "DELETE",
    caseIds: string[],
    successText: string,
  ) => {
    setBusy(method);
    try {
      const res = await fetch(`/api/projects/${projectCode}/trash`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      toast.success(`${successText} ${data.count}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(null);
      setConfirmPurge(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const ids = [...selected];
  const canEdit = role !== "VIEWER";
  const canPurge = role === "ADMIN";

  return (
    <div className="mx-auto w-full max-w-[1100px] p-[22px]">
      <div className="mb-[18px]">
        <h1 className="text-[21px] font-semibold tracking-[-0.015em] text-text-main">Trash</h1>
        <p className="mt-[3px] text-[13px] text-text-muted">
          Deleted test cases stay here until someone removes them for good. Restoring puts a
          case back exactly where it was.
        </p>
      </div>

      {selected.size > 0 && (
        <div className="mb-[14px] flex items-center gap-[10px] rounded-[11px] border border-border bg-surface p-[10px_14px] shadow-sm">
          <span className="text-[13px] font-semibold text-text-main">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-[8px]">
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={() => act("POST", ids, "Restored")} loading={busy === "POST"}>
                <RotateCcw size={15} /> Restore
              </Button>
            )}
            {canPurge && (
              <Button size="sm" variant="danger" onClick={() => setConfirmPurge(true)} loading={busy === "DELETE"}>
                <Trash2 size={15} /> Delete permanently
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-[12px] border border-border bg-surface">
        <div className="grid grid-cols-[34px_84px_minmax(0,1fr)_180px_150px] gap-[12px] border-b border-border bg-surface-hover/40 px-[16px] py-[9px] text-[11px] font-semibold uppercase tracking-[0.05em] text-text-faint">
          <div />
          <div>ID</div>
          <div>Title</div>
          <div>Deleted by</div>
          <div>Deleted</div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-[16px] py-[26px] text-[13px] text-text-muted">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </div>
        ) : cases.length === 0 ? (
          <div className="px-[16px] py-[40px] text-center">
            <Trash2 size={26} className="mx-auto mb-[9px] text-text-faint" />
            <div className="text-[13.5px] text-text-muted">
              Nothing here. Deleted test cases will show up in this list.
            </div>
          </div>
        ) : (
          cases.map((c) => {
            const who = c.deletedBy;
            return (
              <div
                key={c.id}
                className="grid grid-cols-[34px_84px_minmax(0,1fr)_180px_150px] items-center gap-[12px] border-b border-border px-[16px] py-[10px] text-[13px] last:border-0 hover:bg-surface-hover/40"
              >
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    aria-label={`Select ${c.title}`}
                    className="h-[15px] w-[15px] cursor-pointer accent-[color:var(--primary)]"
                  />
                </div>
                <div className="qm-mono text-[12px] text-text-faint">
                  {projectCode}-{c.sequenceNumber}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-main" title={c.title}>
                    {c.title}
                  </div>
                  {c.suite && (
                    <div className="truncate text-[11.5px] text-text-muted">{c.suite}</div>
                  )}
                </div>
                <div className="flex items-center gap-[7px] text-[12.5px] text-text-muted">
                  {who ? (
                    <>
                      <span className="flex h-[21px] w-[21px] items-center justify-center rounded-full bg-primary-light text-[9.5px] font-bold text-primary">
                        {initialsOf(who.name, who.email)}
                      </span>
                      <span className="truncate">{displayNameOf(who.name, who.email)}</span>
                    </>
                  ) : (
                    // Cases deleted before this screen existed have no record of who.
                    <span className="text-text-faint">Unknown</span>
                  )}
                </div>
                <div className="text-[12.5px] text-text-muted">{formatThaiTime(c.deletedAt)}</div>
              </div>
            );
          })
        )}
      </div>

      {confirmPurge && (
        <ConfirmDialog
          title={`Delete ${selected.size} test case${selected.size === 1 ? "" : "s"} permanently`}
          message="This removes them from the database. There is no way to get them back."
          confirmLabel="Delete permanently"
          variant="danger"
          onConfirm={() => act("DELETE", ids, "Permanently deleted")}
          onCancel={() => setConfirmPurge(false)}
        />
      )}
    </div>
  );
}
