import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, ProjectRole } from "@prisma/client";
import { getProjectRole } from "@/lib/project-auth";
import {
  ApiActor,
  authenticateApiRequest,
  isAuthFailure,
} from "@/lib/api-token";

/**
 * Shared plumbing for the public REST API (/api/v1).
 *
 * Every response uses one envelope so clients can branch on `status` alone:
 *   success → { status: true,  result: ... }
 *   failure → { status: false, error: "..." }
 */

export function ok(result: unknown, init?: number) {
  return NextResponse.json({ status: true, result }, { status: init ?? 200 });
}

export function fail(error: string, status: number) {
  return NextResponse.json({ status: false, error }, { status });
}

/** Cursor-free pagination matching Qase's limit/offset contract. */
export function paging(req: Request, defaultLimit = 100, maxLimit = 100) {
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const rawOffset = Number(url.searchParams.get("offset"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  return { limit, offset };
}

export function listEnvelope<T>(entities: T[], total: number, limit: number, offset: number) {
  return { total, filtered: entities.length, count: entities.length, limit, offset, entities };
}

/** Authenticate, or return the 401 response to hand straight back. */
export async function requireActor(req: Request): Promise<ApiActor | NextResponse> {
  const actor = await authenticateApiRequest(req);
  if (isAuthFailure(actor)) return fail(actor.error, actor.status);
  return actor;
}

export type ProjectContext = { actor: ApiActor; projectId: string; role: ProjectRole };

/**
 * Authenticate and authorise against one project in a single step.
 *
 * The token acts as its owning user, so this reuses the exact role rules the
 * web UI enforces — no parallel permission model to keep in sync.
 */
export async function requireProject(
  req: Request,
  code: string,
  allowed: ProjectRole[],
): Promise<ProjectContext | NextResponse> {
  const actor = await requireActor(req);
  if (actor instanceof NextResponse) return actor;

  const project = await prisma.project.findUnique({
    where: { code },
    select: { id: true },
  });
  // Same response whether the project is missing or invisible to this token —
  // otherwise the API leaks which project codes exist.
  if (!project) return fail(`Project '${code}' not found.`, 404);

  const role = await getProjectRole(code, actor.userId);
  if (!role || !allowed.includes(role)) {
    return fail(`Your token does not have permission to do this in '${code}'.`, 403);
  }

  return { actor, projectId: project.id, role };
}

export const READ_ROLES: ProjectRole[] = ["VIEWER", "EDITOR", "ADMIN"];
export const WRITE_ROLES: ProjectRole[] = ["EDITOR", "ADMIN"];

/** Parse a JSON body, returning null when absent or malformed. */
export async function readJson<T = any>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Wrap a handler so an unexpected throw becomes a clean 500, never a stack. */
export function handler(
  fn: (req: Request, ctx: any) => Promise<NextResponse>,
): (req: Request, ctx: any) => Promise<NextResponse> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      console.error("[api/v1]", err);
      // A bare "Internal server error." tells the caller nothing and hides
      // constraint violations that are really the caller's or the data's
      // problem, so name the ones we can recognise.
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const target = Array.isArray(err.meta?.target)
          ? (err.meta.target as string[]).join(", ")
          : String(err.meta?.target ?? "");
        if (err.code === "P2002") {
          return fail(
            `Unique constraint violated${target ? ` on: ${target}` : ""}.`,
            409,
          );
        }
        if (err.code === "P2003") return fail("Referenced record does not exist.", 422);
        if (err.code === "P2025") return fail("Record not found.", 404);
      }
      return fail("Internal server error.", 500);
    }
  };
}
