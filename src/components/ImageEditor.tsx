"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Slider } from "@/components/ui/slider";
import {
  Upload, Download, RotateCcw, Crop as CropIcon, ZoomIn,
  Sun, Contrast, Droplets, Palette, FlipHorizontal, FlipVertical,
  RotateCw, ImageIcon, X, Sliders, RefreshCcw, Link2, Unlink2,
} from "lucide-react";

interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  opacity: number;
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

function renderToCanvas(
  img: HTMLImageElement,
  outW: number,
  outH: number,
  adj: Adjustments,
  rotation: number,
  flipH: boolean,
  flipV: boolean,
): HTMLCanvasElement | null {
  if (!outW || !outH || outW < 1 || outH < 1 || !isFinite(outW) || !isFinite(outH)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(outW);
  canvas.height = Math.round(outH);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, outW, outH);
  ctx.filter = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
    `hue-rotate(${adj.hue}deg)`,
    `blur(${adj.blur}px)`,
    `opacity(${adj.opacity}%)`,
  ].join(" ");
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -outW / 2, -outH / 2, outW, outH);
  ctx.restore();
  return canvas;
}

// ── Tiny icon button ──────────────────────────────────────────────────────────
function IconBtn({
  onClick, title, active = false, danger = false, children,
}: {
  onClick: () => void; title: string; active?: boolean; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-150
        ${danger
          ? "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          : active
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
    >
      {children}
    </button>
  );
}

// ── Tool toggle button ────────────────────────────────────────────────────────
function ToolBtn({
  id, active, onClick, icon, label,
}: {
  id: string; active: boolean; onClick: () => void; icon: React.ReactNode; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all duration-150
        ${active
          ? "bg-primary/20 text-primary ring-1 ring-primary/30"
          : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
    >
      {icon}
      {label}
    </button>
  );
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
  const [widthStr, setWidthStr] = useState("800");
  const [heightStr, setHeightStr] = useState("600");

  const imgRef = useRef<HTMLImageElement>(null);
  const cropImgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cssFilter = [
    `brightness(${adj.brightness}%)`,
    `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`,
    `hue-rotate(${adj.hue}deg)`,
    `blur(${adj.blur}px)`,
    `opacity(${adj.opacity}%)`,
  ].join(" ");

  useEffect(() => { setWidthStr(String(resizeW)); }, [resizeW]);
  useEffect(() => { setHeightStr(String(resizeH)); }, [resizeH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const outW = resizeW > 0 ? resizeW : originalSize.w;
    const outH = resizeH > 0 ? resizeH : originalSize.h;
    const maxH = 460;
    const maxW = canvas.parentElement?.clientWidth ?? 700;
    const scale = Math.min(maxW / outW, maxH / outH, 1);
    const displayW = Math.round(outW * scale);
    const displayH = Math.round(outH * scale);

    canvas.width = displayW;
    canvas.height = displayH;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;

    ctx.clearRect(0, 0, displayW, displayH);
    ctx.save();
    ctx.translate(displayW / 2, displayH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(img, -displayW / 2, -displayH / 2, displayW, displayH);
    ctx.restore();
  }, [rotation, flipH, flipV, imgLoaded, originalSize, resizeW, resizeH]);

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

  const downloadEdited = () => {
    const img = imgRef.current;
    if (!img || !imgLoaded) return;
    const w = Math.round(resizeW);
    const h = Math.round(resizeH);
    if (w < 1 || h < 1 || !isFinite(w) || !isFinite(h)) {
      alert(`Invalid dimensions: ${w}×${h}.`);
      return;
    }
    const canvas = renderToCanvas(img, w, h, adj, rotation, flipH, flipV);
    if (!canvas) { alert(`Export failed at ${w}×${h}px.`); return; }
    canvas.toBlob((blob) => {
      if (!blob) { alert("Export failed: could not encode image."); return; }
      downloadBlob(blob, `${fileName}_${w}x${h}.png`);
    }, "image/png");
  };

  const downloadCropped = () => {
    const img = cropImgRef.current ?? imgRef.current;
    if (!completedCrop || !img) return;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const cw = Math.round(completedCrop.width * scaleX);
    const ch = Math.round(completedCrop.height * scaleY);
    if (cw < 1 || ch < 1) { alert("Crop region too small."); return; }
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.filter = cssFilter;
    ctx.drawImage(img, completedCrop.x * scaleX, completedCrop.y * scaleY, cw, ch, 0, 0, cw, ch);
    canvas.toBlob((blob) => {
      if (!blob) { alert("Crop export failed."); return; }
      downloadBlob(blob, `${fileName}_cropped_${cw}x${ch}.png`);
    }, "image/png");
  };

  const handleWidthChange = (val: number) => {
    if (!val || isNaN(val) || val < 1 || !isFinite(val)) return;
    const clamped = Math.min(8000, Math.round(val));
    setResizeW(clamped);
    if (keepAspect && originalSize.w > 0)
      setResizeH(Math.min(8000, Math.round(clamped * (originalSize.h / originalSize.w))));
  };
  const handleHeightChange = (val: number) => {
    if (!val || isNaN(val) || val < 1 || !isFinite(val)) return;
    const clamped = Math.min(8000, Math.round(val));
    setResizeH(clamped);
    if (keepAspect && originalSize.h > 0)
      setResizeW(Math.min(8000, Math.round(clamped * (originalSize.w / originalSize.h))));
  };

  const resetAll = () => {
    setAdj(DEFAULT_ADJ);
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
    if (originalSize.w) {
      setResizeW(originalSize.w);
      setResizeH(originalSize.h);
      setWidthStr(String(originalSize.w));
      setHeightStr(String(originalSize.h));
    }
  };

  const toggleTool = (t: ActiveTool) => setActiveTool(a => a === t ? null : t);

  // ── Upload screen ──────────────────────────────────────────────────────────
  if (!src) {
    return (
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-4 py-20 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300
          ${isDragging
            ? "border-primary/60 bg-primary/5 scale-[1.01]"
            : "border-border/30 bg-muted/10 hover:border-border/50 hover:bg-muted/20"}`}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <div className={`p-4 rounded-2xl transition-all ${isDragging ? "bg-primary/15" : "bg-muted/40"}`}>
          <ImageIcon className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground/60"}`} />
        </div>
        <div className="text-center space-y-1">
          <p className="font-medium text-foreground/80">
            {isDragging ? "Drop to open" : "Drop an image or click to browse"}
          </p>
          <p className="text-xs text-muted-foreground/50">PNG · JPG · WebP · GIF</p>
        </div>
      </div>
    );
  }

  // ── Editor ─────────────────────────────────────────────────────────────────
  const scalePercent = originalSize.w ? Math.round((resizeW / originalSize.w) * 100) : 100;
  const isResized = resizeW !== originalSize.w || resizeH !== originalSize.h;

  return (
    <div className="flex flex-col gap-2">

      {/* Hidden source image */}
      <img ref={imgRef} src={src} alt="" onLoad={onImageLoad} className="hidden" />
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />

      {/* ── TOOLBAR ── */}
      <div className="flex items-center gap-1 px-1 py-1 rounded-xl bg-muted/20 border border-border/30 backdrop-blur-sm">

        {/* File info */}
        <div className="flex items-center gap-2 px-2 mr-1 min-w-0">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
          <span className="text-xs font-medium text-foreground/70 truncate max-w-[100px]">{fileName}</span>
          <span className="text-[10px] text-muted-foreground/40 font-mono flex-shrink-0">
            {originalSize.w}×{originalSize.h}
          </span>
        </div>

        <div className="h-4 w-px bg-border/40 mx-1" />

        {/* Tool toggles */}
        <ToolBtn id="resize" active={activeTool === "resize"} onClick={() => toggleTool("resize")}
          icon={<ZoomIn className="h-3.5 w-3.5" />} label="Resize" />
        <ToolBtn id="crop" active={activeTool === "crop"} onClick={() => toggleTool("crop")}
          icon={<CropIcon className="h-3.5 w-3.5" />} label="Crop" />
        <ToolBtn id="adjust" active={activeTool === "adjust"} onClick={() => toggleTool("adjust")}
          icon={<Sliders className="h-3.5 w-3.5" />} label="Adjust" />

        <div className="h-4 w-px bg-border/40 mx-1" />

        {/* Transforms */}
        <IconBtn onClick={() => setRotation(r => r - 90)} title="Rotate left">
          <RotateCcw className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => setRotation(r => r + 90)} title="Rotate right">
          <RotateCw className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => setFlipH(f => !f)} title="Flip horizontal" active={flipH}>
          <FlipHorizontal className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => setFlipV(f => !f)} title="Flip vertical" active={flipV}>
          <FlipVertical className="h-3.5 w-3.5" />
        </IconBtn>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={downloadEdited}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary/90 hover:bg-primary text-white text-xs font-medium transition-all"
        >
          <Download className="h-3.5 w-3.5" />
          Download PNG
        </button>

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        <IconBtn onClick={resetAll} title="Reset all">
          <RefreshCcw className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => inputRef.current?.click()} title="Change image">
          <Upload className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn onClick={() => { setSrc(null); setCrop(undefined); setActiveTool(null); setImgLoaded(false); }}
          title="Close" danger>
          <X className="h-3.5 w-3.5" />
        </IconBtn>
      </div>

      {/* ── RESIZE PANEL ── */}
      {activeTool === "resize" && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/15 border border-border/25 flex-wrap">

          {/* Dimension inputs */}
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">W</label>
              <input type="number" value={widthStr} min={1} max={8000}
                onChange={(e) => {
                  setWidthStr(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) handleWidthChange(v);
                }}
                onBlur={() => setWidthStr(String(resizeW))}
                className="w-20 px-2 py-1 rounded-lg bg-background/60 border border-border/50 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all" />
            </div>

            <button
              onClick={() => setKeepAspect(k => !k)}
              title={keepAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              className={`mt-4 p-1 rounded-md transition-all ${keepAspect ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
            >
              {keepAspect ? <Link2 className="h-3.5 w-3.5" /> : <Unlink2 className="h-3.5 w-3.5" />}
            </button>

            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] uppercase tracking-wider text-muted-foreground/50">H</label>
              <input type="number" value={heightStr} min={1} max={8000}
                onChange={(e) => {
                  setHeightStr(e.target.value);
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= 1) handleHeightChange(v);
                }}
                onBlur={() => setHeightStr(String(resizeH))}
                className="w-20 px-2 py-1 rounded-lg bg-background/60 border border-border/50 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all" />
            </div>
          </div>

          <div className="h-4 w-px bg-border/40" />

          {/* Presets */}
          <div className="flex items-center gap-1">
            {[{ l: "¼×", s: 0.25 }, { l: "½×", s: 0.5 }, { l: "¾×", s: 0.75 }, { l: "1×", s: 1 }, { l: "2×", s: 2 }].map((p) => (
              <button key={p.l}
                onClick={() => { setResizeW(Math.round(originalSize.w * p.s)); setResizeH(Math.round(originalSize.h * p.s)); }}
                className={`h-7 px-2.5 rounded-md text-[11px] font-medium transition-all border
                  ${Math.abs(scalePercent - p.s * 100) < 1
                    ? "bg-primary/15 border-primary/30 text-primary"
                    : "border-border/40 text-muted-foreground hover:border-border/70 hover:text-foreground"}`}>
                {p.l}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border/40" />

          {/* Info */}
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
            <span className="font-mono">{originalSize.w}×{originalSize.h} <span className="text-muted-foreground/40">orig</span></span>
            <span className={`font-mono font-medium ${isResized ? "text-primary/80" : ""}`}>
              {resizeW}×{resizeH} <span className="text-muted-foreground/40">{scalePercent}%</span>
            </span>
          </div>

          <div className="ml-auto">
            <button onClick={downloadEdited}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-xs font-medium transition-all">
              <Download className="h-3.5 w-3.5" />
              Export {resizeW}×{resizeH}
            </button>
          </div>
        </div>
      )}

      {/* ── ADJUST PANEL ── */}
      {activeTool === "adjust" && (
        <div className="px-4 py-3 rounded-xl bg-muted/15 border border-border/25">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {([
              { label: "Brightness", icon: <Sun className="h-3 w-3" />,       key: "brightness" as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Contrast",   icon: <Contrast className="h-3 w-3" />,  key: "contrast"   as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Saturation", icon: <Droplets className="h-3 w-3" />,  key: "saturation" as keyof Adjustments, min: 0,  max: 200, unit: "%" },
              { label: "Hue",        icon: <Palette className="h-3 w-3" />,   key: "hue"        as keyof Adjustments, min: 0,  max: 360, unit: "°" },
              { label: "Blur",       icon: <Sun className="h-3 w-3" />,       key: "blur"       as keyof Adjustments, min: 0,  max: 20,  unit: "px" },
              { label: "Opacity",    icon: <Sun className="h-3 w-3" />,       key: "opacity"    as keyof Adjustments, min: 10, max: 100, unit: "%" },
            ]).map(({ label, icon, key, min, max, unit }) => {
              const val = adj[key];
              const modified = val !== DEFAULT_ADJ[key];
              return (
                <div key={label} className="flex items-center gap-3 min-w-0">
                  <div className={`flex items-center gap-1.5 w-24 flex-shrink-0 text-[11px] ${modified ? "text-primary/80" : "text-muted-foreground/60"}`}>
                    {icon}
                    <span>{label}</span>
                  </div>
                  <Slider min={min} max={max} value={val}
                    onValueChange={(v) => setAdj(a => ({ ...a, [key]: Array.isArray(v) ? (v as number[])[0] : (v as number) }))}
                    className="flex-1 cursor-pointer" />
                  <span className={`text-[10px] font-mono w-10 text-right flex-shrink-0 ${modified ? "text-primary/80" : "text-muted-foreground/40"}`}>
                    {val}{unit}
                  </span>
                  {modified && (
                    <button onClick={() => setAdj(a => ({ ...a, [key]: DEFAULT_ADJ[key] }))}
                      className="text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0" title="Reset">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={() => setAdj(DEFAULT_ADJ)}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors flex items-center gap-1">
              <RefreshCcw className="h-3 w-3" /> Reset all
            </button>
          </div>
        </div>
      )}

      {/* ── CROP PANEL ── */}
      {activeTool === "crop" && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted/15 border border-border/25">
          <p className="text-xs text-muted-foreground/60">
            Drag the handles on the image to select a crop region.
            {completedCrop && (
              <span className="ml-2 font-mono text-primary/70">
                {Math.round(completedCrop.width)} × {Math.round(completedCrop.height)} px selected
              </span>
            )}
          </p>
          <button onClick={downloadCropped} disabled={!completedCrop}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ml-4 flex-shrink-0
              ${completedCrop
                ? "bg-violet-600/80 hover:bg-violet-600 text-white"
                : "bg-muted/30 text-muted-foreground/40 cursor-not-allowed"}`}>
            <Download className="h-3.5 w-3.5" />
            {completedCrop ? "Export Cropped" : "No selection"}
          </button>
        </div>
      )}

      {/* ── CANVAS ── */}
      <div className={`rounded-xl border border-border/20 overflow-hidden flex items-center justify-center min-h-[400px]
        bg-[repeating-conic-gradient(oklch(0.13_0.01_260)_0%_25%,oklch(0.10_0.01_260)_0%_50%)]
        bg-[length:20px_20px] transition-all`}>

        {activeTool === "crop" ? (
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
              className="max-w-full max-h-[460px] object-contain block"
            />
          </ReactCrop>
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[460px] object-contain"
            style={{ filter: cssFilter }}
          />
        )}
      </div>
    </div>
  );
}
