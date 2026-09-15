import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_BUCKET } from "@/lib/s3";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string[] }> },
) {
  try {
    const { filename } = await params;
    const key = filename.join("/");

    // Prevent directory traversal
    if (key.includes("..")) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    // A <video> asks for byte ranges: it is how the player seeks, and Safari
    // will not start playback at all without it. S3 understands the header, so
    // hand it straight through and answer 206 with what comes back — otherwise
    // a screen recording means pulling the whole file for every scrub.
    const range = req.headers.get("range") ?? undefined;

    const obj = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key, Range: range }),
    );

    // Stream the object back from our own origin so the image is same-origin.
    // Redirecting to a presigned S3 URL breaks CORS-loaded <img crossOrigin>
    // (e.g. the public report + PDF export), so we proxy the bytes instead.
    const bytes = await obj.Body!.transformToByteArray();

    const headers: Record<string, string> = {
      "Content-Type": obj.ContentType || "application/octet-stream",
      "Cache-Control": "public, max-age=86400, immutable",
      // Advertised even on a full response, so the player knows it may ask.
      "Accept-Ranges": "bytes",
    };
    if (range && obj.ContentRange) {
      headers["Content-Range"] = obj.ContentRange;
      return new NextResponse(Buffer.from(bytes), { status: 206, headers });
    }

    return new NextResponse(Buffer.from(bytes), { headers });
  } catch (error) {
    console.error("Error serving upload:", error);
    return new NextResponse("Not Found", { status: 404 });
  }
}
