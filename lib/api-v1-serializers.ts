/**
 * Response shapes for /api/v1.
 *
 * These are a published contract: internal columns may be renamed or dropped,
 * but what a serializer emits must stay stable, so route handlers never return
 * Prisma records directly.
 */

export function serializeProject(p: any) {
  return {
    code: p.code,
    title: p.name,
    description: p.description ?? null,
    is_archived: p.isArchived,
    counts: p._count
      ? {
          cases: p._count.testCases ?? 0,
          suites: p._count.suites ?? 0,
          runs: p._count.testRuns ?? 0,
        }
      : undefined,
    created_at: p.createdAt,
  };
}

export function serializeSuite(s: any) {
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    parent_id: s.parentId ?? null,
    position: s.position,
    cases_count: s._count?.testCases,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

export function serializeStep(st: any) {
  return {
    position: st.position,
    action: st.action,
    expected_result: st.expectedResult ?? null,
  };
}

export function serializeCase(c: any) {
  return {
    id: c.id,
    // The human-facing identifier, e.g. "PRO-42" — this is what testers quote.
    code: c.project?.code && c.sequenceNumber ? `${c.project.code}-${c.sequenceNumber}` : undefined,
    position: c.sequenceNumber,
    title: c.title,
    description: c.description ?? null,
    preconditions: c.preconditions ?? null,
    postconditions: c.postconditions ?? null,
    severity: c.severity,
    priority: c.priority,
    automation: c.automationStatus,
    suite_id: c.suiteId ?? null,
    tags: c.tags?.map((t: any) => t.name) ?? undefined,
    steps: c.steps?.map(serializeStep),
    author: c.author ? { id: c.author.id, name: c.author.name, email: c.author.email } : null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

export function serializeRun(r: any) {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    is_public: r.isPublic,
    plan_id: r.planId ?? null,
    environment_id: r.environmentId ?? null,
    milestone_id: r.milestoneId ?? null,
    stats: r._count ? { total: r._count.results } : undefined,
    author: r.author ? { id: r.author.id, name: r.author.name, email: r.author.email } : null,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/**
 * Step outcomes in the order the case runs them.
 *
 * `res.testCase.steps` is the authority on order; when a caller fetched the
 * result without it, fall back to the stored keys so the field is never empty —
 * unordered is still better than missing, and `position` is then omitted rather
 * than guessed.
 */
function serializeStepResults(res: any) {
  const stored = (res.stepResults ?? {}) as Record<string, any>;
  const entry = (stepId: string, position: number | null) => {
    const v = stored[stepId];
    return {
      step_id: stepId,
      position,
      status: v?.status ?? null,
      actual_result: v?.actualResult ?? null,
      attachments: (v?.attachments ?? []).map((a: any) => ({ name: a.name, url: a.url })),
    };
  };

  const ordered: { id: string; position: number }[] = res.testCase?.steps ?? [];
  if (ordered.length === 0) {
    return Object.keys(stored).map((id) => entry(id, null));
  }

  const known = new Set(ordered.map((s) => s.id));
  return [
    ...ordered.map((s, i) => entry(s.id, typeof s.position === "number" ? s.position : i)),
    // Outcomes whose step no longer exists — editing a case replaces its step
    // rows. Kept rather than dropped so nothing recorded disappears silently.
    ...Object.keys(stored)
      .filter((id) => !known.has(id))
      .map((id) => entry(id, null)),
  ];
}

export function serializeResult(res: any) {
  return {
    id: res.id,
    run_id: res.runId,
    case_id: res.caseId,
    status: res.status,
    time_spent_ms: res.timeSpent ?? null,
    comment: res.comment ?? null,
    error_message: res.errorMessage ?? null,
    // Per-step outcomes, keyed by step id in storage; flattened to a list here
    // so clients don't have to care about the internal keying.
    //
    // Ordered by the case's own step order, and carrying `position`, because
    // the list used to come back in whatever order the JSON object happened to
    // be keyed. A client that read it and wrote it straight back landed each
    // value on a different step, with nothing to indicate it had happened.
    steps: res.stepResults ? serializeStepResults(res) : undefined,
    attachments: res.attachments?.map((a: any) => ({
      id: a.id,
      name: a.originalName,
      url: a.url,
      mime: a.mimeType,
      size: a.size,
    })),
    assignee: res.assignee
      ? { id: res.assignee.id, name: res.assignee.name, email: res.assignee.email }
      : null,
    created_at: res.createdAt,
    updated_at: res.updatedAt,
  };
}

export function serializeMilestone(m: any) {
  return {
    id: m.id,
    title: m.title,
    description: m.description ?? null,
    status: m.status,
    due_date: m.dueDate ?? null,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
  };
}

export function serializePlan(p: any) {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? null,
    cases_count: p._count?.testCases,
    case_ids: p.testCases?.map((c: any) => c.id),
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function serializeDefect(d: any) {
  return {
    id: d.id,
    provider: d.provider,
    key: d.key,
    url: d.url,
    summary: d.summary,
    status: d.status ?? null,
    severity: d.severity ?? null,
    case_id: d.caseId ?? null,
    result_id: d.resultId ?? null,
    created_at: d.createdAt,
  };
}

export function serializeEnvironment(e: any) {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    description: e.description ?? null,
    created_at: e.createdAt,
  };
}
