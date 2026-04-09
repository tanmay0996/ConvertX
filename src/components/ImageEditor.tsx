"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Upload, Download, RotateCcw, Crop as CropIcon, ZoomIn, ZoomOut,
  Sun, Contrast, Droplets, Palette, FlipHorizontal, FlipVertical,
  RotateCw, ImageIcon, X, Sliders, RefreshCcw,
} from "lucide-react";

interface Adjustments {
  brightness: number; // 0-200 (100 = normal)
  contrast: number;   // 0-200
  saturation: number; // 0-200
  hue: number;        // 0-360
  blur: number;       // 0-20
  opacity: number;    // 10-100
}

const DEFAULT_ADJ: Adjustments = {
  brightness: 100, contrast: 100, saturation: 100,
  hue: 0, blur: 0, opacity: 100,
};

type ActiveTool = "resize" | "crop" | "adjust" | null;

function centerAspectCrop(w: number, h: number, aspect: number) {
  return centerCrop(makeAspectCrop({ unit: "%", width: 70 }, aspect, w, h), w, h);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Draw image onto a canvas with all effects applied, returns the canvas */
function renderToCanvas(
  img: HTMLImageElement,
  outW: number,
  outH: number,
  adj: Adjustments,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Background (transparent checkerboard handled by container; canvas is transparent)
  ctx.clearRect(0, 0, outW, outH);

  // Apply CSS filters via canvas filter API
  const filter = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
    `hue-rotate(${adj.hue}deg)`,
    `blur(${adj.blur}px)`,
    `opacity(${adj.opacity}%)`,
  ].join(" ");
  ctx.filter = filter;

  // Transform: rotate + flip around center
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -outW / 2, -outH / 2, outW, outH);
  ctx.restore();

  return canvas;
}

