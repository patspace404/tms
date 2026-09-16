// (Phase 4) หน้า Form แก้ไข Test Case
"use client";

import React, { useEffect } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  GripVertical,
  Trash2,
  Save,
  X,
  ChevronDown,
  Beaker,
  AlertCircle,
  Zap,
  Folder,
  Tag as TagIcon,
  FileIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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

// The inputs on this page all share one look; keeping it in a constant stops
// the newer fields from drifting from the ones that were already here.
const FIELD_CLASS =
  "w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border border-border/80 rounded-xl shadow-inner placeholder-text-muted/50 focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main resize-y";

function SortableStepItem({
  field,
  index,
  register,
  remove,
}: {
  field: any;
  index: number;
  register: any;
  remove: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group bg-surface border border-border/80 rounded-2xl shadow-premium overflow-hidden flex z-10 relative transition-all duration-300 hover:shadow-lg"
    >
      {/* Drag Handle & Number */}
      <div
        {...attributes}
        {...listeners}
        className="w-12 bg-surface-hover/50 border-r border-border/80 flex flex-col items-center py-4 space-y-2 cursor-grab active:cursor-grabbing hover:bg-surface-hover transition-colors"
      >
        <GripVertical size={16} className="text-text-muted" />
        <span className="text-xs font-bold text-text-muted">{index + 1}</span>
      </div>

      {/* Step Inputs */}
      <div className="flex-1 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">
            Action
          </label>
          <textarea
            {...register(`steps.${index}.action` as const, { required: true })}
            rows={2}
            placeholder="Step description..."
            className="w-full px-4 py-2.5 text-[13px] font-semibold bg-transparent border border-transparent hover:border-border/80 focus:border-primary focus:bg-surface-hover/50 rounded-xl outline-none transition-all resize-none text-text-main"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-text-muted uppercase mb-1">
            Expected Result
          </label>
          <textarea
            {...register(`steps.${index}.expectedResult` as const)}
            rows={2}
            placeholder="What should happen?"
            className="w-full px-4 py-2.5 text-[13px] font-semibold bg-transparent border border-transparent hover:border-border/80 focus:border-primary focus:bg-surface-hover/50 rounded-xl outline-none transition-all resize-none text-text-main"
          />
        </div>
      </div>

      {/* Delete Action */}
      <div className="w-12 flex items-center justify-center pr-2">
        <button
          type="button"
          onClick={() => remove(index)}
          className="p-2 text-text-muted hover:text-danger hover:bg-danger-soft rounded-xl transition-all opacity-0 group-hover:opacity-100 dark:hover:bg-danger-soft"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
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

export default function TestCaseEditor() {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TestCaseFormValues>({
    defaultValues: {
      title: "",
      suiteId: "",
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = fields.findIndex((item) => item.id === active.id);
      const newIndex = fields.findIndex((item) => item.id === over.id);
      move(oldIndex, newIndex);
    }
  };

  const [isSharedStepsModalOpen, setIsSharedStepsModalOpen] =
    React.useState(false);
  const [sharedStepsList, setSharedStepsList] = React.useState<any[]>([]);

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

  const params = useParams();
  const caseId = params.caseId;
  const projectCode = params.code as string;

  const [customFieldsDef, setCustomFieldsDef] = React.useState<any[]>([]);
  const [caseCode, setCaseCode] = React.useState<string>("");
  const [suites, setSuites] = React.useState<any[]>([]);
  const [attachments, setAttachments] = React.useState<any[]>([]);

  useEffect(() => {
    if (!projectCode) return;
    fetch(`/api/projects/${projectCode}/suites`)
      .then((res) => res.json())
      .then((data) => setSuites(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [projectCode]);

  useEffect(() => {
    if (!projectCode) return;

    fetch("/api/workspace/fields")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const relevantFields = data.filter((f: any) => {
            if (f.isSystem) return false;
            if (f.projects === "All projects") return true;
            if (f.projectCodes && f.projectCodes.includes(projectCode))
              return true;
            return false;
          });
          setCustomFieldsDef(relevantFields);
        }
      })
      .catch(console.error);
  }, [projectCode]);

  useEffect(() => {
    if (!caseId) return;

    const loadData = async () => {
      try {
        const res = await fetch(`/api/cases/${caseId}`);
        if (res.ok) {
          const data = await res.json();
          setCaseCode(
            data.sequenceNumber
              ? `${projectCode}-${data.sequenceNumber}`
              : data.title || "",
          );
          setAttachments(data.attachments || []);
          reset({
            title: data.title,
            suiteId: data.suiteId || "",
            severity: data.severity || "NORMAL",
            priority: data.priority || "MEDIUM",
            automationStatus: data.automationStatus || "MANUAL",
            preconditions: data.preconditions || "",
            postconditions: data.postconditions || "",
            description: data.description || "",
            tagsInput: (data.tags || []).map((t: any) => t.name).join(", "),
            steps:
              data.steps && data.steps.length > 0
                ? data.steps
                : [{ action: "", expectedResult: "" }],
            customFields: data.customFields || {},
          });
        } else {
          handleLoadError();
        }
      } catch (err) {
        console.error("Failed to fetch test case", err);
        handleLoadError();
      }
    };

    const handleLoadError = () => {
      toast.error("Failed to load test case. It may have been deleted.");
      router.push(`/projects/${projectCode}/repository`);
    };

    loadData();
  }, [caseId, reset, projectCode, router]);

  const onSubmit = async (data: TestCaseFormValues) => {
    const { tagsInput, ...rest } = data;
    const tags = tagsInput
      ? tagsInput
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...rest,
          tags,
          attachmentIds: attachments.map((a) => a.id),
          steps: data.steps.map((s, i) => ({ ...s, position: i })),
        }),
      });
      if (res.ok) {
        toast.success("Test case updated");
        router.push(`/projects/${projectCode}/repository`);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error || "Failed to update");
      }
    } catch (e) {
      console.error(e);
      toast.error("Error saving");
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex-1 overflow-y-auto bg-surface-hover pb-20"
    >
      {/* Sticky Header */}
      <header className="sticky top-0 z-10 bg-surface border-b border-border px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 hover:bg-surface-hover rounded-xl transition-colors hover:text-primary"
          >
            <X size={20} className="text-text-muted" />
          </button>
          <h1 className="text-xl font-semibold text-text-main">
            Edit test case{caseCode ? ` · ${caseCode}` : ""}
          </h1>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit">
            <Save size={16} />
            Save Changes
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto mt-8 px-4 space-y-6">
        {/* Basic Information Card */}
        <section className="bg-surface rounded-2xl border border-border/80 shadow-premium p-6 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-text-main mb-2">
              Title
            </label>
            <input
              {...register("title", { required: "Title is required" })}
              placeholder="e.g., User can complete checkout with Credit Card"
              className={cn(
                "w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border rounded-xl shadow-inner placeholder-text-muted/50 focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main",
                errors.title ? "border-danger" : "border-border/80",
              )}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-danger">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-text-main mb-2">
              Description
            </label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Verify the best single discount is applied..."
              className={FIELD_CLASS}
            />
          </div>

          {/* Preconditions */}
          <div>
            <label className="block text-sm font-semibold text-text-main mb-2">
              Preconditions
            </label>
            <textarea
              {...register("preconditions")}
              rows={2}
              placeholder="Cart has 2 items ($96.00)..."
              className={FIELD_CLASS}
            />
          </div>

          {/* Postconditions */}
          <div>
            <label className="block text-sm font-semibold text-text-main mb-2">
              Postconditions
            </label>
            <textarea
              {...register("postconditions")}
              rows={2}
              placeholder="Cart is emptied and the order appears in history..."
              className={FIELD_CLASS}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Suite */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                <Folder size={14} className="mr-1.5 text-text-muted" /> Suite
              </label>
              {/* The suite list arrives after the case does, and until it is
                  here the select has nothing to match the case's suiteId
                  against — it would sit on whichever option came first and
                  invite a click that moves the case somewhere else. */}
              <select
                {...register("suiteId", { required: "Suite is required" })}
                disabled={suites.length === 0}
                className={cn(
                  FIELD_CLASS,
                  "appearance-none cursor-pointer",
                  suites.length === 0 && "opacity-60 cursor-wait",
                  errors.suiteId && "border-danger",
                )}
              >
                {suites.length === 0 ? (
                  <option value="">Loading suites…</option>
                ) : (
                  <option value="" disabled>
                    Select...
                  </option>
                )}
                {suites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
              {errors.suiteId && (
                <p className="mt-1 text-xs text-danger">
                  {errors.suiteId.message}
                </p>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                <TagIcon size={14} className="mr-1.5 text-text-muted" /> Tags
              </label>
              <input
                {...register("tagsInput")}
                placeholder="e.g. e2e, pricing"
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-xs text-text-muted">
                Separate with commas. Removing one here removes it from the case.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Severity */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                <AlertCircle size={14} className="mr-1.5 text-text-muted" />{" "}
                Severity
              </label>
              <select
                {...register("severity")}
                className="w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border border-border/80 rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main appearance-none cursor-pointer"
              >
                <option value="BLOCKER">Blocker</option>
                <option value="CRITICAL">Critical</option>
                <option value="MAJOR">Major</option>
                <option value="NORMAL">Normal</option>
                <option value="MINOR">Minor</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                <Zap size={14} className="mr-1.5 text-text-muted" /> Priority
              </label>
              <select
                {...register("priority")}
                className="w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border border-border/80 rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main appearance-none cursor-pointer"
              >
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Automation */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                <Beaker size={14} className="mr-1.5 text-text-muted" />{" "}
                Automation
              </label>
              <select
                {...register("automationStatus")}
                className="w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border border-border/80 rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main appearance-none cursor-pointer"
              >
                <option value="MANUAL">Manual</option>
                <option value="TO_BE_AUTOMATED">To be automated</option>
                <option value="AUTOMATED">Automated</option>
              </select>
            </div>
          </div>

          {/* Custom Fields */}
          {customFieldsDef.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h3 className="text-sm font-bold text-text-main mb-4">
                Custom Fields
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {customFieldsDef.map((field) => (
                  <div
                    key={field.id}
                    className={
                      field.type === "TEXT" ? "col-span-1 md:col-span-2" : ""
                    }
                  >
                    <label className="flex items-center text-sm font-semibold text-text-main mb-2">
                      {field.name}{" "}
                      {field.isRequired && (
                        <span className="text-danger ml-1">*</span>
                      )}
                    </label>
                    {field.type === "SELECT" && (
                      <select
                        {...register(`customFields.${field.id}`, {
                          required: field.isRequired ? "Required" : false,
                        })}
                        className={cn(
                          "w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main appearance-none cursor-pointer",
                          errors?.customFields?.[field.id]
                            ? "border-danger"
                            : "border-border/80",
                        )}
                      >
                        <option value="">Select an option</option>
                        {field.options?.map((opt: any) => (
                          <option key={opt.id} value={opt.value}>
                            {opt.value}
                          </option>
                        ))}
                      </select>
                    )}
                    {field.type === "STRING" && (
                      <input
                        type="text"
                        {...register(`customFields.${field.id}`, {
                          required: field.isRequired ? "Required" : false,
                        })}
                        className={cn(
                          "w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main",
                          errors?.customFields?.[field.id]
                            ? "border-danger"
                            : "border-border/80",
                        )}
                      />
                    )}
                    {field.type === "TEXT" && (
                      <textarea
                        {...register(`customFields.${field.id}`, {
                          required: field.isRequired ? "Required" : false,
                        })}
                        rows={3}
                        className={cn(
                          "w-full px-4 py-2.5 text-[13px] font-semibold bg-surface-hover/50 border rounded-xl shadow-inner focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all hover:border-text-muted/40 text-text-main resize-y",
                          errors?.customFields?.[field.id]
                            ? "border-danger"
                            : "border-border/80",
                        )}
                      />
                    )}
                    {field.type === "CHECKBOX" && (
                      <div className="flex items-center mt-2">
                        <input
                          type="checkbox"
                          {...register(`customFields.${field.id}`, {
                            required: field.isRequired ? "Required" : false,
                          })}
                          className="w-4 h-4 rounded border-text-muted text-primary focus:ring-blue-500"
                        />
                      </div>
                    )}
                    {errors?.customFields?.[field.id] && (
                      <p className="mt-1 text-xs text-danger">
                        {errors.customFields[field.id]?.message as string}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Attachments */}
        <section className="bg-surface rounded-2xl border border-border/80 shadow-premium p-6">
          <h2 className="text-sm font-semibold text-text-main mb-4">
            Attachments
          </h2>
          <FileUpload
            projectId={projectCode}
            onUploadComplete={(attachment) =>
              setAttachments((prev) => [...prev, attachment])
            }
          />
          {attachments.length > 0 && (
            <div className="mt-3 space-y-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between px-3 py-2 bg-surface-hover/50 border border-border/80 rounded-xl"
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileIcon size={14} className="text-primary shrink-0" />
                    <span className="text-[12.5px] text-text-main truncate">
                      {file.originalName}
                    </span>
                    <span className="text-[11px] text-text-muted shrink-0">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((prev) =>
                        prev.filter((a) => a.id !== file.id),
                      )
                    }
                    className="text-text-muted hover:text-danger shrink-0"
                    aria-label={`Remove ${file.originalName}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Test Steps Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-main">Test Steps</h2>
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              {fields.length} {fields.length === 1 ? "Step" : "Steps"}
            </span>
          </div>

          <div className="space-y-3">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={fields.map((f) => f.id)}
                strategy={verticalListSortingStrategy}
              >
                {fields.map((field, index) => (
                  <SortableStepItem
                    key={field.id}
                    field={field}
                    index={index}
                    register={register}
                    remove={remove}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div className="flex space-x-4 mt-6">
            <button
              type="button"
              onClick={() => append({ action: "", expectedResult: "" })}
              className="flex-1 py-3 border-2 border-dashed border-border rounded-xl text-text-muted hover:border-blue-400 hover:text-primary hover:bg-blue-50/50 transition-all flex items-center justify-center font-medium text-sm"
            >
              <Plus size={18} className="mr-2" />
              Add step
            </button>
            <button
              type="button"
              onClick={openSharedStepsModal}
              className="flex-1 py-3 border-2 border-dashed border-border rounded-xl text-text-muted hover:border-blue-400 hover:text-primary hover:bg-blue-50/50 transition-all flex items-center justify-center font-medium text-sm"
            >
              <Plus size={18} className="mr-2" />
              Insert Shared Step
            </button>
          </div>
        </section>
      </main>

      {isSharedStepsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface w-[600px] rounded-3xl shadow-premium overflow-hidden border border-border/80 animate-in zoom-in-95 duration-200">
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
    </form>
  );
}
