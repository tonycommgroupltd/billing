import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function imageUrlToDataUrl(url) {
  if (!url) return "";
  try {
    const res = await fetch(url, { credentials: "same-origin", cache: "force-cache" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function exportElementToPdf(element, filename = "document.pdf") {
  if (!element) throw new Error("Nothing to export");
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#ffffff",
    logging: false,
  });
  const img = canvas.toDataURL("image/jpeg", 0.93);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageW = 210;
  const pageH = 297;
  const ratio = canvas.width / canvas.height;
  let w = pageW;
  let h = pageW / ratio;
  if (h > pageH) {
    h = pageH;
    w = pageH * ratio;
  }
  const x = (pageW - w) / 2;
  pdf.addImage(img, "JPEG", x, 0, w, h, undefined, "FAST");
  pdf.save(filename);
  return filename;
}

/** Word-compatible HTML (.doc) — opens cleanly in Microsoft Word. */
export function exportHtmlToWord(htmlBody, filename = "document.doc", title = "Tonycomm Document", extraHead = "") {
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
  @page Section1 {
    size: 210mm 297mm;
    margin: 42mm 18mm 32mm 18mm;
    mso-header: h1;
    mso-footer: f1;
    mso-header-margin: 12mm;
    mso-footer-margin: 10mm;
  }
  div.Section1 { page: Section1; }
  body { font-family: Calibri, "Segoe UI", Arial, sans-serif; color: #1a1a1a; font-size: 11pt; }
  ${extraHead}
</style>
</head>
<body>${htmlBody}</body>
</html>`;

  const blob = new Blob(["\ufeff", html], {
    type: "application/msword;charset=utf-8",
  });
  triggerDownload(blob, filename.endsWith(".doc") ? filename : `${filename}.doc`);
  return filename;
}

export default { exportElementToPdf, exportHtmlToWord, imageUrlToDataUrl };
