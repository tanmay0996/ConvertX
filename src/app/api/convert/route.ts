import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow as DocxTableRow,
  TextRun,
  WidthType,
} from "docx";
import * as XLSX from "xlsx";

// ─── PDF extraction (coordinate-aware) ───────────────────────────────────────

const Y_TOLERANCE = 5;  // PDF points: items within this vertical range = same row

// Tabular formats (CSV/XLSX) use a small gap so each individual number gets its own cell.
// Prose formats (DOCX/HTML) use a larger gap to keep related text together.
const COL_GAP_TABULAR = 4;
const COL_GAP_PROSE = 15;

interface PdfItem {
  str: string;
  x: number;
  y: number;
  width: number;
  page: number;
}

/**
 * Extracts text from a PDF preserving spatial structure.
 * Returns:
 *  - rows: 2D array [row][cell] — column-aware (used by CSV / XLSX)
 *  - rawLines: each row joined into one string (used by DOCX / HTML)
 */
async function extractFromPdf(
  buffer: Buffer,
  colGapMin = COL_GAP_PROSE
): Promise<{ rows: string[][]; rawLines: string[] }> {
  // Dynamic import keeps pdfjs-dist out of the Turbopack bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // pdfjs-dist v5: empty string is treated as "not specified" and causes a fake-worker error.
  // Point directly to the worker file so Node.js can spawn it via worker_threads.
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    const workerPath = path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  }

  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const allItems: PdfItem[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      const str: string = item.str;
      if (!str.trim()) continue;

      const charWidth =
        item.width && item.width > 0
          ? item.width
          : str.length * Math.abs(item.transform[0]) * 0.55; // fallback estimate

      allItems.push({
        str,
        x: item.transform[4],
        y: item.transform[5],
        width: charWidth,
        page: pageNum,
      });
    }
  }

  // Sort top-to-bottom (PDF y=0 is at bottom, so descending y = top first),
  // then left-to-right within the same page.
  allItems.sort((a, b) =>
    a.page !== b.page ? a.page - b.page : b.y - a.y
  );

  // Cluster items into rows by y-coordinate proximity
  const rowGroups: PdfItem[][] = [];
  let currentGroup: PdfItem[] = [];

  for (const item of allItems) {
    if (
      currentGroup.length === 0 ||
      (item.page === currentGroup[0].page &&
        Math.abs(item.y - currentGroup[0].y) <= Y_TOLERANCE)
    ) {
      currentGroup.push(item);
    } else {
      rowGroups.push(currentGroup);
      currentGroup = [item];
    }
  }
  if (currentGroup.length > 0) rowGroups.push(currentGroup);

  // Within each row: sort left-to-right, then split into cells on large x-gaps
  const rows: string[][] = [];
  const rawLines: string[] = [];

  for (const group of rowGroups) {
    const sortedGroup = [...group].sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let currentCell = sortedGroup[0].str;

    for (let i = 1; i < sortedGroup.length; i++) {
      const prev = sortedGroup[i - 1];
      const curr = sortedGroup[i];
      // Gap = space between the right edge of prev item and left edge of curr item
      const gap = curr.x - (prev.x + prev.width);

      if (gap > colGapMin) {
        cells.push(currentCell.trim());
        currentCell = curr.str;
      } else {
        // Preserve intra-cell spacing: add a space when there's a visible gap
        currentCell += gap > 1 ? ` ${curr.str}` : curr.str;
      }
    }
    cells.push(currentCell.trim());

    const validCells = cells.filter(Boolean);
    if (validCells.length > 0) {
      rows.push(validCells);
      rawLines.push(validCells.join("  ")); // double-space join keeps parseBlocks happy
    }
  }

  return { rows, rawLines };
}

// ─── Block analysis (for DOCX / HTML prose) ──────────────────────────────────

type BlockKind = "h1" | "h2" | "bullet" | "numbered" | "table-row" | "paragraph";

interface Block {
  kind: BlockKind;
  text: string;
  cells?: string[];
  num?: number;
}

