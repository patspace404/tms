import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "@/lib/s3";
import { MAX_UPLOAD_BYTES, tooLargeMessage } from "@/lib/upload-limits";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const projectIdOrCode = formData.get("projectId") as string;

    if (!file || !projectIdOrCode) {
      return NextResponse.json(
        { error: "File and projectId are required" },
        { status: 400 },
      );
    }

    // Say why a file is too big. Without this the only thing standing between a
    // screen recording and the server is nginx, which answers with an HTML
    // error page that tells the person nothing.
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: tooLargeMessage(file.name, file.size) },
        { status: 413 },
      );
    }

    // Workspace-level uploads (e.g. the logo) aren't tied to a project — just
    // push the bytes to S3 and return the URL without creating a project/attachment.
    if (projectIdOrCode === "__workspace__") {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const uniqueFilename = `${Date.now()}-${safeFilename}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: uniqueFilename,
          Body: buffer,
          ContentType: file.type || "application/octet-stream",
        }),
      );
      const fileUrl = `/api/uploads/${uniqueFilename}`;
      return NextResponse.json(
        { url: fileUrl, filename: uniqueFilename, originalName: file.name },
        { status: 201 },
      );
    }

    let project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectIdOrCode }, { code: projectIdOrCode }],
      },
    });

    if (!project) {
      // Auto-create project to prevent 404s during development
      project = await prisma.project.create({
        data: {
          code: projectIdOrCode,
          name: projectIdOrCode + " Project",
        },
      });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Sanitize filename
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const uniqueFilename = `${Date.now()}-${safeFilename}`;

    // Upload to S3
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: uniqueFilename,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    });
    await s3Client.send(command);

    const fileUrl = `/api/uploads/${uniqueFilename}`;

    const attachment = await prisma.attachment.create({
      data: {
        filename: uniqueFilename,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        url: fileUrl,
        projectId: project.id,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
