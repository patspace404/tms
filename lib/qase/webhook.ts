/**
 * Routing and verification for Qase webhook deliveries.
 *
 * Qase posts `{ event_name, timestamp, payload, team_member_id, project_code }`
 * and authenticates with an `X-Qase-Secret` header.
 *
 * Events are dispatched on the entity prefix (`case.`, `run.`, …) rather than
 * an exhaustive list of names, because Qase adds event types over time and a
 * name we have not seen should still reach the right handler. The payload is
 * only mined for ids — the record itself is re-fetched from the REST API, so
 * a payload field being renamed cannot corrupt what we store.
 */

import * as crypto from "crypto";
import { runSerially } from "./queue";
import { projectForQaseCode, syncCase, syncResult, syncRun, syncSuite, type SyncOutcome } from "./sync";

export type QaseEnvelope = {
  event_name?: string;
  timestamp?: number;
  payload?: Record<string, any>;
  team_member_id?: number;
  project_code?: string;
};

/**
 * Constant-time comparison of the delivery's secret against ours.
 * Returns false when no secret is configured — an unconfigured endpoint must
 * reject everything rather than accept everything.
 */
export function verifySecret(header: string | null): boolean {
  const expected = process.env.QASE_WEBHOOK_SECRET || "";
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}

/** First present value among the given keys — Qase names ids inconsistently. */
function pick(payload: Record<string, any>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload?.[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return null;
}

/** The Qase entity id an event is about, for the audit log. */
export function entityIdOf(envelope: QaseEnvelope): string | null {
  const p = envelope.payload || {};
  return pick(p, "id", "case_id", "run_id", "suite_id");
}

export async function handleQaseEvent(envelope: QaseEnvelope): Promise<SyncOutcome> {
  const eventName = String(envelope.event_name || "").toLowerCase();
  const projectCode = String(envelope.project_code || "");
  const payload = envelope.payload || {};

  if (!eventName) return { status: "SKIPPED", message: "No event_name in payload." };
  if (!projectCode) return { status: "SKIPPED", message: "No project_code in payload." };

  const project = await projectForQaseCode(projectCode);
  if (!project) {
    return {
      status: "SKIPPED",
      message: `No QMaster project mirrors Qase project "${projectCode}". Set its qaseProjectCode to enable sync.`,
    };
  }
  if (project.isArchived) {
    return { status: "SKIPPED", message: `Project ${project.code} is archived.` };
  }

  const [entity] = eventName.split(".");

  // Deletions are deliberately not mirrored: this sync only ever adds.
  if (eventName.endsWith(".deleted") || eventName.endsWith(".removed")) {
    return { status: "SKIPPED", message: `${eventName} ignored — sync never deletes.` };
  }

  // One project's events are applied one at a time; see queue.ts for why.
  return runSerially(project.id, () => dispatch(entity, project.id, projectCode, eventName, payload));
}

async function dispatch(
  entity: string,
  projectId: string,
  projectCode: string,
  eventName: string,
  payload: Record<string, any>,
): Promise<SyncOutcome> {
  switch (entity) {
    case "suite": {
      const id = pick(payload, "id", "suite_id");
      if (!id) return { status: "SKIPPED", message: "Suite event carried no id." };
      return syncSuite(projectId, projectCode, id);
    }

    case "case": {
      const id = pick(payload, "id", "case_id");
      if (!id) return { status: "SKIPPED", message: "Case event carried no id." };
      return syncCase(projectId, projectCode, id);
    }

    case "run": {
      const id = pick(payload, "id", "run_id");
      if (!id) return { status: "SKIPPED", message: "Run event carried no id." };
      return syncRun(projectId, projectCode, id);
    }

    case "result": {
      const runId = pick(payload, "run_id", "run");
      const caseId = pick(payload, "case_id", "case");
      if (!runId || !caseId) {
        return {
          status: "SKIPPED",
          message: `Result event needs run_id and case_id; got run=${runId} case=${caseId}.`,
        };
      }
      return syncResult(projectId, projectCode, runId, caseId);
    }

    default:
      return { status: "SKIPPED", message: `No handler for "${eventName}".` };
  }
}
