import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  StandardFonts,
  degrees,
} from 'pdf-lib';
import {
  DocumentSettings,
  FolioImage,
  GeneratedPdfResult,
  MarginPreset,
  PageGeometry,
  PaperSize,
} from '../types/folio';
import { getEffectiveImageDimensions, isFullCrop } from './imageProcessor';

const MM_TO_PT = 72 / 25.4;

export const PAPER_DIMENSIONS_MM: Record<
  Exclude<PaperSize, 'FitToImage'>,
  { width: number; height: number; label: string }
> = {
  A4: { width: 210, height: 297, label: 'A4 (210 × 297 mm)' },
  A3: { width: 297, height: 420, label: 'A3 (297 × 420 mm)' },
  Letter: { width: 215.9, height: 279.4, label: 'Letter (8.5 × 11 in)' },
  Legal: { width: 215.9, height: 355.6, label: 'Legal (8.5 × 14 in)' },
};

export function resolveMarginMm(
  preset: MarginPreset,
  customMarginMm: number,
  shortSideMm: number
): number {
  let rawMm = 10;
  if (preset === 'None') rawMm = 0;
  else if (preset === 'Small') rawMm = 10;
  else if (preset === 'Standard') rawMm = 20;
  else if (preset === 'Custom') {
    rawMm = Number.isFinite(customMarginMm) ? Math.max(0, customMarginMm) : 10;
  }

  const maxAllowedPerSide = Math.max(0, Math.floor(shortSideMm * 0.3));
  return Math.min(rawMm, maxAllowedPerSide);
}

