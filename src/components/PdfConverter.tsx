"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Upload,
  X,
  Download,
  FileSpreadsheet,
  FileCode,
  FileType,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
} from "lucide-react";

type OutputFormat = "docx" | "xlsx" | "csv" | "html";

interface FileItem {
  id: string;
  file: File;
  status: "pending" | "converting" | "done" | "error";
  error?: string;
}

const FORMAT_CONFIG: Record<
  OutputFormat,
  { label: string; icon: React.ReactNode; color: string; ext: string }
> = {
  docx: {
    label: "DOCX",
    icon: <FileType className="h-4 w-4" />,
    color: "from-blue-500 to-blue-600",
    ext: ".docx",
  },
  xlsx: {
    label: "XLSX",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    color: "from-emerald-500 to-emerald-600",
    ext: ".xlsx",
  },
  csv: {
    label: "CSV",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    color: "from-amber-500 to-amber-600",
    ext: ".csv",
  },
  html: {
    label: "HTML",
    icon: <FileCode className="h-4 w-4" />,
    color: "from-orange-500 to-orange-600",
    ext: ".html",
  },
};

function base64ToBlob(base64: string, mimeType: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mimeType });
}

export default function PdfConverter() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [format, setFormat] = useState<OutputFormat>("docx");
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: File[]) => {
    const pdfs = newFiles.filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );
    const items: FileItem[] = pdfs.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      file: f,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...items]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files);
      addFiles(dropped);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const convertAll = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;

    setIsConverting(true);
    setProgress(0);

    // Convert in batches of 3
    const batchSize = 3;
    let done = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);

      // Mark as converting
      setFiles((prev) =>
        prev.map((f) =>
          batch.find((b) => b.id === f.id)
            ? { ...f, status: "converting" }
            : f
        )
      );

      const formData = new FormData();
      batch.forEach((item) => formData.append("files", item.file));
      formData.append("format", format);

      try {
        const res = await fetch("/api/convert", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          setFiles((prev) =>
            prev.map((f) =>
              batch.find((b) => b.id === f.id)
                ? { ...f, status: "error", error: err.error || "Failed" }
                : f
            )
          );
        } else {
          const data = await res.json();
          const resultFiles: { name: string; data: string; mimeType: string }[] =
            data.files;

          // Download each file — must append to DOM and delay revoke
          resultFiles.forEach(({ name, data: b64, mimeType }, i) => {
            setTimeout(() => {
              const blob = base64ToBlob(b64, mimeType);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = name;
              a.style.display = "none";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              // Revoke after browser has had time to initiate the download
              setTimeout(() => URL.revokeObjectURL(url), 10000);
            }, i * 300); // stagger multiple files to avoid browser blocking
          });

          setFiles((prev) =>
            prev.map((f) =>
              batch.find((b) => b.id === f.id)
                ? { ...f, status: "done" }
                : f
            )
          );
        }
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            batch.find((b) => b.id === f.id)
              ? { ...f, status: "error", error: "Network error" }
              : f
          )
        );
      }

      done += batch.length;
      setProgress(Math.round((done / pending.length) * 100));
    }

    setIsConverting(false);
  };

  const clearAll = () => {
    setFiles([]);
    setProgress(0);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const errorCount = files.filter((f) => f.status === "error").length;

  return (
    <div className="space-y-6">
      {/* Format selector */}
      <div>
        <p className="text-sm text-muted-foreground mb-3 font-medium uppercase tracking-wider">
          Output Format
        </p>
        <div className="grid grid-cols-4 gap-3">
          {(Object.keys(FORMAT_CONFIG) as OutputFormat[]).map((fmt) => {
            const cfg = FORMAT_CONFIG[fmt];
            const active = format === fmt;
            return (
              <button
                key={fmt}
                onClick={() => setFormat(fmt)}
                className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-200 cursor-pointer
                  ${
                    active
                      ? "border-primary/60 bg-primary/10 shadow-lg"
                      : "border-border/40 bg-muted/30 hover:border-border hover:bg-muted/50"
                  }`}
              >
                {active && (
                  <div
                    className={`absolute inset-0 rounded-xl bg-gradient-to-br ${cfg.color} opacity-10`}
                  />
                )}
                <div
                  className={`p-2 rounded-lg bg-gradient-to-br ${cfg.color} text-white`}
                >
                  {cfg.icon}
                </div>
                <span
                  className={`text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {cfg.label}
                </span>
                {active && (
                  <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
          ${
            isDragging
              ? "border-primary bg-primary/10 drop-zone-active scale-[1.01]"
              : "border-border/40 bg-muted/20 hover:border-primary/40 hover:bg-muted/30"
          }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => addFiles(Array.from(e.target.files || []))}
        />
        <div
          className={`p-4 rounded-2xl transition-all duration-300 ${
            isDragging ? "bg-primary/20 scale-110" : "bg-muted/50"
          }`}
        >
          <Upload
            className={`h-8 w-8 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`}
          />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">
            {isDragging ? "Drop your PDFs here" : "Drag & drop PDFs"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            or click to browse — multiple files supported
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">
          PDF only
        </Badge>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              {files.length} file{files.length > 1 ? "s" : ""} queued
            </p>
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear all
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {files.map((item) => (
              <Card
                key={item.id}
                className="bg-muted/30 border-border/40 overflow-hidden"
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <FileText className="h-4 w-4 text-red-400" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(item.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.status === "pending" && (
                      <Badge variant="secondary" className="text-xs">
                        Pending
                      </Badge>
                    )}
                    {item.status === "converting" && (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    )}
                    {item.status === "done" && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    {item.status === "error" && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <span className="text-xs text-destructive max-w-24 truncate">
                          {item.error}
                        </span>
                      </div>
                    )}
                    {item.status === "pending" && (
                      <button
                        onClick={() => removeFile(item.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Progress */}
      {isConverting && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Converting...</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Stats row */}
      {(doneCount > 0 || errorCount > 0) && !isConverting && (
        <div className="flex gap-3">
          {doneCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">
                {doneCount} converted
              </span>
            </div>
          )}
          {errorCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{errorCount} failed</span>
            </div>
          )}
        </div>
      )}

      {/* Convert button */}
      <button
        onClick={convertAll}
        disabled={pendingCount === 0 || isConverting}
        className={`w-full flex items-center justify-center gap-3 py-4 px-6 rounded-xl font-semibold text-sm transition-all duration-200
          ${
            pendingCount === 0 || isConverting
              ? "bg-muted/40 text-muted-foreground cursor-not-allowed"
              : "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg hover:shadow-violet-500/25 active:scale-[0.98] glow-purple"
          }`}
      >
        {isConverting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Converting…
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Convert {pendingCount > 0 ? pendingCount : ""} file
            {pendingCount !== 1 ? "s" : ""} to {FORMAT_CONFIG[format].label}
            <Download className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
