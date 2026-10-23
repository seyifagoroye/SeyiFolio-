import { CropRect, FolioImage, RotationAngle, SupportedMimeType, ValidationIssue } from '../types/folio';

const THUMBNAIL_MAX_DIMENSION = 360;
const MAX_SINGLE_FILE_BYTES = 120 * 1024 * 1024; // 120 MB safety threshold per image
const MAX_DIMENSION_PX = 16384; // Browser canvas hardware limit guard

export function isFullCrop(crop?: CropRect): boolean {
  if (!crop) return true;
  return (
    crop.x <= 0.002 &&
    crop.y <= 0.002 &&
    crop.width >= 0.996 &&
    crop.height >= 0.996
  );
}

export function rotateCropRect90CW(crop?: CropRect): CropRect | undefined {
  if (!crop || isFullCrop(crop)) return undefined;
  return {
    x: Math.max(0, Math.min(1, 1 - (crop.y + crop.height))),
    y: Math.max(0, Math.min(1, crop.x)),
    width: Math.max(0.01, Math.min(1, crop.height)),
    height: Math.max(0.01, Math.min(1, crop.width)),
  };
}

export function getEffectiveImageDimensions(image: FolioImage): {
  rotatedFullWidthPx: number;
  rotatedFullHeightPx: number;
  effectiveWidthPx: number;
  effectiveHeightPx: number;
} {
  const isQuarter = image.rotation === 90 || image.rotation === 270;
  const rotatedFullWidthPx = isQuarter ? image.height : image.width;
  const rotatedFullHeightPx = isQuarter ? image.width : image.height;

  if (!image.crop || isFullCrop(image.crop)) {
    return {
      rotatedFullWidthPx,
      rotatedFullHeightPx,
      effectiveWidthPx: rotatedFullWidthPx,
      effectiveHeightPx: rotatedFullHeightPx,
    };
  }

  return {
    rotatedFullWidthPx,
    rotatedFullHeightPx,
    effectiveWidthPx: Math.max(1, Math.round(rotatedFullWidthPx * image.crop.width)),
    effectiveHeightPx: Math.max(1, Math.round(rotatedFullHeightPx * image.crop.height)),
  };
}

/**
 * Generates a lightweight thumbnail URL showing the rotated and cropped image
 * so workspace list and grid cards display the exact cropped region.
 */
