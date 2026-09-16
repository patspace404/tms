// (Phase 4) หน้า Form สร้าง Test Case
"use client";

export const dynamic = "force-dynamic";

import React, { useState, Suspense } from "react";
import { toast } from "sonner";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  FileIcon,
  Link2,
  Plus,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FileUpload } from "@/components/ui/FileUpload";
import { Button } from "@/components/ui/Button";

// --- Types matching our Prisma Schema ---

type Severity =
  | "BLOCKER"
  | "CRITICAL"
  | "MAJOR"
  | "NORMAL"
  | "MINOR"
  | "TRIVIAL";
type Priority = "HIGH" | "MEDIUM" | "LOW";
type AutomationStatus = "MANUAL" | "TO_BE_AUTOMATED" | "AUTOMATED";

interface TestStepInput {
  action: string;
  expectedResult: string;
}

interface TestCaseFormValues {
  title: string;
  suiteId: string;
  description: string;
  preconditions: string;
  postconditions: string;
  severity: Severity;
  priority: Priority;
  automationStatus: AutomationStatus;
  tagsInput: string;
  steps: TestStepInput[];
  customFields: Record<string, any>;
}

function CreateCaseContent({
  params,
}: {
  params: any; /* use React.use() if async in Next15, but it's client comp here */
}) {
  // We need to extract projectCode. In a true client comp, we might get it from useParams() or pass it as prop.
  // For now, we will extract it from the URL since params might be a Promise in Next.js 15.
  const [projectCode, setProjectCode] = useState("");

  React.useEffect(() => {
    // hack to get code from url
    const pathParts = window.location.pathname.split("/");
    const codeIdx = pathParts.indexOf("projects") + 1;
    if (pathParts[codeIdx]) {
      const code = pathParts[codeIdx];
      setProjectCode(code);
      fetch(`/api/projects/${code}/suites`)
        .then((res) => res.json())
        .then(setSuites);
    }
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSuiteId = searchParams.get("suite");

  const [attachments, setAttachments] = useState<any[]>([]);
  const [suites, setSuites] = useState<any[]>([]);
  const [customFieldsDef, setCustomFieldsDef] = useState<any[]>([]);

  React.useEffect(() => {
    if (!projectCode) return;

    fetch("/api/workspace/fields")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const relevantFields = data.filter((f: any) => {
            if (f.isSystem) return false;
            if (f.projects === "All projects") return true; // It's global
            if (f.projectCodes && f.projectCodes.includes(projectCode))
              return true;
            return false;
          });
          setCustomFieldsDef(relevantFields);
        }
      })
      .catch(console.error);
  }, [projectCode]);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<TestCaseFormValues>({
    defaultValues: {
      title: "",
      suiteId: initialSuiteId || "",
      severity: "NORMAL",
      priority: "MEDIUM",
      automationStatus: "MANUAL",
      tagsInput: "",
      steps: [{ action: "", expectedResult: "" }], // Start with one empty step
      customFields: {},
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "steps",
  });

  const [isSharedStepsModalOpen, setIsSharedStepsModalOpen] = useState(false);
  const [sharedStepsList, setSharedStepsList] = useState<any[]>([]);

  const openSharedStepsModal = async () => {
    try {
      const res = await fetch(`/api/projects/${projectCode}/shared-steps`);
      if (res.ok) {
        setSharedStepsList(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
    setIsSharedStepsModalOpen(true);
  };

  const onSubmit = async (data: TestCaseFormValues) => {
    const tags = data.tagsInput
      ? data.tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];

    const payload = {
      ...data,
      steps: data.steps.map((step, idx) => ({ ...step, position: idx })),
      tags,
      attachmentIds: attachments.map((a) => a.id),
    };

    console.log("Submitting Test Case:", payload);
    try {
      const res = await fetch(`/api/projects/${projectCode}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Test case created");
        router.push(`/projects/${projectCode}/repository`);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Failed to save test case");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error saving test case");
    }
  };

  return (
    <div className="w-full bg-background h-full overflow-hidden flex flex-col antialiased text-[14px]">
      {/* Header */}
      <div className="flex items-center gap-[12px] px-[20px] py-[14px] bg-surface border-b border-border shrink-0">
        <button type="button" onClick={() => router.back()} className="text-[13px] text-text-faint hover:text-text-main transition-colors">Repository</button>
        <ChevronRight size={16} className="text-text-faint" />
        <span className="text-[14px] font-semibold">New test case</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 grid gap-0 overflow-hidden" style={{ gridTemplateColumns: '1fr 320px' }}>
          
          {/* Main Form Area */}
          <div className="p-[26px] overflow-y-auto">
            <div className="max-w-[620px] flex flex-col gap-[22px]">
              
              {/* Title */}
              <div>
                <label className="block text-[13px] text-text-muted mb-[7px]">Title</label>
                <input
                  {...register("title", { required: "Title is required" })}
                  placeholder="e.g., Apply promo code at checkout"
                  className={cn(
                    "w-full h-[42px] px-[14px] rounded-[11px] bg-surface text-[14px] outline-none transition-colors",
                    "focus:ring-2 focus:ring-primary/20",
                    errors.title ? "border-danger shadow-[inset_0_0_0_1px_var(--danger)]" : "shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                  )}
                />
                {errors.title && <p className="mt-[4px] text-[12px] text-danger">{errors.title.message}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-[13px] text-text-muted mb-[7px]">Description</label>
                <textarea
                  {...register("description")}
                  placeholder="Verify the best single discount is applied..."
                  className="w-full min-h-[74px] p-[11px_14px] rounded-[11px] bg-surface text-[13.5px] text-text-main leading-[1.55] outline-none shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--primary)] focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
                />
              </div>

              {/* Preconditions */}
              <div>
                <label className="block text-[13px] text-text-muted mb-[7px]">Preconditions</label>
                <textarea
                  {...register("preconditions")}
                  placeholder="Cart has 2 items ($96.00)..."
                  className="w-full min-h-[48px] p-[11px_14px] rounded-[11px] bg-surface text-[13.5px] text-text-main leading-[1.55] outline-none shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--primary)] focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
                />
              </div>

              {/* Postconditions */}
              <div>
                <label className="block text-[13px] text-text-muted mb-[7px]">Postconditions</label>
                <textarea
                  {...register("postconditions")}
                  placeholder="Cart is emptied and the order appears in history..."
                  className="w-full min-h-[48px] p-[11px_14px] rounded-[11px] bg-surface text-[13.5px] text-text-main leading-[1.55] outline-none shadow-[inset_0_0_0_1px_var(--border)] focus:shadow-[inset_0_0_0_1px_var(--primary)] focus:ring-2 focus:ring-primary/20 transition-colors resize-y"
                />
              </div>

              {/* Steps */}
              <div>
                <div className="flex items-center justify-between mb-[10px]">
                  <label className="text-[13px] text-text-muted font-semibold">Steps</label>
                  <button type="button" onClick={openSharedStepsModal} className="flex items-center gap-[5px] text-[12px] font-semibold text-[var(--primary-text)] hover:text-primary transition-colors">
                    <Link2 size={16} />
                    Insert shared steps
                  </button>
                </div>
                <div className="border border-border rounded-[12px] overflow-hidden">
                  <div className="grid gap-[10px] p-[8px_12px] bg-surface-hover text-[10.5px] font-semibold tracking-[0.05em] uppercase text-text-faint" style={{ gridTemplateColumns: '34px 1fr 1fr 32px' }}>
                    <div>#</div><div>Action</div><div>Expected result</div><div></div>
                  </div>
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid gap-[10px] p-[10px_12px] items-start border-t border-border bg-surface group" style={{ gridTemplateColumns: '34px 1fr 1fr 32px' }}>
                      <div className="w-[22px] h-[22px] rounded-[6px] bg-surface-hover flex items-center justify-center text-[11px] font-bold text-text-muted mt-[4px]">{index + 1}</div>
                      <div>
                        <textarea
                          {...register(`steps.${index}.action` as const, { required: true })}
                          rows={2}
                          placeholder="Action..."
                          className="w-full text-[12.5px] bg-transparent border-none outline-none resize-none placeholder-text-faint"
                        />
                      </div>
                      <div>
                        <textarea
                          {...register(`steps.${index}.expectedResult` as const)}
                          rows={2}
                          placeholder="Expected..."
                          className="w-full text-[12.5px] text-text-muted bg-transparent border-none outline-none resize-none placeholder-text-faint"
                        />
                      </div>
                      <div className="flex justify-center mt-[4px]">
                        <button type="button" onClick={() => remove(index)} className="text-text-faint hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => append({ action: "", expectedResult: "" })} className="w-full flex items-center gap-[7px] p-[10px_12px] border-t border-border bg-surface text-[var(--primary-text)] text-[12.5px] font-semibold hover:bg-surface-hover transition-colors">
                    <Plus size={17} />
                    Add step
                  </button>
                </div>
              </div>

              {/* Attachments */}
              <div>
                <label className="block text-[13px] text-text-muted mb-[9px] font-semibold">Attachments</label>
                <div className="relative">
                  <FileUpload
                    projectId={projectCode}
                    onUploadComplete={(attachment) => setAttachments((prev) => [...prev, attachment])}
                  />
                </div>
                {attachments.length > 0 && (
                  <div className="mt-[10px] space-y-[6px]">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-[8px_12px] bg-surface border border-border rounded-[8px]">
                        <div className="flex items-center gap-[8px]">
                          <FileIcon size={14} className="text-primary" />
                          <span className="text-[12.5px] text-text-main truncate max-w-[200px]">{file.originalName}</span>
                          <span className="text-[11px] text-text-faint">{(file.size / 1024).toFixed(1)} KB</span>
                        </div>
                        <button type="button" onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))} className="text-text-faint hover:text-danger">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom fields row */}
              {customFieldsDef.length > 0 && (
                <div>
                  <label className="block text-[13px] text-text-muted mb-[11px] font-semibold">Custom fields</label>
                  <div className="grid grid-cols-2 gap-[14px]">
                    {customFieldsDef.map((field) => (
                      <div key={field.id} className={field.type === "TEXT" ? "col-span-2" : ""}>
                        <label className="block text-[12px] text-text-faint mb-[6px]">{field.name}</label>
                        {field.type === "SELECT" && (
                          <div className="relative">
                            <select
                              {...register(`customFields.${field.id}`, { required: field.isRequired ? "Required" : false })}
                              className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] appearance-none outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                            >
                              <option value="">Select...</option>
                              {field.options?.map((opt: any) => <option key={opt.id} value={opt.value}>{opt.value}</option>)}
                            </select>
                            <ChevronDown size={18} className="absolute right-[10px] top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
                          </div>
                        )}
                        {field.type === "STRING" && (
                          <input
                            type="text"
                            {...register(`customFields.${field.id}`, { required: field.isRequired ? "Required" : false })}
                            className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                          />
                        )}
                        {field.type === "TEXT" && (
                          <textarea
                            {...register(`customFields.${field.id}`, { required: field.isRequired ? "Required" : false })}
                            rows={3}
                            className="w-full px-[12px] py-[8px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)] resize-y"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Meta Rail */}
          <div className="border-l border-border bg-surface p-[20px_18px] flex flex-col gap-[18px] overflow-y-auto">
            <div>
              <label className="block text-[12px] text-text-faint mb-[8px]">Priority</label>
              <div className="flex gap-[6px]">
                <label className="flex-1 flex items-center justify-center gap-[4px] h-[32px] rounded-[8px] text-[12px] font-semibold cursor-pointer has-[:checked]:bg-danger-soft has-[:checked]:text-danger has-[:checked]:shadow-[inset_0_0_0_1px_var(--danger)] text-text-muted shadow-[inset_0_0_0_1px_var(--border)] transition-all">
                  <input type="radio" value="HIGH" {...register("priority")} className="hidden" />
                  <ChevronsUp size={15} />High
                </label>
                <label className="flex-1 flex items-center justify-center gap-[4px] h-[32px] rounded-[8px] text-[12px] font-medium cursor-pointer has-[:checked]:bg-surface-hover has-[:checked]:text-text-main has-[:checked]:shadow-[inset_0_0_0_1px_var(--border-strong)] text-text-muted shadow-[inset_0_0_0_1px_var(--border)] transition-all">
                  <input type="radio" value="MEDIUM" {...register("priority")} className="hidden" />
                  Med
                </label>
                <label className="flex-1 flex items-center justify-center gap-[4px] h-[32px] rounded-[8px] text-[12px] font-medium cursor-pointer has-[:checked]:bg-info-soft has-[:checked]:text-info has-[:checked]:shadow-[inset_0_0_0_1px_var(--info)] text-text-muted shadow-[inset_0_0_0_1px_var(--border)] transition-all">
                  <input type="radio" value="LOW" {...register("priority")} className="hidden" />
                  Low
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-text-faint mb-[8px]">Suite</label>
              <div className="relative">
                <select
                  {...register("suiteId", { required: "Suite is required" })}
                  className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] appearance-none outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                >
                  <option value="" disabled>Select...</option>
                  {suites.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <ChevronDown size={18} className="absolute right-[10px] top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
              </div>
              {errors.suiteId && <p className="mt-[4px] text-[12px] text-danger">{errors.suiteId.message}</p>}
            </div>

            <div>
              <label className="block text-[12px] text-text-faint mb-[8px]">Severity</label>
              <div className="relative">
                <select
                  {...register("severity")}
                  className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] appearance-none outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                >
                  <option value="BLOCKER">Blocker</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="MAJOR">Major</option>
                  <option value="NORMAL">Normal</option>
                  <option value="MINOR">Minor</option>
                </select>
                <ChevronDown size={18} className="absolute right-[10px] top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-text-faint mb-[8px]">Automation status</label>
              <div className="relative">
                <select
                  {...register("automationStatus")}
                  className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] appearance-none outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)]"
                >
                  <option value="MANUAL">Manual</option>
                  <option value="TO_BE_AUTOMATED">To be automated</option>
                  <option value="AUTOMATED">Automated</option>
                </select>
                <ChevronDown size={18} className="absolute right-[10px] top-1/2 -translate-y-1/2 text-text-faint pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-[12px] text-text-faint mb-[8px]">Tags</label>
              <input
                {...register("tagsInput")}
                placeholder="e.g. e2e, pricing"
                className="w-full h-[38px] px-[12px] rounded-[10px] bg-surface shadow-[inset_0_0_0_1px_var(--border)] text-[13px] outline-none focus:shadow-[inset_0_0_0_1px_var(--primary)] placeholder-text-faint"
              />
            </div>
            
            <div className="mt-auto pt-[14px] border-t border-border flex items-center gap-[8px]">
               {/* Checkbox for 'create another' could go here */}
               <div className="w-[18px] h-[18px] rounded-[5px] bg-surface-hover shadow-[inset_0_0_0_1px_var(--border-strong)] flex items-center justify-center"></div>
               <span className="text-[12.5px] text-text-muted">Create another after saving</span>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-end gap-[9px] p-[13px_20px] bg-surface border-t border-border shrink-0">
          <Button type="button" size="sm" variant="ghost" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" size="sm" variant="secondary">Save &amp; new</Button>
          <Button type="submit" size="sm" variant="primary">
            <Check size={16} />Save case
          </Button>
        </div>
      </form>


      {isSharedStepsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface w-[600px] rounded-[16px] shadow-[var(--shadow-float)] overflow-hidden border border-border/80 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-border/80 flex justify-between items-center bg-background/50">
              <h3 className="text-lg font-bold text-text-main">
                Insert Shared Step
              </h3>
              <button
                type="button"
                onClick={() => setIsSharedStepsModalOpen(false)}
                className="text-text-muted hover:text-text-main"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[400px]">
              {sharedStepsList.length === 0 ? (
                <div className="text-center py-10 text-text-muted">
                  No shared steps available. Create them in project settings.
                </div>
              ) : (
                <div className="space-y-3">
                  {sharedStepsList.map((step) => (
                    <div
                      key={step.id}
                      className="p-4 border border-border/80 rounded-xl flex justify-between items-center bg-surface-hover/50 hover:border-primary/50 transition-all hover:shadow-sm"
                    >
                      <div className="mr-4 overflow-hidden">
                        <div className="font-bold text-text-main truncate">
                          {step.title}
                        </div>
                        <div className="text-sm text-text-muted mt-1 truncate">
                          {step.action}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          append({
                            action: step.action,
                            expectedResult: step.expectedResult || "",
                          });
                          setIsSharedStepsModalOpen(false);
                        }}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover transition-all duration-300 text-primary-foreground text-[13px] font-bold rounded-xl shadow-sm shrink-0 hover:-translate-y-0.5"
                      >
                        Insert
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateCasePage({ params }: { params: any }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateCaseContent params={params} />
    </Suspense>
  );
}
