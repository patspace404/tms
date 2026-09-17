"use client";

import React, { use, useState } from "react";
import useSWR from "swr";
import { PdfReportTemplate } from "@/components/runs/PdfReportTemplate";
import { Loader2, X, Radar, Globe, Download, AlertTriangle } from "lucide-react";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) {
      if (res.status === 403)
        throw new Error("This report is not public or has been disabled.");
      if (res.status === 404) throw new Error("Report not found.");
      throw new Error("An error occurred while fetching the report.");
    }
    return res.json();
  });

export default function PublicReportPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [hidePassed, setHidePassed] = useState(false);

  // Open a fullscreen viewer when an evidence screenshot is clicked.
  const handleImageClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG" && (t as HTMLImageElement).alt === "Evidence") {
      // Each screenshot is wrapped in a link so it stays openable from the
      // printed PDF. On screen the lightbox is the better answer, so stop the
      // link from taking over.
      e.preventDefault();
      setLightboxSrc((t as HTMLImageElement).src);
    }
  };

  // Poll every 3 seconds for real-time updates
  const {
    data: run,
    error,
    isLoading,
  } = useSWR(`/api/public/reports/${runId}`, fetcher, {
    refreshInterval: 3000,
    revalidateOnFocus: true,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="flex flex-col items-center">
          <Loader2 className="animate-spin text-primary mb-4" size={48} />
          <p className="text-text-muted font-medium">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="bg-surface border border-border p-8 rounded-[13px] shadow-[var(--shadow-float)] max-w-md w-full text-center animate-in zoom-in-95 duration-200">
          <div className="text-danger mb-4 flex justify-center">
            <AlertTriangle size={56} strokeWidth={1.5} />
          </div>
          <h2 className="text-xl font-bold text-text-main mb-2">
            Access Denied
          </h2>
          <p className="text-text-muted">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!run) return null;

  return (
    <div className="min-h-screen bg-background transition-colors">
      {/* public top bar */}
      <div className="qm-no-print flex items-center gap-[10px] px-[22px] py-[13px] bg-surface border-b border-border">
        <div className="w-[24px] h-[24px] rounded-[7px] bg-primary flex items-center justify-center shrink-0">
          <Radar size={16} className="text-primary-foreground" />
        </div>
        <span className="font-bold text-[14px] text-text-main">QMaster</span>
        <span className="inline-flex items-center gap-[4px] text-[11px] font-semibold px-[9px] py-[2px] rounded-full bg-surface-2 text-text-muted ml-[4px]">
          <Globe size={13} />
          Public report · read-only
        </span>
        <div className="flex-1" />
        <button
          onClick={() => window.print()}
          className="flex items-center gap-[6px] text-[12.5px] font-semibold text-text-muted hover:text-text-main transition-colors"
        >
          <Download size={17} />
          Export PDF
        </button>
      </div>

      <div className="flex flex-col items-center py-10 px-4">
        <div className="qm-no-print w-full max-w-[1000px] mb-5 flex justify-between items-center">
          <div className="flex items-center space-x-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
            </span>
            <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
              Live Report
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHidePassed((v) => !v)}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                hidePassed
                  ? "bg-danger-soft text-danger border-danger/25"
                  : "bg-surface text-text-muted border-border hover:text-text-main"
              }`}
            >
              {hidePassed ? "Showing failed only" : "Show failed only"}
            </button>
            <div className="text-[11px] font-semibold text-text-muted/60">
              Auto-updating every 3 seconds
            </div>
          </div>
        </div>

        <div
          onClick={handleImageClick}
          className="qm-print-surface w-full max-w-[1000px] bg-surface shadow-[var(--shadow-float)] rounded-[13px] overflow-hidden border border-border/80 animate-in zoom-in-95 duration-300 [&_img[alt='Evidence']]:cursor-zoom-in"
        >
          <PdfReportTemplate
            run={run}
            projectCode={run.project?.code || "UNKNOWN"}
            hidePassed={hidePassed}
          />
        </div>
      </div>

      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6 animate-in fade-in duration-150 cursor-zoom-out"
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-5 right-5 p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxSrc}
            alt="Evidence (enlarged)"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-[var(--shadow-dialog)] object-contain"
          />
        </div>
      )}
    </div>
  );
}
