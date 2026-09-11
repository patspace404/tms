import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import { ArrowUpRight, CircleAlert, RefreshCw } from "lucide-react";

// แดชบอร์ดแต่ละใบเป็นไฟล์สแตติกใน public/monitor/<slug>/index.html ที่สคริปต์ฝั่ง QA สร้างเป็นรอบ ๆ
// พร้อม summary.json ไว้ให้หน้านี้อ่านตัวเลขสรุปโดยไม่ต้องแกะ HTML ทั้งไฟล์
export const dynamic = "force-dynamic";

const MONITOR_DIR = path.join(process.cwd(), "public", "monitor");
const STALE_MINUTES = 45;

type Summary = {
  project?: string;
  title?: string;
  work?: string;
  generated?: string;
  queue?: number;
  shown?: number;
  ready?: number;
  retestFailed?: number;
  cases?: number;
  passed?: number;
  failed?: number;
  casesBlocked?: number;
  executed?: number;
  blocked?: number;
  unblocked?: number;
};

type Board = { slug: string; summary: Summary; ageMinutes: number | null };

async function boards(): Promise<Board[]> {
  let slugs: string[] = [];
  try {
    const entries = await fs.readdir(MONITOR_DIR, { withFileTypes: true });
    slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const found = await Promise.all(
    slugs.map(async (slug) => {
      const dir = path.join(MONITOR_DIR, slug);
      let pageStat;
      try {
        pageStat = await fs.stat(path.join(dir, "index.html"));
      } catch {
        return null; // โฟลเดอร์ที่ยังไม่มีหน้าเว็บ
      }
      let summary: Summary = {};
      let generatedAt: Date | null = pageStat.mtime;
      try {
        summary = JSON.parse(await fs.readFile(path.join(dir, "summary.json"), "utf8"));
        if (summary.generated) generatedAt = new Date(summary.generated);
      } catch {
        // ยังไม่มี summary.json — ใช้เวลาของไฟล์หน้าเว็บแทน
      }
      const ageMinutes =
        generatedAt && !Number.isNaN(generatedAt.getTime())
          ? Math.max(0, Math.round((Date.now() - generatedAt.getTime()) / 60000))
          : null;
      return { slug, summary, ageMinutes };
    }),
  );

  return (found.filter(Boolean) as Board[]).sort((a, b) =>
    (a.summary.project || a.slug).localeCompare(b.summary.project || b.slug),
  );
}

function freshness(mins: number | null) {
  if (mins === null) return "ไม่ทราบเวลาอัปเดต";
  if (mins < 1) return "อัปเดตเมื่อครู่นี้";
  if (mins < 60) return `อัปเดต ${mins} นาทีที่แล้ว`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `อัปเดต ${h} ชั่วโมงที่แล้ว` : `อัปเดต ${Math.floor(h / 24)} วันที่แล้ว`;
}

function pct(n?: number, d?: number) {
  return d && d > 0 ? `${Math.round(((n || 0) / d) * 100)}%` : "–";
}

/** Test-case health as one bar, in the same colours the dashboard uses. */
function HealthBar({ s }: { s: Summary }) {
  const total = s.cases || 0;
  if (!total) return null;
  const untested = Math.max(0, total - (s.executed || 0));
  const seg = [
    { n: s.passed || 0, cls: "bg-success", label: "ผ่าน" },
    { n: s.failed || 0, cls: "bg-danger", label: "ไม่ผ่าน" },
    { n: s.casesBlocked || 0, cls: "bg-warning", label: "ติดบล็อก" },
  ].filter((x) => x.n > 0);
  const title = [...seg, { n: untested, label: "ยังไม่ได้เทส" }]
    .filter((x) => x.n > 0)
    .map((x) => `${x.label} ${x.n}`)
    .join(" · ");
  return (
    <div className="mt-[14px]" title={title}>
      <div className="flex h-[6px] overflow-hidden rounded-full bg-surface-2">
        {seg.map((x, i) => (
          <i key={i} className={x.cls} style={{ width: `${(x.n / total) * 100}%` }} />
        ))}
      </div>
      <p className="mt-[7px] text-[11.5px] text-text-muted">
        เทสเคส {total} ใบ · execute {pct(s.executed, total)} · ผ่าน {pct(s.passed, s.executed)}
        {s.failed ? ` · ไม่ผ่าน ${s.failed}` : ""}
        {s.casesBlocked ? ` · ติดบล็อก ${s.casesBlocked}` : ""}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: string;
  big?: boolean;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span
        className={`font-medium tabular-nums leading-none ${big ? "text-[26px]" : "text-[18px]"} ${
          tone || "text-text-main"
        }`}
      >
        {value}
      </span>
      <span className="text-[11.5px] text-text-muted">{label}</span>
    </div>
  );
}

export default async function MonitorIndex() {
  const list = await boards();

  return (
    <div className="mx-auto w-full max-w-[1180px] p-[22px]">
      <header className="mb-[18px] flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[21px] font-semibold tracking-[-0.015em]">Monitor</h1>
          <p className="mt-0.5 text-[13px] text-text-muted">
            คิวงานที่รอ QA verify และสุขภาพเทสเคสของแต่ละโปรเจกต์ อัปเดตอัตโนมัติทุก 15 นาที
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-text-faint">
          <RefreshCw className="h-3.5 w-3.5" />
          กดดึงข้อมูลใหม่ได้ในแดชบอร์ดแต่ละใบ
        </span>
      </header>

      {list.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border p-8 text-center text-[13px] text-text-muted">
          ยังไม่มีแดชบอร์ดในระบบ
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {list.map(({ slug, summary, ageMinutes }) => {
            const stale = ageMinutes !== null && ageMinutes > STALE_MINUTES;
            const work = summary.work === "Task" ? "Task" : "Story";
            return (
              <Link
                key={slug}
                href={`/monitor/${slug}`}
                className="group rounded-[12px] border border-border bg-surface p-[18px] shadow-sm transition hover:bg-surface-hover"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11.5px] text-text-faint">
                    {summary.project || slug.toUpperCase()}
                  </span>
                  <h2 className="truncate text-[15px] font-semibold">{summary.title || slug}</h2>
                  <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-text-faint transition group-hover:text-text-main" />
                </div>

                <div className="mt-[16px] flex flex-wrap items-end gap-x-7 gap-y-3">
                  <Stat label={`บั๊ก + ${work} ที่ต้อง verify`} value={String(summary.shown ?? summary.queue ?? "–")} big />
                  <Stat label="พร้อมหยิบเทส" value={String(summary.ready ?? "–")} tone="text-success" big />
                  {summary.unblocked ? (
                    <Stat
                      label="ปลดล็อกแล้ว รอ retest"
                      value={String(summary.unblocked)}
                      tone="text-warning"
                    />
                  ) : null}
                  {summary.retestFailed ? (
                    <Stat label="retest ไม่ผ่าน" value={String(summary.retestFailed)} tone="text-danger" />
                  ) : null}
                </div>

                <HealthBar s={summary} />

                <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-[11.5px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warning" : "bg-success"}`}
                    aria-hidden
                  />
                  <span className={stale ? "text-warning" : "text-text-muted"}>{freshness(ageMinutes)}</span>
                  {summary.queue ? (
                    <span className="text-text-faint">· คอลัมน์ READY TO VERIFY {summary.queue} ใบ</span>
                  ) : null}
                  {stale && (
                    <span className="ml-auto inline-flex items-center gap-1 text-warning">
                      <CircleAlert className="h-3.5 w-3.5" />
                      ข้อมูลค้าง
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-[18px] text-[12px] text-text-faint">
        ตัวเลขบนการ์ดมาจากไฟล์สรุปที่สร้างพร้อมแดชบอร์ด ถ้าขึ้น “ข้อมูลค้าง” แปลว่าตัวสร้างหยุดส่งข้อมูล —
        เปิดแดชบอร์ดแล้วกดดึงข้อมูลใหม่ได้เลย
      </p>
    </div>
  );
}
