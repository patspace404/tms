import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const { prNumber } = await req.json();

    if (!prNumber) {
      return NextResponse.json(
        { error: "prNumber is required" },
        { status: 400 },
      );
    }

    const project = await prisma.project.findUnique({
      where: { code },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const GITHUB_TOKEN = project.githubToken || process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = project.githubOwner || process.env.GITHUB_OWNER;
    const GITHUB_REPO = project.githubRepo || process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return NextResponse.json(
        {
          error: "GitHub integration is not configured.",
        },
        { status: 400 },
      );
    }

    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };

    const baseUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

    // Merge the Pull Request
    const mergeRes = await fetch(`${baseUrl}/pulls/${prNumber}/merge`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        commit_title: `Merge PR #${prNumber} from QMaster`,
        merge_method: "merge", // or "squash", "rebase"
      }),
    });

    if (!mergeRes.ok) {
      const err = await mergeRes.json();
      throw new Error(`Failed to merge PR: ${err.message}`);
    }

    const mergeData = await mergeRes.json();

    return NextResponse.json({ success: true, message: mergeData.message });
  } catch (error: any) {
    console.error("GitHub Merge error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
