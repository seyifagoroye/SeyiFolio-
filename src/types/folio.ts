export type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type RotationAngle = 0 | 90 | 180 | 270;

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WatermarkSettings {
  enabled: boolean;
  text: string;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'diagonal';
  opacity: number; // 0.1 to 1.0
  fontSize: number; // pt
  color: string; // hex
  scope: 'all' | 'selected';
}

export interface FolioImage {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  mimeType: SupportedMimeType;
  width: number;
  height: number;
  rotation: RotationAngle;
  crop?: CropRect;
  thumbnailUrl: string;
  croppedThumbnailUrl?: string;
  hasTransparency: boolean;
  addedAt: number;
}

export interface ValidationIssue {
  id: string;
  fileName: string;
  reason: string;
}

export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal' | 'FitToImage';

export type PageOrientation = 'Auto' | 'Portrait' | 'Landscape';

export type ImagePlacement = 'FitToPage' | 'FillPage' | 'OriginalProportions';

export type MarginPreset = 'None' | 'Small' | 'Standard' | 'Custom';

export type ImageQuality = 'Original' | 'Balanced' | 'SmallerFile';

export type CompressionLevel = 'none' | 'balanced' | 'high';

export interface DocumentSettings {
  paperSize: PaperSize;
  orientation: PageOrientation;
  placement: ImagePlacement;
  marginPreset: MarginPreset;
  customMarginMm: number;
  backgroundColor: string;
  quality: ImageQuality;
  compressionLevel: CompressionLevel;
  watermark: WatermarkSettings;
  colouringBookPresetActive: boolean;
  filename: string;
}

export interface PageGeometry {
  pageWidthMm: number;
  pageHeightMm: number;
  pageWidthPt: number;
  pageHeightPt: number;
  marginMm: number;
  marginPt: number;
  printableWidthMm: number;
  printableHeightMm: number;
  printableWidthPt: number;
  printableHeightPt: number;
  effectiveOrientation: 'Portrait' | 'Landscape';
  rotatedImgWidthPx: number;
  rotatedImgHeightPx: number;
  drawXMm: number;
  drawYMm: number;
  drawWidthMm: number;
  drawHeightMm: number;
  drawXPt: number;
  drawYPt: number;
  drawWidthPt: number;
  drawHeightPt: number;
  isCropped: boolean;
}

export interface GeneratedPdfResult {
  blobUrl: string;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  createdAt: number;
}
