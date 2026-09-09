/**
 * Qase webhook receiver — POST https://tms.socket9.com/api/webhooks/qase
 *
 * Configure in Qase under Settings → Webhooks with the same secret as
 * QASE_WEBHOOK_SECRET. Deliberately outside the NextAuth middleware matcher:
 * Qase has no session, and authenticates with the `X-Qase-Secret` header instead.
 *
 * The delivery is recorded first and acted on afterwards, so Qase gets its 200
 * immediately (it retries slow endpoints, which would double-apply events) and
 * a delivery that fails to apply is still on disk to inspect and replay.
 */

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { entityIdOf, handleQaseEvent, verifySecret, type QaseEnvelope } from "@/lib/qase/webhook";

export async function POST(request: Request) {
  if (!verifySecret(request.headers.get("x-qase-secret"))) {
    // Say nothing about which half was wrong.
    return Response.json({ status: false, error: "Invalid webhook secret." }, { status: 401 });
  }

  let envelope: QaseEnvelope;
  try {
    envelope = await request.json();
  } catch {
    return Response.json({ status: false, error: "Body must be JSON." }, { status: 400 });
  }

  const event = await prisma.qaseWebhookEvent.create({
    data: {
      eventName: String(envelope.event_name || "unknown"),
      projectCode: String(envelope.project_code || ""),
      externalId: entityIdOf(envelope),
      payload: envelope as any,
    },
    select: { id: true },
  });

  // Qase is waiting: acknowledge now, sync (which downloads attachments) after.
  after(async () => {
    try {
      const outcome = await handleQaseEvent(envelope);
      await prisma.qaseWebhookEvent.update({
        where: { id: event.id },
        data: { status: outcome.status, message: outcome.message, processedAt: new Date() },
      });
    } catch (err) {
      await prisma.qaseWebhookEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          message: err instanceof Error ? err.message : String(err),
          processedAt: new Date(),
        },
      });
    }
  });

  return Response.json({ status: true, result: { received: event.id } }, { status: 202 });
}

/** Lets you confirm the endpoint is reachable without sending a fake event. */
export async function GET() {
  return Response.json({
    status: true,
    result: {
      endpoint: "/api/webhooks/qase",
      method: "POST",
      header: "X-Qase-Secret",
      configured: Boolean(process.env.QASE_WEBHOOK_SECRET),
    },
  });
}
