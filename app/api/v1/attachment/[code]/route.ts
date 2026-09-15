import crypto from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { s3Client, S3_BUCKET } from "@/lib/s3";
import { fail, handler, ok, requireProject, WRITE_ROLES } from "@/lib/api-v1";
import { MAX_UPLOAD_BYTES, tooLargeMessage } from "@/lib/upload-limits";
import { NextResponse } from "next/server";

// POST /api/v1/attachment/{code}
// multipart/form-data with one or more `file` parts.
//
// Returns urls to hand back in a result's `steps[].attachments`, which is how a
// CI job attaches a screenshot to the exact step that failed.
export const POST = handler(async (req, { params }) => {
  const { code } = await params;
  const ctx = await requireProject(req, code, WRITE_ROLES);
  if (ctx instanceof NextResponse) return ctx;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Send the file as multipart/form-data.", 415);
  }

  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail("No 'file' part found in the request.", 422);

  const uploaded = [];
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(tooLargeMessage(file.name, file.size), 413);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
    const key = `projects/${ctx.projectId}/attachments/${crypto.randomUUID()}${ext}`;
    const mime = file.type || "application/octet-stream";

    await s3Client.send(
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: mime }),
    );

    // The bucket is private, so hand back the proxy path the app serves from.
    const url = `/api/uploads/${key}`;
    const row = await prisma.attachment.create({
      data: {
        filename: key.split("/").pop()!,
        originalName: file.name,
        mimeType: mime,
        size: buffer.length,
        url,
        projectId: ctx.projectId,
      },
    });

    uploaded.push({ id: row.id, name: row.originalName, url, mime, size: row.size });
  }

  return ok(uploaded, 201);
});
