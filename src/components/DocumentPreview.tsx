import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ArrowLeft,
  Maximize2,
  Eye,
  Crop,
  FileText,
} from 'lucide-react';
import { DocumentSettings, FolioImage } from '../types/folio';
import { isFullCrop } from '../utils/imageProcessor';
import { calculatePageGeometry } from '../utils/pdfEngine';

interface DocumentPreviewProps {
  images: FolioImage[];
  settings: DocumentSettings;
  activePageIndex: number;
  onChangePageIndex: (index: number) => void;
  onRotateImage: (id: string) => void;
  onOpenCropModal: (id: string) => void;
  onReturnToWorkspace: () => void;
}

const ZOOM_STEPS = [0.3, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

interface SinglePageCanvasProps {
  image: FolioImage;
  pageNumber: number;
  totalPages: number;
  settings: DocumentSettings;
  zoom: number;
  showMarginGuides: boolean;
}

const SinglePageCanvas: React.FC<SinglePageCanvasProps> = ({
  image,
  pageNumber,
  totalPages,
  settings,
  zoom,
  showMarginGuides,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(true);

  useEffect(() => {
    if (!image || !image.file || !canvasRef.current) return;

    let isCancelled = false;
    let tempUrl = '';
    setIsRendering(true);
    setRenderError(null);

    const renderCanvas = async () => {
      try {
        if (!(image.file instanceof File) && !(image.file instanceof Blob)) {
          throw new Error('Image file reference is invalid or expired.');
        }

        tempUrl = URL.createObjectURL(image.file);
        const imgEl = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to decode image data for preview.'));
          el.src = tempUrl;
        });

        if (isCancelled || !canvasRef.current) return;

        const geometry = calculatePageGeometry(image, settings);
        const canvas = canvasRef.current;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pxPerMm = 2.4 * zoom;
        const cssWidth = Math.round(geometry.pageWidthMm * pxPerMm);
        const cssHeight = Math.round(geometry.pageHeightMm * pxPerMm);

        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        canvas.width = Math.round(cssWidth * dpr);
        canvas.height = Math.round(cssHeight * dpr);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas rendering context unavailable.');
        }

        ctx.save();
        ctx.scale(dpr * pxPerMm, dpr * pxPerMm);

        // 1. Page background colour
        ctx.fillStyle = settings.backgroundColor || '#FFFFFF';
        ctx.fillRect(0, 0, geometry.pageWidthMm, geometry.pageHeightMm);

        // 2. Clip to printable area
        ctx.save();
        if (geometry.isCropped) {
          ctx.beginPath();
          ctx.rect(
            geometry.marginMm,
            geometry.marginMm,
            geometry.printableWidthMm,
            geometry.printableHeightMm
          );
          ctx.clip();
        }

        const crop =
          image.crop && !isFullCrop(image.crop)
            ? image.crop
            : { x: 0, y: 0, width: 1, height: 1 };

        ctx.beginPath();
        ctx.rect(
          geometry.drawXMm,
          geometry.drawYMm,
          geometry.drawWidthMm,
          geometry.drawHeightMm
        );
        ctx.clip();

        // 3. Draw rotated & cropped image
        const fullRotDrawW = geometry.drawWidthMm / crop.width;
        const fullRotDrawH = geometry.drawHeightMm / crop.height;
        const fullRotTopLeftX = geometry.drawXMm - crop.x * fullRotDrawW;
        const fullRotTopLeftY = geometry.drawYMm - crop.y * fullRotDrawH;

        const centerX = fullRotTopLeftX + fullRotDrawW / 2;
        const centerY = fullRotTopLeftY + fullRotDrawH / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((image.rotation * Math.PI) / 180);

        const isQuarterTurn = image.rotation === 90 || image.rotation === 270;
        const unrotatedDrawW = isQuarterTurn ? fullRotDrawH : fullRotDrawW;
        const unrotatedDrawH = isQuarterTurn ? fullRotDrawW : fullRotDrawH;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(
          imgEl,
          -unrotatedDrawW / 2,
          -unrotatedDrawH / 2,
          unrotatedDrawW,
          unrotatedDrawH
        );
        ctx.restore();

        // 4. Margin guides
        if (showMarginGuides && geometry.marginMm > 0) {
          ctx.save();
          ctx.strokeStyle = 'rgba(53, 89, 217, 0.38)';
          ctx.lineWidth = 0.35 / zoom;
          ctx.setLineDash([2 / zoom, 2 / zoom]);
          ctx.strokeRect(
            geometry.marginMm,
            geometry.marginMm,
            geometry.printableWidthMm,
            geometry.printableHeightMm
          );
          ctx.restore();
        }

        ctx.restore();
        setIsRendering(false);
      } catch (err) {
        if (!isCancelled) {
          setRenderError(
            err instanceof Error ? err.message : 'Preview unavailable for this image.'
          );
          setIsRendering(false);
        }
      } finally {
        if (tempUrl) {
          URL.revokeObjectURL(tempUrl);
        }
      }
    };

    renderCanvas();

    return () => {
      isCancelled = true;
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
      }
    };
  }, [image, settings, zoom, showMarginGuides]);

  return (
    <div className="flex flex-col items-center mb-8 last:mb-2">
      <div className="mb-2 flex items-center justify-between w-full max-w-xl px-1 text-xs text-[#6B7280] font-mono tabular-nums">
        <span className="font-medium text-[#202124] truncate max-w-[240px]" title={image.name}>
          {image.name}
        </span>
        <span>
          Page {pageNumber} of {totalPages}
        </span>
      </div>

      <div className="relative bg-white shadow-md border border-[#D1D5DB] rounded overflow-hidden">
        {renderError ? (
          <div className="w-[300px] h-[400px] flex flex-col items-center justify-center p-6 text-center bg-[#FAFAF9]">
            <p className="text-xs font-medium text-[#B91C1C] mb-1">Preview error</p>
            <p className="text-[11px] text-[#6B7280]">{renderError}</p>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="block bg-white transition-opacity duration-150"
            style={{ opacity: isRendering ? 0.6 : 1 }}
          />
        )}
      </div>
    </div>
  );
};

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  images,
  settings,
  activePageIndex,
  onChangePageIndex,
  onRotateImage,
  onOpenCropModal,
  onReturnToWorkspace,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [showMarginGuides, setShowMarginGuides] = useState<boolean>(true);

  const safeIndex = Math.min(Math.max(0, activePageIndex), Math.max(0, images.length - 1));
  const currentImage = images[safeIndex];

  const handleZoomOut = () => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    const prevIdx = Math.max(0, idx - 1);
    setZoom(ZOOM_STEPS[prevIdx]);
  };

  const handleZoomIn = () => {
    const idx = ZOOM_STEPS.findIndex((z) => z >= zoom);
    const nextIdx = Math.min(ZOOM_STEPS.length - 1, idx === -1 ? ZOOM_STEPS.length - 1 : idx + 1);
    setZoom(ZOOM_STEPS[nextIdx]);
  };

  if (!currentImage || images.length === 0) {
    return null;
  }

  const geometry = calculatePageGeometry(currentImage, settings);
  const hasUserCrop = Boolean(currentImage.crop && !isFullCrop(currentImage.crop));

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
      {/* Top Preview Control Bar */}
      <div className="px-4 py-3 border-b border-[#E5E7EB] bg-[#FAFAF9] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReturnToWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3559D9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Back to pages</span>
          </button>

          <div className="h-4 w-px bg-[#E5E7EB] hidden sm:block" />

          {/* Page Navigation */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangePageIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              aria-label="Previous page"
              className="p-1.5 text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-1.5 px-2 text-xs font-medium text-[#202124] tabular-nums whitespace-nowrap">
              <span>Page</span>
              <select
                aria-label="Select page number"
                value={safeIndex}
                onChange={(e) => onChangePageIndex(Number(e.target.value))}
                className="bg-white border border-[#E5E7EB] rounded px-1.5 py-0.5 text-xs font-mono tabular-nums text-[#202124] focus:outline-none focus:border-[#3559D9]"
              >
                {images.map((img, idx) => (
                  <option key={img.id} value={idx}>
                    {idx + 1}
                  </option>
                ))}
              </select>
              <span className="text-[#6B7280]">of {images.length}</span>
            </div>

            <button
              type="button"
              onClick={() => onChangePageIndex(Math.min(images.length - 1, safeIndex + 1))}
              disabled={safeIndex >= images.length - 1}
              aria-label="Next page"
              className="p-1.5 text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Zoom and Page Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowMarginGuides((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showMarginGuides
                ? 'bg-[#EEF2FF] text-[#3559D9] border-[#3559D9]/30'
                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#202124]'
            }`}
            title="Toggle printable margin guide lines in preview"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Margin guides</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenCropModal(currentImage.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              hasUserCrop
                ? 'bg-[#EEF2FF] text-[#3559D9] border-[#3559D9]/30'
                : 'text-[#202124] bg-white border-[#E5E7EB] hover:bg-[#F3F4F6]'
            }`}
            title="Crop this image"
          >
            <Crop className="w-3.5 h-3.5" />
            <span>{hasUserCrop ? 'Edit crop' : 'Crop'}</span>
          </button>

          <button
            type="button"
            onClick={() => onRotateImage(currentImage.id)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Rotate 90° clockwise"
          >
            <RotateCw className="w-3.5 h-3.5 text-[#6B7280]" />
            <span>Rotate 90°</span>
          </button>

          <div className="flex items-center bg-white border border-[#E5E7EB] rounded-md">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoom <= ZOOM_STEPS[0]}
              aria-label="Zoom out"
              className="p-1.5 text-[#202124] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset zoom to 100%"
              className="px-2 py-1 text-xs font-mono tabular-nums text-[#202124] hover:bg-[#F3F4F6] border-x border-[#E5E7EB] whitespace-nowrap cursor-pointer"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
              aria-label="Zoom in"
              className="p-1.5 text-[#202124] hover:bg-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Page Metadata Sub-bar */}
      <div className="px-4 py-2 bg-white border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-3.5 h-3.5 text-[#3559D9] shrink-0" />
          <span className="font-medium text-[#202124]">Continuous PDF Document View</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{images.length} pages</span>
        </div>

        <div className="flex items-center gap-2 font-mono tabular-nums whitespace-nowrap">
          <span>
            {settings.paperSize === 'FitToImage' ? 'Fit to image' : settings.paperSize} (
            {geometry.effectiveOrientation})
          </span>
          <span aria-hidden="true">·</span>
          <span>{geometry.marginMm} mm margin</span>
        </div>
      </div>

      {/* Continuous Vertical Scroll Viewport (Like a PDF Document Reader) */}
      <div className="p-6 sm:p-10 bg-[#E5E7EB] overflow-auto max-h-[720px] min-h-[460px] flex flex-col items-center">
        {images.map((img, idx) => (
          <SinglePageCanvas
            key={img.id}
            image={img}
            pageNumber={idx + 1}
            totalPages={images.length}
            settings={settings}
            zoom={zoom}
            showMarginGuides={showMarginGuides}
          />
        ))}
      </div>

      {/* Preview Footer Notice */}
      <div className="px-4 py-2.5 bg-[#FAFAF9] border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
        <span>
          Scroll normally to view all pages like a PDF document. Pinch or use zoom tools to resize.
        </span>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="inline-flex items-center gap-1 text-[#3559D9] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Reset to 100%</span>
          </button>
        )}
      </div>
    </div>
  );
};