export function calculatePageGeometry(image: FolioImage, settings: DocumentSettings): PageGeometry {
  const { effectiveWidthPx, effectiveHeightPx } = getEffectiveImageDimensions(image);
  const rotatedImgWidthPx = effectiveWidthPx;
  const rotatedImgHeightPx = effectiveHeightPx;
  const imgAspect = rotatedImgWidthPx / Math.max(1, rotatedImgHeightPx);

  let pageWidthMm: number;
  let pageHeightMm: number;
  let effectiveOrientation: 'Portrait' | 'Landscape';

  if (settings.paperSize === 'FitToImage') {
    const rawW = (rotatedImgWidthPx / 150) * 25.4;
    const rawH = (rotatedImgHeightPx / 150) * 25.4;
    const maxEdge = Math.max(rawW, rawH, 1);
    const normScale = maxEdge > 420 ? 420 / maxEdge : maxEdge < 120 ? 120 / maxEdge : 1;
    const contentW = rawW * normScale;
    const contentH = rawH * normScale;
    const tempShort = Math.min(contentW, contentH);
    const marginForFit = resolveMarginMm(
      settings.marginPreset,
      settings.customMarginMm,
      tempShort + 40
    );

    pageWidthMm = contentW + marginForFit * 2;
    pageHeightMm = contentH + marginForFit * 2;
    effectiveOrientation = pageWidthMm > pageHeightMm ? 'Landscape' : 'Portrait';
  } else {
    const baseSpec = PAPER_DIMENSIONS_MM[settings.paperSize];
    if (settings.orientation === 'Portrait') {
      effectiveOrientation = 'Portrait';
    } else if (settings.orientation === 'Landscape') {
      effectiveOrientation = 'Landscape';
    } else {
      effectiveOrientation = rotatedImgWidthPx > rotatedImgHeightPx ? 'Landscape' : 'Portrait';
    }

    if (effectiveOrientation === 'Landscape') {
      pageWidthMm = Math.max(baseSpec.width, baseSpec.height);
      pageHeightMm = Math.min(baseSpec.width, baseSpec.height);
    } else {
      pageWidthMm = Math.min(baseSpec.width, baseSpec.height);
      pageHeightMm = Math.max(baseSpec.width, baseSpec.height);
    }
  }

  const shortSideMm = Math.min(pageWidthMm, pageHeightMm);
  const marginMm = resolveMarginMm(settings.marginPreset, settings.customMarginMm, shortSideMm);

  const printableWidthMm = Math.max(10, pageWidthMm - marginMm * 2);
  const printableHeightMm = Math.max(10, pageHeightMm - marginMm * 2);
  const printableAspect = printableWidthMm / printableHeightMm;

  let drawWidthMm: number;
  let drawHeightMm: number;
  let isCropped = false;

  if (settings.paperSize === 'FitToImage') {
    drawWidthMm = printableWidthMm;
    drawHeightMm = printableHeightMm;
  } else if (settings.placement === 'FillPage') {
    if (imgAspect > printableAspect) {
      drawHeightMm = printableHeightMm;
      drawWidthMm = printableHeightMm * imgAspect;
    } else {
      drawWidthMm = printableWidthMm;
      drawHeightMm = printableWidthMm / imgAspect;
    }
    isCropped =
      Math.abs(drawWidthMm - printableWidthMm) > 0.5 ||
      Math.abs(drawHeightMm - printableHeightMm) > 0.5;
  } else if (settings.placement === 'OriginalProportions') {
    const nativeWidthMm = (rotatedImgWidthPx / 300) * 25.4;
    const nativeHeightMm = (rotatedImgHeightPx / 300) * 25.4;
    const scaleDown = Math.min(
      1,
      printableWidthMm / Math.max(1, nativeWidthMm),
      printableHeightMm / Math.max(1, nativeHeightMm)
    );
    drawWidthMm = nativeWidthMm * scaleDown;
    drawHeightMm = nativeHeightMm * scaleDown;
  } else {
    if (imgAspect > printableAspect) {
      drawWidthMm = printableWidthMm;
      drawHeightMm = printableWidthMm / imgAspect;
    } else {
      drawHeightMm = printableHeightMm;
      drawWidthMm = printableWidthMm / imgAspect;
    }
  }

  const drawXMm = marginMm + (printableWidthMm - drawWidthMm) / 2;
  const drawYMm = marginMm + (printableHeightMm - drawHeightMm) / 2;

  const pageWidthPt = pageWidthMm * MM_TO_PT;
  const pageHeightPt = pageHeightMm * MM_TO_PT;
  const marginPt = marginMm * MM_TO_PT;
  const printableWidthPt = printableWidthMm * MM_TO_PT;
  const printableHeightPt = printableHeightMm * MM_TO_PT;
  const drawWidthPt = drawWidthMm * MM_TO_PT;
  const drawHeightPt = drawHeightMm * MM_TO_PT;
  const drawXPt = drawXMm * MM_TO_PT;
  const drawYPt = pageHeightPt - drawYMm * MM_TO_PT - drawHeightPt;

  return {
    pageWidthMm,
    pageHeightMm,
    pageWidthPt,
    pageHeightPt,
    marginMm,
    marginPt,
    printableWidthMm,
    printableHeightMm,
    printableWidthPt,
    printableHeightPt,
    effectiveOrientation,
    rotatedImgWidthPx,
    rotatedImgHeightPx,
    drawXMm,
    drawYMm,
    drawWidthMm,
    drawHeightMm,
    drawXPt,
    drawYPt,
    drawWidthPt,
    drawHeightPt,
    isCropped,
  };
}

export function sanitizeFilename(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return 'Seyi-folio-document.pdf';
  }
  const cleaned = trimmed
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim();

  if (!cleaned) {
    return 'Seyi-folio-document.pdf';
  }

  if (cleaned.toLowerCase().endsWith('.pdf')) {
    const base = cleaned.slice(0, -4).trim();
    return base ? `${base}.pdf` : 'Seyi-folio-document.pdf';
  }

  return `${cleaned}.pdf`;
}