export async function generateCroppedThumbnailUrl(
  image: FolioImage,
  rotation: RotationAngle,
  crop?: CropRect
): Promise<string | undefined> {
  if (!crop || isFullCrop(crop)) {
    return undefined;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to load thumbnail for crop preview.'));
    el.src = image.thumbnailUrl;
  });

  const isQuarter = rotation === 90 || rotation === 270;
  const rotW = isQuarter ? img.naturalHeight || img.height : img.naturalWidth || img.width;
  const rotH = isQuarter ? img.naturalWidth || img.width : img.naturalHeight || img.height;

  // Render full rotated thumbnail to an intermediate canvas
  const rotCanvas = document.createElement('canvas');
  rotCanvas.width = Math.max(1, rotW);
  rotCanvas.height = Math.max(1, rotH);
  const rotCtx = rotCanvas.getContext('2d');
  if (!rotCtx) return undefined;

  rotCtx.save();
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((rotation * Math.PI) / 180);
  const drawW = isQuarter ? rotCanvas.height : rotCanvas.width;
  const drawH = isQuarter ? rotCanvas.width : rotCanvas.height;
  rotCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  rotCtx.restore();

  // Extract the normalized crop box
  const sx = Math.round(crop.x * rotCanvas.width);
  const sy = Math.round(crop.y * rotCanvas.height);
  const sw = Math.max(1, Math.round(crop.width * rotCanvas.width));
  const sh = Math.max(1, Math.round(crop.height * rotCanvas.height));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return undefined;

  outCtx.drawImage(rotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const blob = await new Promise<Blob | null>((resolve) =>
    outCanvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}

/**
 * Inspects the magic bytes (file header signature) to verify actual image format
 * regardless of what file extension the file was given.
 */
export async function detectActualMimeType(
  file: File
): Promise<SupportedMimeType | 'unsupported' | 'empty'> {
  if (file.size === 0) {
    return 'empty';
  }
  const headerSlice = file.slice(0, 12);
  const buffer = await headerSlice.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  if (bytes.length < 4) {
    return 'unsupported';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" (52 49 46 46) at 0..3 and "WEBP" (57 45 42 50) at 8..11
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return 'unsupported';
}

/**
 * Decodes an image file in the browser, validates its pixel dimensions,
 * checks for alpha transparency, and generates a compact thumbnail Blob URL.
 */
async function decodeAndCreateThumbnail(
  file: File,
  mimeType: SupportedMimeType
): Promise<{
  width: number;
  height: number;
  thumbnailUrl: string;
  hasTransparency: boolean;
  normalizedFile: File;
}> {
  let objectUrl = '';
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image data could not be decoded.'));
      element.src = objectUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('Image has invalid zero dimensions.');
    }

    if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
      throw new Error(
        `Image dimensions (${width} × ${height} px) exceed browser processing limits (${MAX_DIMENSION_PX} px).`
      );
    }

    // Bake EXIF orientation into a normalized full-size canvas and file
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = width;
    fullCanvas.height = height;
    const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: mimeType !== 'image/jpeg' });
    if (!fullCtx) {
      throw new Error('Browser canvas context unavailable.');
    }

    if (mimeType === 'image/jpeg') {
      fullCtx.fillStyle = '#FFFFFF';
      fullCtx.fillRect(0, 0, width, height);
    }
    fullCtx.drawImage(img, 0, 0, width, height);

    // Check for transparency in PNG / WebP
    let hasTransparency = false;
    if (mimeType === 'image/png' || mimeType === 'image/webp') {
      try {
        const imgData = fullCtx.getImageData(0, 0, Math.min(width, 400), Math.min(height, 400)).data;
        for (let i = 3; i < imgData.length; i += 16) {
          if (imgData[i] < 250) {
            hasTransparency = true;
            break;
          }
        }
      } catch {
        hasTransparency = true;
      }
    }

    const normalizedBlob = await new Promise<Blob>((resolve, reject) => {
      fullCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to normalize image file.'));
        },
        mimeType === 'image/jpeg' ? 'image/jpeg' : mimeType === 'image/png' ? 'image/png' : 'image/webp',
        0.95
      );
    });

    const normalizedFile = new File([normalizedBlob], file.name, {
      type: mimeType,
      lastModified: file.lastModified,
    });

    // Generate lightweight thumbnail
    const scale = Math.min(1, THUMBNAIL_MAX_DIMENSION / Math.max(width, height));
    const thumbW = Math.max(1, Math.round(width * scale));
    const thumbH = Math.max(1, Math.round(height * scale));

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext('2d');
    if (thumbCtx) {
      if (mimeType === 'image/jpeg') {
        thumbCtx.fillStyle = '#FFFFFF';
        thumbCtx.fillRect(0, 0, thumbW, thumbH);
      }
      thumbCtx.drawImage(fullCanvas, 0, 0, thumbW, thumbH);
    }

    const thumbBlob = await new Promise<Blob>((resolve, reject) => {
      thumbCanvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail preview.'));
        },
        mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        0.85
      );
    });

    const thumbnailUrl = URL.createObjectURL(thumbBlob);
    return {
      width,
      height,
      thumbnailUrl,
      hasTransparency,
      normalizedFile,
    };
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export async function processUploadedFiles(
  files: FileList | File[],
  onProgress?: (processed: number, total: number) => void
): Promise<{
  validImages: FolioImage[];
  issues: ValidationIssue[];
}> {
  const fileArray = Array.from(files);
  const validImages: FolioImage[] = [];
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    onProgress?.(i + 1, fileArray.length);

    if (file.size === 0) {
      issues.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name || 'Unnamed file',
        reason: 'File is empty (0 bytes).',
      });
      continue;
    }

    if (file.size > MAX_SINGLE_FILE_BYTES) {
      issues.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        reason: 'File exceeds the 120 MB single-image memory limit.',
      });
      continue;
    }

    try {
      const detectedMime = await detectActualMimeType(file);
      if (detectedMime === 'empty') {
        issues.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          reason: 'File is empty.',
        });
        continue;
      }

      if (detectedMime === 'unsupported') {
        const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
        const isRenamedImageExt = ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
        issues.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          reason: isRenamedImageExt
            ? 'File has an image extension but does not contain valid JPG, PNG, or WebP data.'
            : 'Unsupported file format. Only JPG, PNG, and WebP images are supported.',
        });
        continue;
      }

      const { width, height, thumbnailUrl, hasTransparency, normalizedFile } = await decodeAndCreateThumbnail(
        file,
        detectedMime
      );

      validImages.push({
        id: `img-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        file: normalizedFile,
        name: file.name,
        sizeBytes: normalizedFile.size,
        mimeType: detectedMime,
        width,
        height,
        rotation: 0,
        thumbnailUrl,
        hasTransparency,
        addedAt: Date.now() + i,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Corrupted or unreadable image file.';
      issues.push({
        id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        reason: message,
      });
    }

    // Yield briefly every 8 images to keep UI responsive
    if (i % 8 === 7) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  return { validImages, issues };
}

export function revokeImageResources(images: FolioImage[]): void {
  for (const img of images) {
    if (img.thumbnailUrl) {
      try {
        URL.revokeObjectURL(img.thumbnailUrl);
      } catch {
        // Ignore
      }
    }
    if (img.croppedThumbnailUrl) {
      try {
        URL.revokeObjectURL(img.croppedThumbnailUrl);
      } catch {
        // Ignore
      }
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  return `${val < 10 && i > 0 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

/**
 * Generates crisp, high-resolution sample black-and-white line art drawings
 * locally on device so users can test the Colouring Book & general PDF workflow immediately.
 */
export async function generateSampleLineArtFiles(): Promise<File[]> {
  const specs: Array<{
    name: string;
    width: number;
    height: number;
    title: string;
    motif: 'botanical' | 'mandala' | 'architecture' | 'landscape';
  }> = [
    {
      name: '01-botanical-fern-study.png',
      width: 1600,
      height: 2260,
      title: 'PLATE I — BOTANICAL STUDY',
      motif: 'botanical',
    },
    {
      name: '02-geometric-rosette-mandala.png',
      width: 1600,
      height: 2260,
      title: 'PLATE II — GEOMETRIC ROSETTE',
      motif: 'mandala',
    },
    {
      name: '03-glasshouse-conservatory-elevation.png',
      width: 1600,
      height: 2260,
      title: 'PLATE III — CONSERVATORY ARCH',
      motif: 'architecture',
    },
    {
      name: '04-alpine-valley-panorama-wide.png',
      width: 2260,
      height: 1600,
      title: 'PLATE IV — ALPINE PANORAMA (WIDE)',
      motif: 'landscape',
    },
  ];

  const files: File[] = [];

  for (const spec of specs) {
    const canvas = document.createElement('canvas');
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, spec.width, spec.height);

    ctx.strokeStyle = '#18181B';
    ctx.fillStyle = '#18181B';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pad = 90;
    ctx.lineWidth = 4;
    ctx.strokeRect(pad, pad, spec.width - pad * 2, spec.height - pad * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad + 14, pad + 14, spec.width - (pad + 14) * 2, spec.height - (pad + 14) * 2);

    const cx = spec.width / 2;
    const cy = spec.height / 2 - 30;

    if (spec.motif === 'botanical') {
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy + 620);
      ctx.quadraticCurveTo(cx - 30, cy, cx + 15, cy - 600);
      ctx.stroke();

      for (let i = -5; i <= 5; i++) {
        const y = cy + i * 100;
        const reach = (6.5 - Math.abs(i)) * 75;
        for (const dir of [-1, 1]) {
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.bezierCurveTo(
            cx + dir * reach * 0.45,
            y - 95,
            cx + dir * reach * 0.9,
            y - 75,
            cx + dir * reach,
            y - 25
          );
          ctx.bezierCurveTo(
            cx + dir * reach * 0.85,
            y + 35,
            cx + dir * reach * 0.35,
            y + 30,
            cx,
            y
          );
          ctx.stroke();

          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(cx, y);
          ctx.quadraticCurveTo(cx + dir * reach * 0.5, y - 35, cx + dir * reach * 0.92, y - 24);
          ctx.stroke();
        }
      }
    } else if (spec.motif === 'mandala') {
      const radii = [110, 210, 320, 440, 560];
      for (const r of radii) {
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      const petals = 16;
      for (let p = 0; p < petals; p++) {
        const angle = (p * Math.PI * 2) / petals;
        const nextAngle = ((p + 0.5) * Math.PI * 2) / petals;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 110, cy + Math.sin(angle) * 110);
        ctx.quadraticCurveTo(
          cx + Math.cos(nextAngle) * 640,
          cy + Math.sin(nextAngle) * 640,
          cx + Math.cos(angle) * 560,
          cy + Math.sin(angle) * 560
        );
        ctx.stroke();
      }
    } else if (spec.motif === 'architecture') {
      const archW = 860;
      const archH = 1160;
      const left = cx - archW / 2;
      const bottom = cy + archH / 2;
      const archSpringY = cy - 120;

      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(left, bottom);
      ctx.lineTo(left, archSpringY);
      ctx.arc(cx, archSpringY, archW / 2, Math.PI, 0, false);
      ctx.lineTo(left + archW, bottom);
      ctx.closePath();
      ctx.stroke();

      for (let col = 1; col < 6; col++) {
        const x = left + (archW * col) / 6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, archSpringY);
        ctx.stroke();
      }
      for (let row = 1; row <= 4; row++) {
        const y = archSpringY + ((bottom - archSpringY) * row) / 5;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + archW, y);
        ctx.stroke();
      }
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, archSpringY - 10, archW / 3, Math.PI, 0, false);
      ctx.stroke();
    } else {
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx + 340, cy - 220, 110, 0, Math.PI * 2);
      ctx.stroke();

      const ridges = [
        [
          [pad + 14, cy + 160],
          [cx - 480, cy - 300],
          [cx - 80, cy + 40],
          [cx + 320, cy - 260],
          [spec.width - pad - 14, cy + 140],
        ],
        [
          [pad + 14, cy + 280],
          [cx - 620, cy - 80],
          [cx - 180, cy - 210],
          [cx + 210, cy + 60],
          [cx + 580, cy - 120],
          [spec.width - pad - 14, cy + 260],
        ],
      ];
      for (const ridge of ridges) {
        ctx.beginPath();
        ctx.moveTo(ridge[0][0], ridge[0][1]);
        for (let idx = 1; idx < ridge.length; idx++) {
          ctx.lineTo(ridge[idx][0], ridge[idx][1]);
        }
        ctx.stroke();
      }
    }

    ctx.font = '500 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(spec.title, cx, spec.height - pad - 48);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (blob) {
      files.push(new File([blob], spec.name, { type: 'image/png' }));
    }
  }

  return files;
}