export default function ImageEditor() {
  const [src, setSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState("image");
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [adj, setAdj] = useState<Adjustments>(DEFAULT_ADJ);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [resizeW, setResizeW] = useState(800);
  const [resizeH, setResizeH] = useState(600);
  const [keepAspect, setKeepAspect] = useState(true);
  const [originalSize, setOriginalSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isDragging, setIsDragging] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const imgRef = useRef<HTMLImageElement>(null);     // hidden source <img>
  const cropImgRef = useRef<HTMLImageElement>(null); // img inside ReactCrop
  const canvasRef = useRef<HTMLCanvasElement>(null); // visible preview canvas
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Compute CSS filter string for the preview canvas ─────────────────────
  const cssFilter = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
    `hue-rotate(${adj.hue}deg)`,
    `blur(${adj.blur}px)`,
    `opacity(${adj.opacity}%)`,
  ].join(" ");

  // ── Re-render preview canvas whenever any setting changes ──────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas display size (fits in container, max 480px tall)
    const maxH = 480;
    const maxW = canvas.parentElement?.clientWidth ?? 600;
    const scale = Math.min(maxW / originalSize.w, maxH / originalSize.h, 1);
    const displayW = Math.round(originalSize.w * scale);
    const displayH = Math.round(originalSize.h * scale);

    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    // Draw image without ctx.filter (use CSS filter on the element instead)
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.save();
    ctx.translate(displayW / 2, displayH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -displayW / 2, -displayH / 2, displayW, displayH);
    ctx.restore();
  }, [rotation, flipH, flipV, imgLoaded, originalSize]);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setFileName(file.name.replace(/\.[^.]+$/, ""));
    setAdj(DEFAULT_ADJ);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setActiveTool(null);
    setImgLoaded(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    setOriginalSize({ w, h });
    setResizeW(w);
    setResizeH(h);
    setImgLoaded(true);
  };

  useEffect(() => {
    if (activeTool === "crop" && cropImgRef.current) {
      const { naturalWidth: w, naturalHeight: h } = cropImgRef.current;
      setCrop(centerAspectCrop(w, h, 16 / 9));
    }
  }, [activeTool]);

  // ── Download: full-res with all effects ────────────────────────────────────
  const downloadEdited = () => {
    const img = imgRef.current;
    if (!img || !imgLoaded) return;
    const canvas = renderToCanvas(img, resizeW, resizeH, adj, rotation, flipH, flipV);
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${fileName}_edited.png`), "image/png");
  };

  const downloadCropped = () => {
    const img = cropImgRef.current ?? imgRef.current;
    if (!completedCrop || !img) return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const cw = Math.round(completedCrop.width * scaleX);
    const ch = Math.round(completedCrop.height * scaleY);

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    const filter = [
      `brightness(${adj.brightness}%)`,
      `contrast(${adj.contrast}%)`,
      `saturate(${adj.saturation}%)`,
      `hue-rotate(${adj.hue}deg)`,
      `blur(${adj.blur}px)`,
      `opacity(${adj.opacity}%)`,
    ].join(" ");
    ctx.filter = filter;
    ctx.drawImage(
      img,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      cw, ch,
      0, 0, cw, ch,
    );
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${fileName}_cropped.png`), "image/png");
  };

  const handleWidthChange = (val: number) => {
    setResizeW(val);
    if (keepAspect && originalSize.w > 0)
      setResizeH(Math.round(val * (originalSize.h / originalSize.w)));
  };
  const handleHeightChange = (val: number) => {
    setResizeH(val);
    if (keepAspect && originalSize.h > 0)
      setResizeW(Math.round(val * (originalSize.w / originalSize.h)));
  };

  const resetAll = () => {
    setAdj(DEFAULT_ADJ);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
    if (originalSize.w) { setResizeW(originalSize.w); setResizeH(originalSize.h); }
  };

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!src) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-5 p-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
          ${isDragging ? "border-accent bg-accent/10 scale-[1.01] drop-zone-active"
            : "border-border/40 bg-muted/20 hover:border-accent/40 hover:bg-muted/30"}`}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <div className={`p-5 rounded-2xl transition-all ${isDragging ? "bg-accent/20 scale-110" : "bg-muted/50"}`}>
          <ImageIcon className={`h-10 w-10 ${isDragging ? "text-accent" : "text-muted-foreground"}`} />
        </div>
        <div className="text-center">
          <p className="font-semibold text-lg">{isDragging ? "Drop your image" : "Upload an image"}</p>
          <p className="text-sm text-muted-foreground mt-1">PNG, JPG, WebP, GIF — drag & drop or click</p>
        </div>
      </div>
    );
  }

  // ── Editor layout ──────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4 min-h-[520px]">

      {/* Hidden source image (never displayed — used only for canvas rendering) */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        onLoad={onImageLoad}
        className="hidden"
        crossOrigin="anonymous"
      />

      {/* ── LEFT SIDEBAR ── */}
      <div className="w-[240px] flex-shrink-0 flex flex-col gap-3">

        {/* File info */}
        <div className="px-3 py-2.5 rounded-xl bg-muted/30 border border-border/40">
          <p className="text-xs font-medium text-foreground truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{originalSize.w} × {originalSize.h} px</p>
        </div>

        {/* Tool selector */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-1">Tools</p>
          {([
            { id: "resize" as ActiveTool, icon: <ZoomIn className="h-4 w-4" />,   label: "Resize" },
            { id: "crop"   as ActiveTool, icon: <CropIcon className="h-4 w-4" />, label: "Crop" },
            { id: "adjust" as ActiveTool, icon: <Sliders className="h-4 w-4" />,  label: "Adjust" },
          ]).map((tool) => (
            <button key={tool.id}
              onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all w-full text-left
                ${activeTool === tool.id
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50 hover:text-foreground"}`}
            >
              {tool.icon}
              {tool.label}
              {activeTool === tool.id && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {/* Transform */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold px-1">Transform</p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: <RotateCcw className="h-3.5 w-3.5" />,      label: "Rotate L", action: () => setRotation(r => r - 90) },
              { icon: <RotateCw className="h-3.5 w-3.5" />,        label: "Rotate R", action: () => setRotation(r => r + 90) },
              { icon: <FlipHorizontal className="h-3.5 w-3.5" />,  label: "Flip H",   action: () => setFlipH(f => !f) },
              { icon: <FlipVertical className="h-3.5 w-3.5" />,    label: "Flip V",   action: () => setFlipV(f => !f) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.action} title={btn.label}
                className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg bg-muted/30 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all text-[10px]">
                {btn.icon}{btn.label}
              </button>
            ))}
          </div>
          {(rotation !== 0 || flipH || flipV) && (
            <p className="text-[10px] text-primary/70 text-center">
              {rotation !== 0 && `${((rotation % 360) + 360) % 360}°`}
              {flipH && " · H-flip"}
              {flipV && " · V-flip"}
            </p>
          )}
        </div>

        {/* ── RESIZE PANEL ── */}
        {activeTool === "resize" && (
          <div className="flex flex-col gap-3 p-3 rounded-xl bg-muted/20 border border-border/40">
            <p className="text-xs font-semibold text-foreground">Resize Output</p>

            {/* Output size indicator */}
            <div className="flex items-center justify-center gap-1 py-2 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-sm font-mono font-bold text-primary">{resizeW}</span>
              <span className="text-xs text-muted-foreground">×</span>
              <span className="text-sm font-mono font-bold text-primary">{resizeH}</span>
              <span className="text-xs text-muted-foreground ml-1">px</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">Width</label>
                <input type="number" value={resizeW} min={1} max={8000}
                  onChange={(e) => handleWidthChange(Number(e.target.value))}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">Height</label>
                <input type="number" value={resizeH} min={1} max={8000}
                  onChange={(e) => handleHeightChange(Number(e.target.value))}
                  className="w-full mt-0.5 px-2 py-1.5 rounded-md bg-background border border-border/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={keepAspect} onChange={(e) => setKeepAspect(e.target.checked)} className="rounded accent-purple-500" />
              <span className="text-[10px] text-muted-foreground">Lock aspect ratio</span>
            </label>

            {/* Quick scale presets */}
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">Quick scale</p>
              <div className="grid grid-cols-4 gap-1">
                {[{ l: "¼×", s: 0.25 }, { l: "½×", s: 0.5 }, { l: "¾×", s: 0.75 }, { l: "2×", s: 2 }].map((p) => (
                  <button key={p.l}
                    onClick={() => { setResizeW(Math.round(originalSize.w * p.s)); setResizeH(Math.round(originalSize.h * p.s)); }}
                    className="py-1 text-[10px] rounded bg-background border border-border/60 hover:border-primary/60 hover:text-primary transition-all">
                    {p.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Size comparison */}
            <div className="text-[10px] text-muted-foreground space-y-0.5">
              <div className="flex justify-between">
                <span>Original</span>
                <span className="font-mono">{originalSize.w}×{originalSize.h}</span>
              </div>
              <div className="flex justify-between">
                <span>Output</span>
                <span className={`font-mono ${resizeW !== originalSize.w || resizeH !== originalSize.h ? "text-primary" : ""}`}>
                  {resizeW}×{resizeH}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Scale</span>
                <span className="font-mono">
                  {originalSize.w ? `${((resizeW / originalSize.w) * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            </div>

            <button onClick={downloadEdited}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-medium hover:from-blue-500 hover:to-blue-400 transition-all">
              <Download className="h-3.5 w-3.5" />
              Export {resizeW}×{resizeH}
            </button>
          </div>
        )}

        {/* ── ADJUST PANEL ── */}
        {activeTool === "adjust" && (
          <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-muted/20 border border-border/40 overflow-y-auto max-h-[360px]">
            <p className="text-xs font-semibold text-foreground">Adjustments</p>
            {([
              { label: "Brightness", icon: <Sun className="h-3 w-3" />,       key: "brightness" as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Contrast",   icon: <Contrast className="h-3 w-3" />,  key: "contrast"   as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Saturation", icon: <Droplets className="h-3 w-3" />,  key: "saturation" as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Hue Rotate", icon: <Palette className="h-3 w-3" />,   key: "hue"        as keyof Adjustments, min: 0,  max: 360, unit: "°"  },
              { label: "Blur",       icon: <ZoomOut className="h-3 w-3" />,   key: "blur"       as keyof Adjustments, min: 0,  max: 20,  unit: "px" },
              { label: "Opacity",    icon: <Sun className="h-3 w-3" />,       key: "opacity"    as keyof Adjustments, min: 10, max: 100, unit: "%" },
            ]).map(({ label, icon, key, min, max, unit }) => {
              const val = adj[key];
              const isModified = val !== DEFAULT_ADJ[key];
              return (
                <div key={label} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-1.5 text-[11px] ${isModified ? "text-primary" : "text-muted-foreground"}`}>
                      {icon}
                      <span>{label}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isModified ? "bg-primary/15 text-primary" : "text-foreground/50"}`}>
                      {val}{unit}
                    </span>
                  </div>
                  <Slider min={min} max={max} value={val}
                    onValueChange={(v) => setAdj(a => ({ ...a, [key]: Array.isArray(v) ? (v as number[])[0] : (v as number) }))}
                    className="cursor-pointer" />
                </div>
              );
            })}
            <button onClick={() => setAdj(DEFAULT_ADJ)}
              className="w-full mt-1 py-1.5 text-[10px] rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:border-border transition-all">
              Reset to defaults
            </button>
          </div>
        )}

        {/* ── CROP PANEL ── */}
        {activeTool === "crop" && (
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
            <p className="text-xs font-semibold text-foreground mb-2">Crop</p>
            <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
              Drag the handles on the image to select your crop region.
            </p>
            {completedCrop && (
              <p className="text-[10px] font-mono text-primary mb-2 text-center">
                {Math.round(completedCrop.width)} × {Math.round(completedCrop.height)} px
              </p>
            )}
            <button onClick={downloadCropped} disabled={!completedCrop}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all
                ${completedCrop
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
                  : "bg-muted/40 text-muted-foreground cursor-not-allowed"}`}>
              <Download className="h-3.5 w-3.5" />
              {completedCrop ? "Export Cropped" : "Select an area first"}
            </button>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />
        <Separator className="opacity-30" />

        {/* Bottom actions */}
        <div className="flex flex-col gap-2">
          <button onClick={downloadEdited}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-semibold transition-all glow-purple">
            <Download className="h-4 w-4" />
            Download PNG
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={resetAll}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 text-xs transition-all">
              <RefreshCcw className="h-3.5 w-3.5" /> Reset
            </button>
            <button onClick={() => inputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 text-xs transition-all">
              <Upload className="h-3.5 w-3.5" /> Change
            </button>
          </div>
          <button onClick={() => { setSrc(null); setCrop(undefined); setActiveTool(null); setImgLoaded(false); }}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/40 border border-border/40 text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 text-xs transition-all">
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>

      {/* ── RIGHT: IMAGE CANVAS ── */}
      <div className="flex-1 rounded-2xl border border-border/30 overflow-hidden
        bg-[repeating-conic-gradient(oklch(0.14_0.01_260)_0%_25%,oklch(0.1_0.01_260)_0%_50%)]
        bg-[length:16px_16px] flex items-center justify-center min-h-[480px]">

        {activeTool === "crop" ? (
          /* Crop mode: show actual <img> with ReactCrop overlay */
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}
            style={{ maxWidth: "100%", maxHeight: "100%" }}>
            <img
              ref={cropImgRef}
              src={src}
              alt="Crop"
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (!imgLoaded) { setOriginalSize({ w, h }); setResizeW(w); setResizeH(h); setImgLoaded(true); }
                setCrop(centerAspectCrop(w, h, 16 / 9));
              }}
              className="max-w-full max-h-[480px] object-contain block"
            />
          </ReactCrop>
        ) : (
          /* Normal mode: canvas-based preview (real-time with all effects) */
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[480px] object-contain"
            style={{ imageRendering: "pixelated", filter: cssFilter }}
          />
        )}
      </div>
    </div>
  );
}
