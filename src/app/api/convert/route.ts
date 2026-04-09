import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";

// pdf-parse v1 — kept external via serverExternalPackages so Turbopack doesn't bundle it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parsePdf(buffer: Buffer): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse");
  return pdfParse(buffer);
}

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

      const pdfData = await parsePdf(buffer);
      const text = pdfData.text || "";
      const lines = text.split("\n").filter((l: string) => l.trim().length > 0);

      if (format === "docx") {
        const paragraphs = lines.map((line: string) => {
          const trimmed = line.trim();
          // Detect headings heuristically: short ALL CAPS or short lines
          const isHeading =
            trimmed.length < 60 &&
            trimmed.length > 0 &&
            trimmed === trimmed.toUpperCase() &&
            /[A-Z]/.test(trimmed);

          if (isHeading) {
            return new Paragraph({
              heading: HeadingLevel.HEADING_1,
              children: [new TextRun({ text: trimmed, bold: true })],
            });
          }
          return new Paragraph({
            children: [new TextRun({ text: trimmed })],
            spacing: { after: 120 },
          });
        });

        const doc = new Document({
          sections: [{ properties: {}, children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun("(empty document)")] })] }],
        });

        const docBuffer = await Packer.toBuffer(doc);
        results.push({
          name: `${baseName}.docx`,
          data: docBuffer.toString("base64"),
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      } else if (format === "xlsx") {
        // Try to parse lines into rows (split by multiple spaces or tabs)
        const rows = lines.map((line: string) =>
          line.split(/\s{2,}|\t/).map((cell: string) => cell.trim()).filter(Boolean)
        );

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [["(empty)"]]);
        XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
        const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        results.push({
          name: `${baseName}.xlsx`,
          data: Buffer.from(xlsxBuffer).toString("base64"),
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      } else if (format === "csv") {
        const rows = lines.map((line: string) =>
          line.split(/\s{2,}|\t/).map((cell: string) => cell.trim()).filter(Boolean)
        );
        const csv = rows
          .map((row: string[]) =>
            row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(",")
          )
          .join("\n");

        results.push({
          name: `${baseName}.csv`,
          data: Buffer.from(csv).toString("base64"),
          mimeType: "text/csv",
        });
      } else if (format === "html") {
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${baseName}</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #222; }
  h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
  p { margin: 0.6em 0; }
</style>
</head>
<body>
<h1>${baseName}</h1>
${lines.map((line: string) => `<p>${escapeHtml(line.trim())}</p>`).join("\n")}
</body>
</html>`;

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
    return NextResponse.json({ error: "Conversion failed. Ensure uploaded files are valid PDFs." }, { status: 500 });
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
