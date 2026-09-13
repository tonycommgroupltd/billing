import ExcelJS from "exceljs";
import logoUrl from "../images/logo-dark.png";

const COLORS = {
  navy: "1B2A4A",
  navyMid: "243B67",
  text: "1F2937",
  muted: "6B7280",
  border: "D1D5DB",
  zebra: "F3F4F6",
  white: "FFFFFF",
  soft: "EEF2F7",
};

function colLetter(index) {
  let n = index;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function autoWidth(worksheet, columns, rows) {
  columns.forEach((col, i) => {
    let max = String(col.header || "").length;
    rows.forEach((row) => {
      const val = row[col.key];
      const len = val == null ? 0 : String(val).length;
      if (len > max) max = len;
    });
    worksheet.getColumn(i + 1).width = Math.min(42, Math.max(10, max + 3));
  });
}

async function loadLogoBuffer(src = logoUrl) {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Build and download a minimal corporate .xlsx report.
 * Header keeps open space on the right for the TonyComm login logo.
 * Data columns get Excel AutoFilter.
 */
export async function downloadCompanyExcel({
  companyName = "TonyComm Group Ltd",
  title,
  subtitle = "",
  columns,
  rows,
  fileName,
  sheetName = "Report",
  meta = [],
  logoSrc = logoUrl,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.lastModifiedBy = companyName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    properties: { defaultRowHeight: 18 },
  });

  const lastCol = Math.max(columns.length, 1);
  const lastLetter = colLetter(lastCol - 1);
  // Keep right-side columns free for the logo block.
  const logoReserve = Math.min(3, Math.max(2, Math.floor(lastCol / 5) || 2));
  const textLastCol = Math.max(1, lastCol - logoReserve);
  const textLastLetter = colLetter(textLastCol - 1);

  // Title block (left) — right stays open for logo
  sheet.mergeCells(`A1:${textLastLetter}1`);
  const companyCell = sheet.getCell("A1");
  companyCell.value = companyName.toUpperCase();
  companyCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.muted } };
  companyCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 18;

  sheet.mergeCells(`A2:${textLastLetter}2`);
  const titleCell = sheet.getCell("A2");
  titleCell.value = title;
  titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2).height = 26;

  sheet.mergeCells(`A3:${textLastLetter}3`);
  const subCell = sheet.getCell("A3");
  subCell.value = subtitle;
  subCell.font = { name: "Calibri", size: 10, color: { argb: COLORS.muted } };
  subCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  sheet.getRow(3).height = 20;

  // Soft fill on logo zone so the empty space reads as a brand panel
  for (let r = 1; r <= 3; r++) {
    for (let c = textLastCol + 1; c <= lastCol; c++) {
      const cell = sheet.getCell(r, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.soft },
      };
    }
  }

  const logoBuffer = await loadLogoBuffer(logoSrc);
  if (logoBuffer) {
    const imageId = workbook.addImage({
      buffer: logoBuffer,
      extension: "png",
    });
    // Anchor logo in the reserved right panel (rows 1–3).
    sheet.addImage(imageId, {
      tl: { col: textLastCol + 0.15, row: 0.15 },
      ext: { width: 132, height: 52 },
      editAs: "oneCell",
    });
  }

  // Thin navy rule under header (full width)
  for (let c = 1; c <= lastCol; c++) {
    sheet.getCell(4, c).border = {
      bottom: { style: "medium", color: { argb: COLORS.navy } },
    };
  }
  sheet.getRow(4).height = 6;

  // Meta line
  let headerRowIndex = 5;
  if (meta.length) {
    sheet.mergeCells(`A5:${lastLetter}5`);
    const metaCell = sheet.getCell("A5");
    metaCell.value = meta.map((m) => `${m.label}: ${m.value}`).join("   ·   ");
    metaCell.font = { name: "Calibri", size: 9, color: { argb: COLORS.muted } };
    metaCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.soft },
    };
    metaCell.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(5).height = 20;
    headerRowIndex = 6;
  }

  // Column headers
  const headerRow = sheet.getRow(headerRowIndex);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.navy },
    };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.navy } },
      left: { style: "thin", color: { argb: COLORS.navyMid } },
      bottom: { style: "thin", color: { argb: COLORS.navy } },
      right: { style: "thin", color: { argb: COLORS.navyMid } },
    };
  });
  headerRow.height = 22;

  // Data rows
  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRowIndex + 1 + rowIndex);
    const zebra = rowIndex % 2 === 1;
    columns.forEach((col, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      const raw = row[col.key];
      cell.value = raw == null || raw === "" ? "—" : raw;
      cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.text } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: zebra ? COLORS.zebra : COLORS.white },
      };
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.border } },
        left: { style: "thin", color: { argb: COLORS.border } },
        bottom: { style: "thin", color: { argb: COLORS.border } },
        right: { style: "thin", color: { argb: COLORS.border } },
      };
    });
    excelRow.height = 18;
  });

  const lastDataRow = headerRowIndex + Math.max(rows.length, 1);

  // Excel AutoFilter on header + data only (footer excluded)
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: lastDataRow, column: lastCol },
  };

  // Footer below filtered range
  const footerRowIndex = lastDataRow + 1;
  sheet.mergeCells(`A${footerRowIndex}:${lastLetter}${footerRowIndex}`);
  const footer = sheet.getCell(`A${footerRowIndex}`);
  footer.value = `Total records: ${rows.length.toLocaleString()}    |    Generated ${new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}    |    Confidential — internal use only`;
  footer.font = { name: "Calibri", size: 9, italic: true, color: { argb: COLORS.muted } };
  footer.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.soft },
  };
  footer.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(footerRowIndex).height = 20;

  autoWidth(sheet, columns, rows);
  columns.forEach((col, i) => {
    if (col.width) sheet.getColumn(i + 1).width = col.width;
  });

  // Freeze below header row so filters stay visible while scrolling
  sheet.views = [{ state: "frozen", ySplit: headerRowIndex, showGridLines: false }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default downloadCompanyExcel;