function parseBlocks(rawLines: string[]): Block[] {
  const blocks: Block[] = [];

  for (const raw of rawLines) {
    const text = raw.trim();
    if (!text) continue;

    // H1: ALL CAPS, ≤ 80 chars, has at least one letter, not a numbered item
    if (
      text.length <= 80 &&
      text === text.toUpperCase() &&
      /[A-Z]/.test(text) &&
      !/^\d+[.)]\s/.test(text)
    ) {
      blocks.push({ kind: "h1", text });
      continue;
    }

    // Bullet point
    if (/^[•\-\*○▪►]\s+/.test(text)) {
      blocks.push({ kind: "bullet", text: text.replace(/^[•\-\*○▪►]\s+/, "").trim() });
      continue;
    }

    // Numbered list item
    const numMatch = text.match(/^(\d+)[.)]\s+(.+)/);
    if (numMatch) {
      blocks.push({ kind: "numbered", text: numMatch[2].trim(), num: parseInt(numMatch[1]) });
      continue;
    }

    // Table row: ≥ 2 cells separated by 2+ spaces or a tab
    const cells = text.split(/\t|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 2) {
      blocks.push({ kind: "table-row", text, cells });
      continue;
    }

    // H2: short, starts uppercase, no trailing sentence punctuation, 2–7 words
    const words = text.split(/\s+/);
    if (
      text.length <= 65 &&
      words.length >= 2 &&
      words.length <= 7 &&
      /^[A-Z]/.test(text) &&
      !/[.,;?!]$/.test(text)
    ) {
      blocks.push({ kind: "h2", text });
      continue;
    }

    blocks.push({ kind: "paragraph", text });
  }

  return blocks;
}

// Group consecutive table-row blocks so renderers can emit real tables
type GroupedBlock =
  | { kind: Exclude<BlockKind, "table-row">; block: Block }
  | { kind: "table-group"; rows: string[][] };

function groupBlocks(blocks: Block[]): GroupedBlock[] {
  const grouped: GroupedBlock[] = [];
  let i = 0;
  while (i < blocks.length) {
    if (blocks[i].kind === "table-row") {
      const rows: string[][] = [];
      while (i < blocks.length && blocks[i].kind === "table-row") {
        rows.push(blocks[i].cells!);
        i++;
      }
      grouped.push({ kind: "table-group", rows });
    } else {
      grouped.push({
        kind: blocks[i].kind as Exclude<BlockKind, "table-row">,
        block: blocks[i],
      });
      i++;
    }
  }
  return grouped;
}

// ─── Format: DOCX ─────────────────────────────────────────────────────────────

