import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface OverlayField {
  id: string;
  type: 'signature' | 'date';
  page_number: number;
  x_position: number; // percentage (0-100) - center position
  y_position: number; // percentage (0-100) - center position
  width: number;
  height: number;
  value?: string; // base64 data url for signature image, or date string
}

/**
 * Overlays signature images and date text onto the ORIGINAL uploaded PDF.
 * Does NOT recreate or alter document layout or pages.
 */
export async function overlaySignaturesOnPdf(
  originalPdfBase64OrUrl: string,
  fields: OverlayField[]
): Promise<Uint8Array> {
  let fileBytes: Uint8Array;

  if (originalPdfBase64OrUrl.startsWith('data:') && originalPdfBase64OrUrl.includes(';base64,')) {
    const base64Str = originalPdfBase64OrUrl.split(';base64,')[1];
    const binaryStr = window.atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    fileBytes = bytes;
  } else if (/^[a-zA-Z0-9+/=]+$/.test(originalPdfBase64OrUrl.trim()) && originalPdfBase64OrUrl.length > 100) {
    const binaryStr = window.atob(originalPdfBase64OrUrl.trim());
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    fileBytes = bytes;
  } else {
    // Fetch via HTTP
    const resp = await fetch(originalPdfBase64OrUrl);
    const arrayBuf = await resp.arrayBuffer();
    fileBytes = new Uint8Array(arrayBuf);
  }

  const pdfDoc = await PDFDocument.load(fileBytes);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const field of fields) {
    if (!field.value) continue;

    const pageIndex = Math.max(0, (field.page_number || 1) - 1);
    if (pageIndex >= pdfDoc.getPageCount()) continue;

    const page = pdfDoc.getPage(pageIndex);
    const { width: pageWidth, height: pageHeight } = page.getSize();

    const fWidth = field.width || 140;
    const fHeight = field.height || 50;

    // Convert center-based percentage coordinates to bottom-left PDF coordinates
    const x = (field.x_position / 100) * pageWidth - (fWidth / 2);
    const y = pageHeight - ((field.y_position / 100) * pageHeight) - (fHeight / 2);

    if (field.type === 'signature') {
      const val = field.value;
      let img;
      try {
        if (val.startsWith('data:image/png;base64,')) {
          const base64Img = val.replace(/^data:image\/png;base64,/, '');
          const imgBytes = Uint8Array.from(atob(base64Img), c => c.charCodeAt(0));
          img = await pdfDoc.embedPng(imgBytes);
        } else if (val.startsWith('data:image/jpeg;base64,') || val.startsWith('data:image/jpg;base64,')) {
          const base64Img = val.replace(/^data:image\/jpeg;base64,/, '').replace(/^data:image\/jpg;base64,/, '');
          const imgBytes = Uint8Array.from(atob(base64Img), c => c.charCodeAt(0));
          img = await pdfDoc.embedJpg(imgBytes);
        }
      } catch (err) {
        console.error("Error embedding signature image into PDF:", err);
      }

      if (img) {
        page.drawImage(img, {
          x,
          y,
          width: fWidth,
          height: fHeight,
        });
      }
    } else if (field.type === 'date') {
      const dateText = String(field.value);
      page.drawText(dateText, {
        x: Math.max(10, x + 4),
        y: y + (fHeight / 2) - 4,
        size: Math.min(12, Math.max(9, fHeight * 0.35)),
        font: fontRegular,
        color: rgb(0.1, 0.15, 0.3),
      });
    }
  }

  return await pdfDoc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
