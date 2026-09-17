import React from "react";
import { formatThaiTime } from "@/lib/utils";

interface PdfReportTemplateProps {
  run: any;
  projectCode: string;
  hidePassed?: boolean;
}

export function PdfReportTemplate({
  run,
  projectCode,
  hidePassed = false,
}: PdfReportTemplateProps) {
  // Calculate summary metrics
  const total = run.results?.length || 0;
  const passed =
    run.results?.filter((r: any) => r.status === "PASSED").length || 0;
  const failed =
    run.results?.filter((r: any) => r.status === "FAILED").length || 0;
  const blocked =
    run.results?.filter((r: any) => r.status === "BLOCKED").length || 0;
  const skipped =
    run.results?.filter((r: any) => r.status === "SKIPPED").length || 0;
  const untested =
    run.results?.filter(
      (r: any) => r.status === "UNTESTED" || r.status === "IN_PROGRESS",
    ).length || 0;

  const completionRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  // How long a run took is an internal matter — it says more about the tester's
  // day than about the software, and it is not something to hand a customer.
  // The count of defects raised is what a reader of this report actually wants.
  const defectCount = new Set(
    (run.results || []).flatMap((r: any) =>
      (r.linkedIssues || []).map((i: any) => i.key || i.id),
    ),
  ).size;

  const userLabel = (u: any) =>
    u ? u.name || u.email?.split("@")[0] || "—" : "Unassigned";

  // Order cases by suite, then sequence — matching the execution view.
  const sortedResults = [...(run.results || [])].sort((a: any, b: any) => {
    const sa = a.testCase?.suite?.title || "~Unassigned";
    const sb = b.testCase?.suite?.title || "~Unassigned";
    if (sa !== sb) return sa.localeCompare(sb);
    return (a.testCase?.sequenceNumber || 0) - (b.testCase?.sequenceNumber || 0);
  });
  // Per-suite mini summary (executed / total + passed).
  const suiteStats: Record<string, { total: number; passed: number }> = {};
  for (const r of sortedResults) {
    const s = r.testCase?.suite?.title || "Unassigned";
    suiteStats[s] = suiteStats[s] || { total: 0, passed: 0 };
    suiteStats[s].total++;
    if (r.status === "PASSED") suiteStats[s].passed++;
  }

  return (
    <div
      className="pdf-report-container"
      style={{
        backgroundColor: "#ffffff",
        color: "#1e293b",
        width: "100%",
        minHeight: "100%",
        fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Premium Dark Header */}
      <div
        style={{
          backgroundColor: "#0f172a",
          color: "#ffffff",
          padding: "40px",
          borderBottom: "4px solid #3b82f6",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "32px",
                fontWeight: "800",
                margin: "0 0 8px 0",
                letterSpacing: "-0.5px",
              }}
            >
              TEST RUN REPORT
            </h1>
            <h2
              style={{
                fontSize: "20px",
                fontWeight: "400",
                color: "#94a3b8",
                margin: 0,
              }}
            >
              {run.title}
            </h2>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "14px",
                color: "#94a3b8",
                marginBottom: "4px",
              }}
            >
              PROJECT
            </div>
            <div style={{ fontSize: "18px", fontWeight: "600" }}>
              {projectCode}
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: "28px",
            display: "flex",
            flexWrap: "wrap",
            gap: "28px",
            fontSize: "13px",
            color: "#cbd5e1",
          }}
        >
          {[
            ["Status", (run.status || "—").replace("_", " ")],
            ["Started by", userLabel(run.author)],
            [
              "Started at",
              run.createdAt ? formatThaiTime(new Date(run.createdAt)) : "—",
            ],
            ["Environment", run.environment?.title || "Not specified"],
            ...(run.milestone?.title
              ? [["Milestone", run.milestone.title]]
              : []),
          ].map(([label, value]) => (
            <div key={label as string}>
              <div
                style={{
                  fontSize: "10px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  color: "#64748b",
                  marginBottom: "3px",
                }}
              >
                {label}
              </div>
              <div style={{ color: "#e2e8f0", fontWeight: 600 }}>{value}</div>
            </div>
          ))}
          <div>
            <div
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "1px",
                color: "#64748b",
                marginBottom: "3px",
              }}
            >
              Generated
            </div>
            <div style={{ color: "#e2e8f0", fontWeight: 600 }}>
              {formatThaiTime(new Date())}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "40px" }}>
        {/* Summary Dashboard */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "24px",
            marginBottom: "40px",
            pageBreakInside: "avoid",
          }}
        >
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#0f172a",
              margin: "0 0 20px 0",
            }}
          >
            Executive Summary
          </h3>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "24px",
                flex: 1,
              }}
            >
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #64748b",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#64748b",
                    marginBottom: "4px",
                  }}
                >
                  Total Cases
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#0f172a",
                  }}
                >
                  {total}
                </span>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #16a34a",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#16a34a",
                    marginBottom: "4px",
                    fontWeight: "700",
                  }}
                >
                  Passed
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#15803d",
                  }}
                >
                  {passed}
                </span>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #dc2626",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#ef4444",
                    marginBottom: "4px",
                    fontWeight: "700",
                  }}
                >
                  Failed
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#b91c1c",
                  }}
                >
                  {failed}
                </span>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #3b82f6",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#64748b",
                    marginBottom: "4px",
                  }}
                >
                  Defects
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#0f172a",
                  }}
                >
                  {defectCount}
                </span>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #f59e0b",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#f59e0b",
                    marginBottom: "4px",
                    fontWeight: "700",
                  }}
                >
                  Blocked/Skipped
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#b45309",
                  }}
                >
                  {blocked + skipped}
                </span>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  borderTop: "4px solid #94a3b8",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    color: "#94a3b8",
                    marginBottom: "4px",
                    fontWeight: "700",
                  }}
                >
                  Untested
                </span>
                <span
                  style={{
                    fontSize: "24px",
                    fontWeight: "800",
                    color: "#475569",
                  }}
                >
                  {untested}
                </span>
              </div>
            </div>

            {/* Circular Progress (Static Approximation) */}
            <div
              style={{
                width: "160px",
                textAlign: "center",
                paddingLeft: "32px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "120px",
                  height: "120px",
                  margin: "0 auto",
                  borderRadius: "50%",
                  background: `conic-gradient(#16a34a ${completionRate}%, #e2e8f0 0)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: "100px",
                    height: "100px",
                    backgroundColor: "#f8fafc",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexDirection: "column",
                  }}
                >
                  <span
                    style={{
                      fontSize: "28px",
                      fontWeight: "900",
                      color: "#0f172a",
                      lineHeight: "1",
                    }}
                  >
                    {completionRate}%
                  </span>
                </div>
              </div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#64748b",
                  marginTop: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                }}
              >
                Pass Rate
              </div>
            </div>
          </div>

          {/* Segmented status distribution bar */}
          {total > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "14px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                }}
              >
                {[
                  { n: passed, c: "#16a34a" },
                  { n: failed, c: "#dc2626" },
                  { n: blocked, c: "#d97706" },
                  { n: skipped, c: "#0891b2" },
                  { n: untested, c: "#94a3b8" },
                ].map(
                  (seg, i) =>
                    seg.n > 0 && (
                      <div
                        key={i}
                        style={{
                          width: `${(seg.n / total) * 100}%`,
                          backgroundColor: seg.c,
                        }}
                      />
                    ),
                )}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  marginTop: "10px",
                }}
              >
                {[
                  { label: "Passed", n: passed, c: "#16a34a" },
                  { label: "Failed", n: failed, c: "#dc2626" },
                  { label: "Blocked", n: blocked, c: "#d97706" },
                  { label: "Skipped", n: skipped, c: "#0891b2" },
                  { label: "Untested", n: untested, c: "#94a3b8" },
                ].map((seg) => (
                  <div
                    key={seg.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "12px",
                      color: "#475569",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "3px",
                        backgroundColor: seg.c,
                      }}
                    />
                    {seg.label}{" "}
                    <strong style={{ color: "#0f172a" }}>{seg.n}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Results Table */}
        <div>
          <h3
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#0f172a",
              margin: "0 0 16px 0",
            }}
          >
            Detailed Test Execution
          </h3>
          <table
            style={{
              width: "100%",
              textAlign: "left",
              borderCollapse: "collapse",
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#1e293b", color: "#ffffff" }}>
                <th
                  style={{
                    padding: "14px",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: "600",
                    width: "20%",
                    border: "1px solid #334155",
                  }}
                >
                  Test Case
                </th>
                <th
                  style={{
                    padding: "14px",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: "600",
                    width: "25%",
                    border: "1px solid #334155",
                  }}
                >
                  Test Step
                </th>
                <th
                  style={{
                    padding: "14px",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: "600",
                    width: "25%",
                    border: "1px solid #334155",
                  }}
                >
                  Expected Result
                </th>
                <th
                  style={{
                    padding: "14px",
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                    fontWeight: "600",
                    width: "30%",
                    border: "1px solid #334155",
                  }}
                >
                  Actual Result & Evidence
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((res: any, index: number) => {
                if (hidePassed && res.status === "PASSED") return null;
                const tc = res.testCase;
                const code = `${projectCode}-${tc.sequenceNumber || tc.id.substring(0, 4)}`;
                const suiteName = tc?.suite?.title || "Unassigned";
                // Header shows on the first VISIBLE case of each suite.
                const visible = (r: any) =>
                  !hidePassed || r.status !== "PASSED";
                const prevVisibleSuite = sortedResults
                  .slice(0, index)
                  .filter(visible)
                  .map((r: any) => r.testCase?.suite?.title || "Unassigned")
                  .pop();
                const showSuiteHeader = suiteName !== prevVisibleSuite;
                const ss = suiteStats[suiteName];
                const rowBgColor = index % 2 === 0 ? "#ffffff" : "#f8fafc";

                // Status Badge styling
                let badgeBg = "#f1f5f9",
                  badgeColor = "#64748b";
                if (res.status === "PASSED") {
                  badgeBg = "#dcfce7";
                  badgeColor = "#16a34a";
                }
                if (res.status === "FAILED") {
                  badgeBg = "#fee2e2";
                  badgeColor = "#dc2626";
                }
                if (res.status === "BLOCKED") {
                  badgeBg = "#fef3c7";
                  badgeColor = "#d97706";
                }

                // Global attachments and comments
                const globalElements: React.ReactNode[] = [];
                if (res.errorMessage) {
                  globalElements.push(
                    <div
                      key="global-err"
                      style={{
                        fontSize: "13px",
                        color: "#dc2626",
                        backgroundColor: "#fee2e2",
                        padding: "8px",
                        borderRadius: "4px",
                        borderTop: "3px solid #ef4444",
                        marginBottom: "8px",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          fontSize: "11px",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Error Message:
                      </strong>
                      {res.errorMessage}
                    </div>,
                  );
                }
                if (res.comment) {
                  globalElements.push(
                    <div
                      key="global-comment"
                      style={{
                        fontSize: "13px",
                        color: "#334155",
                        backgroundColor: "#f1f5f9",
                        padding: "8px",
                        borderRadius: "4px",
                        borderTop: "3px solid #94a3b8",
                        marginBottom: "8px",
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          fontSize: "11px",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Comment:
                      </strong>
                      {res.comment}
                    </div>,
                  );
                }
                if (res.linkedIssues && res.linkedIssues.length > 0) {
                  globalElements.push(
                    <div key="global-defects" style={{ marginTop: "8px" }}>
                      <strong
                        style={{
                          display: "block",
                          fontSize: "11px",
                          textTransform: "uppercase",
                          color: "#b91c1c",
                          marginBottom: "4px",
                        }}
                      >
                        Linked Defects:
                      </strong>
                      {res.linkedIssues.map((iss: any) => (
                        <a
                          key={iss.id}
                          href={iss.url}
                          style={{
                            display: "inline-block",
                            fontSize: "12px",
                            color: "#dc2626",
                            backgroundColor: "#fee2e2",
                            border: "1px solid #fecaca",
                            borderRadius: "4px",
                            padding: "2px 8px",
                            marginRight: "6px",
                            marginBottom: "4px",
                            textDecoration: "none",
                          }}
                        >
                          {iss.key}
                          {iss.severity ? ` · ${iss.severity}` : ""} — {iss.summary}
                        </a>
                      ))}
                    </div>,
                  );
                }
                if (res.attachments && Array.isArray(res.attachments)) {
                  res.attachments.forEach((att: any, attIdx: number) => {
                    globalElements.push(
                      <div
                        key={`global-att-${attIdx}`}
                        style={{ marginTop: "8px" }}
                      >
                        {att.url.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                          <>
                            <img
                              src={att.url}
                              alt="Evidence"
                              style={{
                                maxWidth: "100%",
                                maxHeight: "200px",
                                border: "1px solid #e2e8f0",
                                borderRadius: "4px",
                                display: "block",
                              }}
                              crossOrigin="anonymous"
                            />
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#94a3b8",
                                marginTop: "3px",
                                fontStyle: "italic",
                              }}
                            >
                              {att.name ||
                                att.originalName ||
                                decodeURIComponent(
                                  att.url.split("/").pop()?.split("?")[0] || "",
                                ) ||
                                "Evidence"}
                            </div>
                          </>
                        ) : (
                          <a
                            href={att.url}
                            style={{
                              fontSize: "12px",
                              color: "#3b82f6",
                              textDecoration: "none",
                              borderBottom: "1px solid #3b82f6",
                            }}
                          >
                            📄 Attachment: {att.name || "File"}
                          </a>
                        )}
                      </div>,
                    );
                  });
                }

                return (
                  <React.Fragment key={res.id}>
                  {showSuiteHeader && (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          backgroundColor: "#eef2ff",
                          borderTop: "2px solid #c7d2fe",
                          borderBottom: "1px solid #c7d2fe",
                          padding: "10px 16px",
                          fontSize: "13px",
                          fontWeight: 800,
                          color: "#3730a3",
                        }}
                      >
                        {suiteName}
                        {ss && (
                          <span
                            style={{
                              marginLeft: "10px",
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#6366f1",
                            }}
                          >
                            {ss.passed}/{ss.total} passed
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                  <tr
                    style={{
                      backgroundColor: rowBgColor,
                      pageBreakInside: "avoid",
                    }}
                  >
                    {/* Column 1: Test Case */}
                    <td
                      style={{
                        border: "1px solid #e2e8f0",
                        padding: "16px",
                        verticalAlign: "top",
                        width: "20%",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: "#64748b",
                          marginBottom: "4px",
                        }}
                      >
                        {code}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "600",
                          color: "#0f172a",
                          marginBottom: "12px",
                          lineHeight: "1.4",
                        }}
                      >
                        {tc.title}
                      </div>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          backgroundColor: badgeBg,
                          color: badgeColor,
                        }}
                      >
                        {res.status}
                      </span>
                      <div
                        style={{
                          marginTop: "12px",
                          fontSize: "11px",
                          color: "#64748b",
                          lineHeight: "1.7",
                        }}
                      >
                        <div>
                          <strong style={{ color: "#475569" }}>By:</strong>{" "}
                          {userLabel(res.assignee)}
                        </div>
                        {res.status !== "IN_PROGRESS" && res.updatedAt && (
                          <div>
                            <strong style={{ color: "#475569" }}>On:</strong>{" "}
                            {formatThaiTime(new Date(res.updatedAt))}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Columns 2, 3, 4: Inner table for Steps */}
                    <td
                      colSpan={3}
                      style={{
                        border: "1px solid #e2e8f0",
                        padding: "0",
                        verticalAlign: "top",
                        width: "80%",
                      }}
                    >
                      {tc.steps && tc.steps.length > 0 ? (
                        <table
                          style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            height: "100%",
                          }}
                        >
                          <tbody>
                            {tc.steps.map((step: any, idx: number) => {
                              const stepNum = idx + 1;
                              const stepRes =
                                (res.stepResults && res.stepResults[step.id]) ||
                                {};
                              const isLastStep = idx === tc.steps.length - 1;
                              const stepBorderBottom =
                                isLastStep && globalElements.length === 0
                                  ? "none"
                                  : "1px solid #e2e8f0";

                              return (
                                <tr key={idx}>
                                  {/* Step Action */}
                                  <td
                                    style={{
                                      borderBottom: stepBorderBottom,
                                      borderRight: "1px solid #e2e8f0",
                                      padding: "16px",
                                      verticalAlign: "top",
                                      width: "31.25%",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        color: "#3b82f6",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.5px",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Step {stepNum}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        color: "#334155",
                                      }}
                                    >
                                      {step.action}
                                    </div>
                                  </td>

                                  {/* Step Expected */}
                                  <td
                                    style={{
                                      borderBottom: stepBorderBottom,
                                      borderRight: "1px solid #e2e8f0",
                                      padding: "16px",
                                      verticalAlign: "top",
                                      width: "31.25%",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        color: "#475569",
                                      }}
                                    >
                                      {step.expectedResult || (
                                        <span
                                          style={{
                                            fontStyle: "italic",
                                            color: "#94a3b8",
                                          }}
                                        >
                                          None
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Step Actual */}
                                  <td
                                    style={{
                                      borderBottom: stepBorderBottom,
                                      padding: "16px",
                                      verticalAlign: "top",
                                      width: "37.5%",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        fontWeight: "700",
                                        color: "#64748b",
                                        textTransform: "uppercase",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Status: {stepRes.status || "N/A"}
                                    </div>
                                    {stepRes.actualResult && (
                                      <div
                                        style={{
                                          fontSize: "13px",
                                          color: "#334155",
                                          marginBottom: "8px",
                                          whiteSpace: "pre-wrap",
                                        }}
                                      >
                                        {stepRes.actualResult}
                                      </div>
                                    )}
                                    {stepRes.attachments &&
                                      stepRes.attachments.map(
                                        (att: any, attIdx: number) => (
                                          <div
                                            key={`att-${idx}-${attIdx}`}
                                            style={{ marginTop: "8px" }}
                                          >
                                            {att.url.match(
                                              /\.(jpeg|jpg|gif|png)$/i,
                                            ) ? (
                                              <>
                                                <img
                                                  src={att.url}
                                                  alt="Evidence"
                                                  style={{
                                                    maxWidth: "100%",
                                                    maxHeight: "200px",
                                                    border: "1px solid #e2e8f0",
                                                    borderRadius: "4px",
                                                    display: "block",
                                                  }}
                                                  crossOrigin="anonymous"
                                                />
                                                <div
                                                  style={{
                                                    fontSize: "10px",
                                                    color: "#94a3b8",
                                                    marginTop: "3px",
                                                    fontStyle: "italic",
                                                  }}
                                                >
                                                  {att.name ||
                                                    att.originalName ||
                                                    decodeURIComponent(
                                                      att.url
                                                        .split("/")
                                                        .pop()
                                                        ?.split("?")[0] || "",
                                                    ) ||
                                                    "Evidence"}
                                                </div>
                                              </>
                                            ) : (
                                              <a
                                                href={att.url}
                                                style={{
                                                  fontSize: "12px",
                                                  color: "#3b82f6",
                                                  textDecoration: "none",
                                                  borderBottom:
                                                    "1px solid #3b82f6",
                                                }}
                                              >
                                                📄 Attachment:{" "}
                                                {att.name || "File"}
                                              </a>
                                            )}
                                          </div>
                                        ),
                                      )}
                                    {!stepRes.actualResult &&
                                      (!stepRes.attachments ||
                                        stepRes.attachments.length === 0) && (
                                        <span
                                          style={{
                                            fontStyle: "italic",
                                            fontSize: "13px",
                                            color: "#cbd5e1",
                                          }}
                                        >
                                          No actual result
                                        </span>
                                      )}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Render Global Elements if any */}
                            {globalElements.length > 0 && (
                              <tr>
                                <td
                                  colSpan={3}
                                  style={{
                                    padding: "16px",
                                    verticalAlign: "top",
                                    backgroundColor: "rgba(241, 245, 249, 0.5)",
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: "11px",
                                      fontWeight: "700",
                                      color: "#64748b",
                                      textTransform: "uppercase",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Global Notes & Evidence
                                  </div>
                                  {globalElements}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      ) : (
                        <div style={{ padding: "16px" }}>
                          <span
                            style={{
                              fontStyle: "italic",
                              fontSize: "13px",
                              color: "#94a3b8",
                              display: "block",
                              marginBottom:
                                globalElements.length > 0 ? "16px" : "0",
                            }}
                          >
                            No test steps defined
                          </span>
                          {globalElements.length > 0 && globalElements}
                        </div>
                      )}
                    </td>
                  </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: "1px solid #e2e8f0",
            textAlign: "center",
            fontSize: "12px",
            color: "#94a3b8",
          }}
        >
          Confidential - Generated by QMaster Test Management System
        </div>
      </div>
    </div>
  );
}