async function toDocx(blocks: Block[], title: string): Promise<Buffer> {
  const grouped = groupBlocks(blocks);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: title, bold: true, size: 52 })],
      spacing: { after: 400 },
    }),
  ];

  for (const item of grouped) {
    if (item.kind === "table-group") {
      const { rows } = item;
      const hasHeader = rows.length > 1;
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map(
            (row, rowIdx) =>
              new DocxTableRow({
                tableHeader: hasHeader && rowIdx === 0,
                children: row.map(
                  (cell) =>
                    new TableCell({
                      shading:
                        hasHeader && rowIdx === 0
                          ? { fill: "1E3A5F", type: ShadingType.CLEAR }
                          : undefined,
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: cell,
                              bold: hasHeader && rowIdx === 0,
                              color: hasHeader && rowIdx === 0 ? "FFFFFF" : undefined,
                            }),
                          ],
                        }),
                      ],
                    })
                ),
              })
          ),
        })
      );
      children.push(new Paragraph({ children: [new TextRun("")], spacing: { after: 160 } }));
      continue;
    }

    const { block } = item;
    switch (block.kind) {
      case "h1":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: block.text, bold: true })],
            spacing: { before: 480, after: 160 },
          })
        );
        break;
      case "h2":
        children.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: block.text, bold: true })],
            spacing: { before: 280, after: 120 },
          })
        );
        break;
      case "bullet":
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: block.text })],
            spacing: { after: 80 },
          })
        );
        break;
      case "numbered":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${block.num}.  `, bold: true }),
              new TextRun({ text: block.text }),
            ],
            indent: { left: 360, hanging: 360 },
            spacing: { after: 80 },
          })
        );
        break;
      default:
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text })],
            spacing: { after: 120 },
            alignment: AlignmentType.JUSTIFIED,
          })
        );
    }
  }

  if (children.length === 1) {
    children.push(new Paragraph({ children: [new TextRun("(empty document)")] }));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

// ─── Format: XLSX ─────────────────────────────────────────────────────────────

function toXlsx(rows: string[][], title: string): Buffer {
  if (rows.length === 0) rows = [["(empty)"]];

  // Normalize to consistent column count, then parse numeric cells
  const maxCols = Math.max(...rows.map((r) => r.length));
  const data = rows.map((row) => {
    const padded = row.concat(Array(maxCols - row.length).fill(""));
    return padded.map((cell) => {
      const n = Number(cell.replace(/,/g, ""));
      return !isNaN(n) && cell.trim() !== "" ? n : cell;
    });
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Auto column widths (capped at 50 chars)
  const colWidths = data.reduce<number[]>((acc, row) => {
    row.forEach((cell, i) => {
      const len = String(cell).length;
      acc[i] = Math.min(Math.max(acc[i] ?? 10, len + 2), 50);
    });
    return acc;
  }, []);
  ws["!cols"] = colWidths.map((wch) => ({ wch }));

  // AutoFilter on header row when data looks tabular (≥ 2 cols, > 1 row)
  if (data[0]?.length >= 2 && data.length > 1) {
    ws["!autofilter"] = { ref: ws["!ref"] ?? "A1" };
  }

  const sheetName = title.replace(/[\\/*?:[\]]/g, "").substring(0, 31) || "Sheet1";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ─── Format: CSV ─────────────────────────────────────────────────────────────

function toCsv(rows: string[][]): string {
  if (rows.length === 0) return "";
  const maxCols = Math.max(...rows.map((r) => r.length));
  return rows
    .map((row) => {
      const padded = row.concat(Array(maxCols - row.length).fill(""));
      return padded.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
    })
    .join("\n");
}

// ─── Format: HTML ─────────────────────────────────────────────────────────────

function toHtml(blocks: Block[], title: string): string {
  const grouped = groupBlocks(blocks);
  const parts: string[] = [];
  const toc: { id: string; text: string; level: number }[] = [];
  let headingCount = 0;
  let listState: "none" | "ul" | "ol" = "none";

  function closeList() {
    if (listState === "ul") parts.push("</ul>");
    if (listState === "ol") parts.push("</ol>");
    listState = "none";
  }

  for (const item of grouped) {
    if (item.kind === "table-group") {
      closeList();
      const { rows } = item;
      const hasHeader = rows.length > 1;
      const tableRows = rows
        .map((row, rowIdx) => {
          const tag = hasHeader && rowIdx === 0 ? "th" : "td";
          return `<tr>${row.map((cell) => `<${tag}>${escapeHtml(cell)}</${tag}>`).join("")}</tr>`;
        })
        .join("\n  ");
      parts.push(`<div class="table-wrap"><table>\n  ${tableRows}\n</table></div>`);
      continue;
    }

    const { block } = item;

    if (block.kind === "bullet") {
      if (listState !== "ul") { closeList(); parts.push("<ul>"); listState = "ul"; }
      parts.push(`  <li>${escapeHtml(block.text)}</li>`);
      continue;
    }

    if (block.kind === "numbered") {
      if (listState !== "ol") { closeList(); parts.push("<ol>"); listState = "ol"; }
      parts.push(`  <li value="${block.num}">${escapeHtml(block.text)}</li>`);
      continue;
    }

    closeList();

    switch (block.kind) {
      case "h1": {
        const id = `h-${++headingCount}`;
        toc.push({ id, text: block.text, level: 1 });
        parts.push(`<h2 id="${id}">${escapeHtml(block.text)}</h2>`);
        break;
      }
      case "h2": {
        const id = `h-${++headingCount}`;
        toc.push({ id, text: block.text, level: 2 });
        parts.push(`<h3 id="${id}">${escapeHtml(block.text)}</h3>`);
        break;
      }
      default:
        parts.push(`<p>${escapeHtml(block.text)}</p>`);
    }
  }

  closeList();

  const tocHtml =
    toc.length >= 3
      ? `<nav class="toc"><p class="toc-label">Contents</p><ol>${toc
          .map(
            (e) =>
              `<li class="toc-l${e.level}"><a href="#${e.id}">${escapeHtml(e.text)}</a></li>`
          )
          .join("")}</ol></nav>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, "Times New Roman", serif; font-size: 17px; line-height: 1.8; color: #1a1a1a; background: #f5f5f5; padding: 0 16px; }
  .page { max-width: 860px; margin: 48px auto; background: #fff; padding: 56px 64px; border-radius: 6px; box-shadow: 0 2px 20px rgba(0,0,0,.09); }
  h1.doc-title { font-size: 2.1em; color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 14px; margin-bottom: 36px; }
  h2 { font-size: 1.45em; color: #1e3a5f; margin-top: 44px; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }
  h3 { font-size: 1.15em; color: #2c5282; margin-top: 30px; margin-bottom: 8px; }
  p { margin-bottom: 14px; text-align: justify; }
  ul, ol { margin: 10px 0 16px 28px; }
  li { margin-bottom: 6px; }
  .table-wrap { overflow-x: auto; margin: 24px 0; border-radius: 6px; border: 1px solid #d0d7de; }
  table { border-collapse: collapse; width: 100%; font-size: 0.9em; font-family: system-ui, -apple-system, sans-serif; }
  th { background: #1e3a5f; color: #fff; font-weight: 600; text-align: left; padding: 10px 16px; white-space: nowrap; }
  td { padding: 9px 16px; border-top: 1px solid #e1e4e8; vertical-align: top; }
  tr:nth-child(even) td { background: #f6f8fa; }
  tr:hover td { background: #eef4ff; }
  .toc { background: #f0f4f8; border-left: 4px solid #1e3a5f; padding: 18px 24px; margin: 0 0 36px; border-radius: 0 6px 6px 0; }
  .toc-label { font-size: 0.75em; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #555; margin-bottom: 10px; }
  .toc ol { margin: 0 0 0 18px; }
  .toc li { margin-bottom: 4px; }
  .toc li a { color: #1e3a5f; text-decoration: none; }
  .toc li a:hover { text-decoration: underline; }
  .toc-l2 { margin-left: 16px; font-size: 0.92em; }
  @media (max-width: 700px) { .page { padding: 28px 20px; } }
  @media print { body { background: none; } .page { box-shadow: none; padding: 0; margin: 0; } }
</style>
</head>
<body>
<div class="page">
<h1 class="doc-title">${escapeHtml(title)}</h1>
${tocHtml}
${parts.join("\n")}
</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    const format = formData.get("format") as string;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { name: string; data: string; mimeType: string }[] = [];

    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const baseName = file.name.replace(/\.pdf$/i, "");

      // Tabular formats need fine-grained splitting (each number = own cell).
      // Prose formats keep related text together with a larger gap threshold.
      const isTabular = format === "csv" || format === "xlsx";
      const { rows, rawLines } = await extractFromPdf(
        buffer,
        isTabular ? COL_GAP_TABULAR : COL_GAP_PROSE
      );

      if (format === "docx") {
        const blocks = parseBlocks(rawLines);
        const docBuffer = await toDocx(blocks, baseName);
        results.push({
          name: `${baseName}.docx`,
          data: docBuffer.toString("base64"),
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      } else if (format === "xlsx") {
        const xlsxBuffer = toXlsx(rows, baseName);
        results.push({
          name: `${baseName}.xlsx`,
          data: xlsxBuffer.toString("base64"),
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else if (format === "csv") {
        const csv = toCsv(rows);
        results.push({
          name: `${baseName}.csv`,
          data: Buffer.from(csv).toString("base64"),
          mimeType: "text/csv",
        });
      } else if (format === "html") {
        const blocks = parseBlocks(rawLines);
        const htmlContent = toHtml(blocks, baseName);
        results.push({
          name: `${baseName}.html`,
          data: Buffer.from(htmlContent).toString("base64"),
          mimeType: "text/html",
        });
      } else {
        return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
      }
    }

    return NextResponse.json({ files: results });
  } catch (err) {
    console.error("Conversion error:", err);
    return NextResponse.json(
      { error: "Conversion failed. Ensure uploaded files are valid PDFs." },
      { status: 500 }
    );
  }
}