export function parseHexToRgbNormalized(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return {
      r: Number.isFinite(r) ? r : 1,
      g: Number.isFinite(g) ? g : 1,
      b: Number.isFinite(b) ? b : 1,
    };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return {
      r: Number.isFinite(r) ? r : 1,
      g: Number.isFinite(g) ? g : 1,
      b: Number.isFinite(b) ? b : 1,
    };
  }
  return { r: 1, g: 1, b: 1 };
}

export function estimatePdfSizeBytes(images: FolioImage[], settings: DocumentSettings): number {
  if (images.length === 0) return 0;
  let total = 14 * 1024;
  const compMultiplier =
    settings.compressionLevel === 'high'
      ? 0.35
      : settings.compressionLevel === 'balanced'
      ? 0.65
      : 1.0;

  for (const img of images) {
    const cropFactor = img.crop && !isFullCrop(img.crop) ? img.crop.width * img.crop.height : 1;
    const baseBytes = img.sizeBytes * cropFactor * compMultiplier;
    total += Math.min(baseBytes, 2.5 * 1024 * 1024);
  }
  return Math.round(Math.max(25 * 1024, total));
}

async function decodeImageSource(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback
    }
  }

  const objectUrl = URL.createObjectURL(file);
  const htmlImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode "${file.name}" during PDF creation.`));
    };
    el.src = objectUrl;
  });

  return {
    source: htmlImg,
    width: htmlImg.naturalWidth || htmlImg.width,
    height: htmlImg.naturalHeight || htmlImg.height,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
}

async function prepareImageForPdf(
  img: FolioImage,
  settings: DocumentSettings
): Promise<{ bytes: Uint8Array; format: 'png' | 'jpg' }> {
  const hasActiveCrop = Boolean(img.crop && !isFullCrop(img.crop));
  const isOriginalMode =
    settings.quality === 'Original' && settings.compressionLevel === 'none';

  const canDirectEmbedJpg =
    img.mimeType === 'image/jpeg' &&
    img.rotation === 0 &&
    !hasActiveCrop &&
    isOriginalMode;

  if (canDirectEmbedJpg) {
    const ab = await img.file.arrayBuffer();
    return { bytes: new Uint8Array(ab), format: 'jpg' };
  }

  const canDirectEmbedPng =
    img.mimeType === 'image/png' &&
    img.rotation === 0 &&
    !hasActiveCrop &&
    !img.hasTransparency &&
    isOriginalMode;

  if (canDirectEmbedPng) {
    const ab = await img.file.arrayBuffer();
    return { bytes: new Uint8Array(ab), format: 'png' };
  }

  const decoded = await decodeImageSource(img.file);
  try {
    const isQuarterTurn = img.rotation === 90 || img.rotation === 270;
    const rotatedFullW = isQuarterTurn ? decoded.height : decoded.width;
    const rotatedFullH = isQuarterTurn ? decoded.width : decoded.height;

    const crop = img.crop && !isFullCrop(img.crop) ? img.crop : { x: 0, y: 0, width: 1, height: 1 };
    const croppedRawW = Math.max(1, Math.round(rotatedFullW * crop.width));
    const croppedRawH = Math.max(1, Math.round(rotatedFullH * crop.height));

    let maxLongEdge = Math.max(croppedRawW, croppedRawH);
    if (settings.compressionLevel === 'high') {
      maxLongEdge = Math.min(maxLongEdge, 1400);
    } else if (settings.compressionLevel === 'balanced' || settings.quality === 'Balanced') {
      maxLongEdge = Math.min(maxLongEdge, 2100);
    } else {
      maxLongEdge = Math.min(maxLongEdge, 5200);
    }

    const scale = Math.min(1, maxLongEdge / Math.max(1, croppedRawW, croppedRawH));
    const targetW = Math.max(1, Math.round(croppedRawW * scale));
    const targetH = Math.max(1, Math.round(croppedRawH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize canvas for PDF rendering.');
    }

    ctx.fillStyle = settings.backgroundColor || '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    const scaledFullRotW = rotatedFullW * scale;
    const scaledFullRotH = rotatedFullH * scale;
    const offsetX = -crop.x * scaledFullRotW;
    const offsetY = -crop.y * scaledFullRotH;

    ctx.save();
    ctx.translate(offsetX + scaledFullRotW / 2, offsetY + scaledFullRotH / 2);
    ctx.rotate((img.rotation * Math.PI) / 180);

    const drawW = isQuarterTurn ? scaledFullRotH : scaledFullRotW;
    const drawH = isQuarterTurn ? scaledFullRotW : scaledFullRotH;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(decoded.source, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    const useLosslessPng =
      img.mimeType === 'image/png' &&
      settings.compressionLevel === 'none' &&
      settings.quality !== 'SmallerFile';

    const outMime = useLosslessPng ? 'image/png' : 'image/jpeg';
    let jpgQuality = 0.92;
    if (settings.compressionLevel === 'high') {
      jpgQuality = 0.75;
    } else if (settings.compressionLevel === 'balanced') {
      jpgQuality = 0.85;
    }

    const outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`Failed to encode "${img.name}" for PDF.`));
        },
        outMime,
        outMime === 'image/jpeg' ? jpgQuality : undefined
      );
    });

    canvas.width = 1;
    canvas.height = 1;

    const ab = await outBlob.arrayBuffer();
    return {
      bytes: new Uint8Array(ab),
      format: useLosslessPng ? 'png' : 'jpg',
    };
  } finally {
    decoded.cleanup();
  }
}

export async function generatePdfDocument(
  images: FolioImage[],
  settings: DocumentSettings,
  onProgress: (currentPage: number, totalPages: number) => void,
  abortSignal?: AbortSignal
): Promise<GeneratedPdfResult> {
  if (images.length === 0) {
    throw new Error('Add at least one image before creating a PDF.');
  }

  const pdfDoc = await PDFDocument.create();
  const sanitizedName = sanitizeFilename(settings.filename);
  pdfDoc.setTitle(sanitizedName.replace(/\.pdf$/i, ''));
  pdfDoc.setCreator('SeyiFolio — Every image. One document.');
  pdfDoc.setProducer('SeyiFolio Local Browser PDF Engine');
  pdfDoc.setCreationDate(new Date());

  const bgRgb = parseHexToRgbNormalized(settings.backgroundColor);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 0; i < images.length; i++) {
    if (abortSignal?.aborted) {
      throw new DOMException('PDF generation was cancelled.', 'AbortError');
    }

    onProgress(i + 1, images.length);
    const img = images[i];
    const geometry = calculatePageGeometry(img, settings);

    const { bytes, format } = await prepareImageForPdf(img, settings);

    if (abortSignal?.aborted) {
      throw new DOMException('PDF generation was cancelled.', 'AbortError');
    }

    const embeddedImage =
      format === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

    const page = pdfDoc.addPage([geometry.pageWidthPt, geometry.pageHeightPt]);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: geometry.pageWidthPt,
      height: geometry.pageHeightPt,
      color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
    });

    if (geometry.isCropped) {
      page.pushOperators(
        pushGraphicsState(),
        rectangle(
          geometry.marginPt,
          geometry.marginPt,
          geometry.printableWidthPt,
          geometry.printableHeightPt
        ),
        clip(),
        endPath()
      );
    }

    page.drawImage(embeddedImage, {
      x: geometry.drawXPt,
      y: geometry.drawYPt,
      width: geometry.drawWidthPt,
      height: geometry.drawHeightPt,
    });

    if (geometry.isCropped) {
      page.pushOperators(popGraphicsState());
    }

    const wm = settings.watermark;
    if (wm.enabled && wm.text.trim().length > 0) {
      const wmRgb = parseHexToRgbNormalized(wm.color);
      const text = wm.text.trim();
      const fontSize = wm.fontSize || 28;
      const opacity = Math.max(0.05, Math.min(1, wm.opacity));
      const textWidth = helveticaFont.widthOfTextAtSize(text, fontSize);

      page.pushOperators(pushGraphicsState());

      if (wm.position === 'diagonal') {
        page.drawText(text, {
          x: geometry.pageWidthPt / 2 - textWidth / 2,
          y: geometry.pageHeightPt / 2,
          size: fontSize,
          font: helveticaFont,
          color: rgb(wmRgb.r, wmRgb.g, wmRgb.b),
          opacity,
          rotate: degrees(30),
        });
      } else {
        let wx = geometry.marginPt + 12;
        let wy = geometry.marginPt + 12;

        if (wm.position === 'bottom-left') {
          wx = geometry.marginPt + 12;
          wy = geometry.marginPt + 12;
        } else if (wm.position === 'bottom-right') {
          wx = geometry.pageWidthPt - geometry.marginPt - textWidth - 12;
          wy = geometry.marginPt + 12;
        } else if (wm.position === 'top-left') {
          wx = geometry.marginPt + 12;
          wy = geometry.pageHeightPt - geometry.marginPt - fontSize - 12;
        } else if (wm.position === 'top-right') {
          wx = geometry.pageWidthPt - geometry.marginPt - textWidth - 12;
          wy = geometry.pageHeightPt - geometry.marginPt - fontSize - 12;
        } else if (wm.position === 'center') {
          wx = geometry.pageWidthPt / 2 - textWidth / 2;
          wy = geometry.pageHeightPt / 2 - fontSize / 2;
        }

        page.drawText(text, {
          x: wx,
          y: wy,
          size: fontSize,
          font: helveticaFont,
          color: rgb(wmRgb.r, wmRgb.g, wmRgb.b),
          opacity,
        });
      }

      page.pushOperators(popGraphicsState());
    }

    if (i % 3 === 2) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (abortSignal?.aborted) {
    throw new DOMException('PDF generation was cancelled.', 'AbortError');
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  const result: GeneratedPdfResult = {
    blobUrl,
    filename: sanitizedName,
    sizeBytes: blob.size,
    pageCount: images.length,
    createdAt: Date.now(),
  };

  // Automatically record download / generation analytics locally and globally
  recordDownloadAnalytics(result, settings);

  return result;
}

/**
 * Automatically records download telemetry (visitor action, page count, file size, compression level)
 * to localStorage and dispatches standard web analytics events.
 */
function recordDownloadAnalytics(result: GeneratedPdfResult, settings: DocumentSettings) {
  try {
    const eventData = {
      timestamp: new Date().toISOString(),
      filename: result.filename,
      pageCount: result.pageCount,
      sizeBytes: result.sizeBytes,
      sizeFormatted: formatBytesProxy(result.sizeBytes),
      compressionLevel: settings.compressionLevel,
      paperSize: settings.paperSize,
    };

    // 1. Record to localStorage so you can inspect analytics locally anytime in browser console / localStorage
    const existingLogsStr = localStorage.getItem('seyifolio_download_analytics');
    const logs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
    logs.unshift(eventData);
    // Keep last 100 downloads
    if (logs.length > 100) logs.pop();
    localStorage.setItem('seyifolio_download_analytics', JSON.stringify(logs));

    // 2. Automatically dispatch standard Vercel / Google Analytics events if window.gtag or window.va exists
    const win = window as any;
    if (typeof win.gtag === 'function') {
      win.gtag('event', 'pdf_download', {
        event_category: 'Conversion',
        event_label: result.filename,
        value: result.pageCount,
        file_size_bytes: result.sizeBytes,
      });
    }
    if (typeof win.va === 'function') {
      win.va('event', { name: 'pdf_download', data: eventData });
    }
  } catch {
    // Fail silently so export is never disrupted
  }
}

function formatBytesProxy(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

export function triggerFastPdfDownload(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = sanitizeFilename(filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
