import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM;

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Fetch same-origin images and embed as data URLs so html2canvas always sees them. */
async function inlineDocumentImages(doc) {
  const images = Array.from(doc.querySelectorAll("img"));
  await Promise.all(
    images.map(async (img) => {
      const attr = img.getAttribute("src");
      if (!attr || attr.startsWith("data:")) return;
      try {
        const absolute = new URL(attr, doc.baseURI).href;
        const res = await fetch(absolute, { credentials: "same-origin", cache: "force-cache" });
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await blobToDataURL(blob);
        img.setAttribute("src", dataUrl);
        if (typeof img.decode === "function") {
          await img.decode().catch(() => {});
        }
      } catch {
        // keep original src
      }
    })
  );

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 4000);
      });
    })
  );
}

/** Place canvas on A4 without stretching (letterbox if needed). */
function addCanvasToPdf(pdf, canvas, isFirstPage) {
  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const ratio = canvas.width / canvas.height;

  let w = A4_WIDTH_MM;
  let h = A4_HEIGHT_MM;
  let x = 0;
  let y = 0;

  if (ratio > A4_RATIO + 0.002) {
    // Capture is wider than A4 — fit width, pad top/bottom
    h = A4_WIDTH_MM / ratio;
    y = (A4_HEIGHT_MM - h) / 2;
  } else if (ratio < A4_RATIO - 0.002) {
    // Capture is taller — fit height, pad sides
    w = A4_HEIGHT_MM * ratio;
    x = (A4_WIDTH_MM - w) / 2;
  }

  if (!isFirstPage) pdf.addPage();
  if (x !== 0 || y !== 0 || w !== A4_WIDTH_MM || h !== A4_HEIGHT_MM) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, "F");
  }
  pdf.addImage(imgData, "JPEG", x, y, w, h, undefined, "FAST");
}

/**
 * Capture each .page in a document/iframe and save a multi-page A4 PDF.
 */
export async function downloadCompanyProfilePdf(doc, {
  filename = "Tonycomm-Company-Profile-2026.pdf",
  onProgress,
} = {}) {
  if (!doc) {
    throw new Error("Profile document is not ready yet.");
  }

  const pages = Array.from(doc.querySelectorAll(".page"));
  if (!pages.length) {
    throw new Error("No profile pages found to export.");
  }

  onProgress?.({ page: 0, total: pages.length, label: "Preparing images…" });

  try {
    if (doc.fonts?.ready) {
      await Promise.race([
        doc.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    }
  } catch {
    // ignore
  }

  await inlineDocumentImages(doc);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  for (let i = 0; i < pages.length; i++) {
    onProgress?.({ page: i + 1, total: pages.length });
    const page = pages[i];

    // Lock exact A4 box so capture aspect matches the PDF page
    const prev = {
      width: page.style.width,
      height: page.style.height,
      maxHeight: page.style.maxHeight,
      minHeight: page.style.minHeight,
      margin: page.style.margin,
      boxShadow: page.style.boxShadow,
    };
    page.style.width = `${A4_WIDTH_MM}mm`;
    page.style.height = `${A4_HEIGHT_MM}mm`;
    page.style.maxHeight = `${A4_HEIGHT_MM}mm`;
    page.style.minHeight = `${A4_HEIGHT_MM}mm`;
    page.style.margin = "0";
    page.style.boxShadow = "none";

    try {
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 20000,
        foreignObjectRendering: false,
        scrollX: 0,
        scrollY: -doc.defaultView.scrollY,
        windowWidth: page.offsetWidth,
        windowHeight: page.offsetHeight,
        onclone: (clonedDoc) => {
          clonedDoc.querySelectorAll("img").forEach((img) => {
            img.style.objectFit = "cover";
            img.style.objectPosition = "center";
          });
          clonedDoc.querySelectorAll(".page").forEach((el) => {
            el.style.width = `${A4_WIDTH_MM}mm`;
            el.style.height = `${A4_HEIGHT_MM}mm`;
            el.style.maxHeight = `${A4_HEIGHT_MM}mm`;
            el.style.margin = "0";
            el.style.boxShadow = "none";
          });
        },
      });

      try {
        addCanvasToPdf(pdf, canvas, i === 0);
      } catch (err) {
        throw new Error(
          `Could not export page ${i + 1} (image security). Try Refresh, then Download PDF again.`
        );
      }
    } finally {
      page.style.width = prev.width;
      page.style.height = prev.height;
      page.style.maxHeight = prev.maxHeight;
      page.style.minHeight = prev.minHeight;
      page.style.margin = prev.margin;
      page.style.boxShadow = prev.boxShadow;
    }
  }

  pdf.save(filename);
  return filename;
}

export default downloadCompanyProfilePdf;
