import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { code },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const testCases = await prisma.testCase.findMany({
      where: {
        projectId: project.id,
        automationScript: { not: null, notIn: [""] },
      },
      include: { suite: true },
    });

    if (testCases.length === 0) {
      return NextResponse.json(
        { error: "No automated test cases found to sync." },
        { status: 400 },
      );
    }

    const GITHUB_TOKEN = project.githubToken || process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = project.githubOwner || process.env.GITHUB_OWNER;
    const GITHUB_REPO = project.githubRepo || process.env.GITHUB_REPO;

    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
      return NextResponse.json(
        {
          error:
            "GitHub integration is not configured. Please set it in Project Settings -> Integrations.",
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

    // 1. Get main branch SHA
    const refRes = await fetch(`${baseUrl}/git/ref/heads/main`, { headers });
    if (!refRes.ok) {
      const err = await refRes.json();
      throw new Error(`Failed to get main branch: ${err.message}`);
    }
    const refData = await refRes.json();
    const mainSha = refData.object.sha;

    // 2. Get the commit that main points to, to get the base tree
    const commitRes = await fetch(`${baseUrl}/git/commits/${mainSha}`, {
      headers,
    });
    if (!commitRes.ok) throw new Error("Failed to get main commit");
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // 3. Construct new tree
    const treePayload = testCases.map((tc) => {
      const suiteName =
        tc.suite?.title.replace(/[^a-zA-Z0-9]/g, "-") || "ungrouped";
      const slugTitle = tc.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const shortId = tc.id.substring(0, 4);
      const filePath = `tests/${suiteName}/${code}-${shortId}-${slugTitle}.spec.ts`;
      const isWrapped = tc.automationScript!.includes("test(");
      let finalScript = tc.automationScript!;
      if (!isWrapped) {
        finalScript = `import { test, expect } from '@playwright/test';\n\ntest('[${code}-${shortId}] ${tc.title.replace(/'/g, "\\'")}', async ({ page }) => {\n${tc.automationScript}\n});`;
      } else if (!finalScript.includes(`[${code}-${shortId}]`)) {
        finalScript = finalScript.replace(
          /(test\(['"`])/,
          `$1[${code}-${shortId}] `,
        );
      }

      return {
        path: filePath,
        mode: "100644",
        type: "blob",
        content: finalScript,
      };
    });

    const createTreeRes = await fetch(`${baseUrl}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treePayload,
      }),
    });

    if (!createTreeRes.ok) {
      const err = await createTreeRes.json();
      throw new Error(`Failed to create tree: ${err.message}`);
    }
    const newTreeData = await createTreeRes.json();
    const newTreeSha = newTreeData.sha;

    // 4. Create Commit
    const createCommitRes = await fetch(`${baseUrl}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `Bulk sync: Added/Updated ${testCases.length} automated test scripts`,
        tree: newTreeSha,
        parents: [mainSha],
      }),
    });

    if (!createCommitRes.ok) {
      const err = await createCommitRes.json();
      throw new Error(`Failed to create commit: ${err.message}`);
    }
    const newCommitData = await createCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // 5. Update or Create Branch
    const branchName = `automation/automated-tests`;
    const checkBranchRes = await fetch(
      `${baseUrl}/git/ref/heads/${branchName}`,
      { headers },
    );

    let prUrl = "";

    if (checkBranchRes.ok) {
      // Branch exists, update it (force push)
      const updateBranchRes = await fetch(
        `${baseUrl}/git/refs/heads/${branchName}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            sha: newCommitSha,
            force: true,
          }),
        },
      );

      if (!updateBranchRes.ok) {
        const err = await updateBranchRes.json();
        throw new Error(`Failed to update branch: ${err.message}`);
      }

      // Check for existing open PR
      const prsRes = await fetch(
        `${baseUrl}/pulls?state=open&head=${GITHUB_OWNER}:${branchName}`,
        { headers },
      );
      if (prsRes.ok) {
        const prs = await prsRes.json();
        if (prs.length > 0) {
          prUrl = prs[0].html_url; // Use existing PR
        }
      }
    } else {
      // Branch does not exist, create it
      const createBranchRes = await fetch(`${baseUrl}/git/refs`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: newCommitSha,
        }),
      });

      if (!createBranchRes.ok) {
        const err = await createBranchRes.json();
        throw new Error(`Failed to create branch: ${err.message}`);
      }
    }

    // 6. Create Pull Request (if we don't have one yet)
    let prNumber = null;
    if (!prUrl) {
      const createPrRes = await fetch(`${baseUrl}/pulls`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: `[Auto] Bulk Sync Automated Tests`,
          body: `This PR contains automated Playwright test scripts for ${testCases.length} test cases exported from QMaster.\n\n*Updated via automated sync.*`,
          head: branchName,
          base: "main",
        }),
      });

      if (!createPrRes.ok) {
        const err = await createPrRes.json();
        console.warn("Failed to create PR:", err);
        prUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/${branchName}`;
      } else {
        const prData = await createPrRes.json();
        prUrl = prData.html_url;
        prNumber = prData.number;
      }
    } else {
      // If we used an existing PR, try to extract the number from the URL
      // e.g. https://github.com/owner/repo/pull/123
      const parts = prUrl.split("/");
      const numStr = parts[parts.length - 1];
      if (numStr && !isNaN(parseInt(numStr))) {
        prNumber = parseInt(numStr);
      }
    }

    // 7. Update Database with new PR URL for all synced cases
    const caseIds = testCases.map((tc) => tc.id);
    await prisma.testCase.updateMany({
      where: { id: { in: caseIds } },
      data: { githubPrUrl: prUrl },
    });

    return NextResponse.json({
      success: true,
      prUrl,
      prNumber,
      count: testCases.length,
    });
  } catch (error: any) {
    console.error("Bulk Sync error:", error);
    return NextResponse.json(
      { error: error.message || "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
