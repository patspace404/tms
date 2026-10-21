import React, { useState } from "react";
import { X, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ImportCasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectCode: string;
  suites: any[];
  onSuccess: () => void;
}

export function ImportCasesModal({
  isOpen,
  onClose,
  projectCode,
  suites,
  onSuccess,
}: ImportCasesModalProps) {
  const [sourceType, setSourceType] = useState("json");
  const [parentId, setParentId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [replaceMatching, setReplaceMatching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!file) {
      setError("Please choose a file.");
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch(`/api/projects/${projectCode}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          parentId,
          replaceMatching,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import. Please check file format.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[color:var(--overlay)] flex items-center justify-center z-[100]">
      <div className="bg-surface rounded-xl shadow-xl w-[500px] max-w-[90vw] overflow-hidden flex flex-col">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-main">
            Import test cases
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-muted p-1 rounded transition-colors"
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-6 space-y-5">
          <div className="bg-primary-light border border-primary/20 text-primary text-sm p-4 rounded-lg">
            <div className="flex items-start">
              <HelpCircle size={15} className="mr-2 mt-[1px] shrink-0" />
              <span>
                The file is JSON shaped <code>{"{ suites: [...] }"}</code> — the same
                thing <strong>Export JSON</strong> produces, so a file exported from one
                project imports into another.
              </span>
            </div>
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-semibold text-text-main mb-1.5">
              Source type
            </label>
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-text-muted rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="json">JSON</option>
            </select>
            <p className="text-xs text-text-muted mt-1">
              Supported formats: JSON
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main mb-1.5">
              Parent suite
            </label>
            <select
              value={parentId || ""}
              onChange={(e) => setParentId(e.target.value || null)}
              className="w-full px-3 py-2 bg-surface border border-text-muted rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            >
              <option value="">Project root</option>
              {suites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              Select a suite into which you want to import the test cases.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-main mb-1.5">
              Upload file <span className="text-danger">*</span>
            </label>
            <div className="flex items-center">
              <label className="bg-surface-hover hover:bg-surface border border-text-muted text-text-main px-3 py-1.5 rounded text-sm cursor-pointer transition-colors">
                Choose a file
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                  }}
                />
              </label>
              {file && (
                <span className="ml-3 text-sm text-text-muted truncate max-w-[200px]">
                  {file.name}
                </span>
              )}
            </div>
          </div>

          <label className="flex items-center space-x-2 mt-2">
            <input
              type="checkbox"
              checked={replaceMatching}
              onChange={(e) => setReplaceMatching(e.target.checked)}
              className="w-4 h-4 text-primary border-text-muted rounded focus:ring-blue-500"
            />
            <span className="text-sm text-text-main">
              Replace matching test cases
            </span>
          </label>
        </div>

        <footer className="px-6 py-4 border-t border-border flex items-center justify-end space-x-3 bg-surface-hover shrink-0">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!file}
            loading={isImporting}
          >
            Import test cases
          </Button>
        </footer>
      </div>
    </div>
  );
}
