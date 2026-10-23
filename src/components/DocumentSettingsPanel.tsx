import React, { useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  FileOutput,
  Loader2,
  Pencil,
  Sliders,
  Type,
  X,
  Zap,
} from 'lucide-react';
import {
  CompressionLevel,
  DocumentSettings,
  FolioImage,
  GeneratedPdfResult,
  ImagePlacement,
  ImageQuality,
  MarginPreset,
  PageOrientation,
  PaperSize,
  WatermarkSettings,
} from '../types/folio';
import { formatBytes } from '../utils/imageProcessor';
import { estimatePdfSizeBytes, sanitizeFilename, triggerFastPdfDownload } from '../utils/pdfEngine';

interface DocumentSettingsPanelProps {
  images: FolioImage[];
  settings: DocumentSettings;
  onUpdateSettings: (partial: Partial<DocumentSettings>) => void;
  onRenameFilename: (filename: string) => void;
  onApplyColouringBookPreset: () => void;
  onCreatePdf: (autoDownload?: boolean) => void;
  onCancelGeneration: () => void;
  isGenerating: boolean;
  generationProgress: { current: number; total: number } | null;
  generatedPdf: GeneratedPdfResult | null;
  generationError: string | null;
}

const PAPER_SIZE_OPTIONS: Array<{ value: PaperSize; label: string; dimensions: string }> = [
  { value: 'A4', label: 'A4', dimensions: '210 × 297 mm' },
  { value: 'A3', label: 'A3', dimensions: '297 × 420 mm' },
  { value: 'Letter', label: 'Letter', dimensions: '215.9 × 279.4 mm' },
  { value: 'Legal', label: 'Legal', dimensions: '215.9 × 355.6 mm' },
  { value: 'FitToImage', label: 'Fit to image', dimensions: 'Matches image aspect' },
];

const ORIENTATION_OPTIONS: Array<{ value: PageOrientation; label: string }> = [
  { value: 'Auto', label: 'Auto' },
  { value: 'Portrait', label: 'Portrait' },
  { value: 'Landscape', label: 'Landscape' },
];

const PLACEMENT_OPTIONS: Array<{
  value: ImagePlacement;
  label: string;
  description: string;
}> = [
  {
    value: 'FitToPage',
    label: 'Fit to page',
    description: 'Fits the complete image inside the page margins without cropping.',
  },
  {
    value: 'FillPage',
    label: 'Fill page',
    description: 'Fills the printable area completely, cropping excess edges without stretching.',
  },
  {
    value: 'OriginalProportions',
    label: 'Original proportions',
    description: 'Places images at native 300 DPI print scale without enlarging smaller images.',
  },
];

const MARGIN_OPTIONS: Array<{ value: MarginPreset; label: string; mmText: string }> = [
  { value: 'None', label: 'No margins', mmText: '0 mm' },
  { value: 'Small', label: 'Small', mmText: '10 mm' },
  { value: 'Standard', label: 'Standard', mmText: '20 mm' },
  { value: 'Custom', label: 'Custom', mmText: 'Custom' },
];

const BACKGROUND_SWATCHES: Array<{ value: string; label: string }> = [
  { value: '#FFFFFF', label: 'White' },
  { value: '#FAF8F5', label: 'Warm paper' },
  { value: '#F5F0E6', label: 'Cream' },
  { value: '#F3F4F6', label: 'Soft grey' },
  { value: '#18181B', label: 'Charcoal' },
];

const QUALITY_OPTIONS: Array<{
  value: ImageQuality;
  label: string;
  note: string;
}> = [
  {
    value: 'Original',
    label: 'Original quality',
    note: 'Avoids downscaling. Preserves lossless PNG data for crisp black-and-white drawings and text.',
  },
  {
    value: 'Balanced',
    label: 'Balanced',
    note: 'Caps very large dimensions at 2400 px for reliable printing with moderate file sizes.',
  },
  {
    value: 'SmallerFile',
    label: 'Smaller file',
    note: 'Applies JPEG compression and scales large images to 1600 px for compact sharing.',
  },
];

const COMPRESSION_OPTIONS: Array<{
  value: CompressionLevel;
  label: string;
  desc: string;
}> = [
  { value: 'none', label: 'No compression', desc: 'Maximum fidelity, larger file size.' },
  { value: 'balanced', label: 'Smart compression', desc: 'Retains excellent quality with significantly smaller PDF size.' },
  { value: 'high', label: 'Maximum compression', desc: 'Smallest file size for fast emailing and sharing.' },
];

export const DocumentSettingsPanel: React.FC<DocumentSettingsPanelProps> = ({
  images,
  settings,
  onUpdateSettings,
  onRenameFilename,
  onApplyColouringBookPreset,
  onCreatePdf,
  onCancelGeneration,
  isGenerating,
  generationProgress,
  generatedPdf,
  generationError,
}) => {
  const filenameInputRef = useRef<HTMLInputElement | null>(null);
  const estimatedBytes = estimatePdfSizeBytes(images, settings);
  const sanitizedPreviewName = sanitizeFilename(settings.filename);

  const placementLabel =
    PLACEMENT_OPTIONS.find((p) => p.value === settings.placement)?.label || 'Fit to page';
  const paperLabel =
    PAPER_SIZE_OPTIONS.find((p) => p.value === settings.paperSize)?.label || 'A4';

  const firstImageBaseName =
    images.length > 0
      ? images[0].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, '-')
      : '';

  const handleSelectAndFocusFilename = () => {
    if (!filenameInputRef.current) return;
    filenameInputRef.current.focus();
    const val = filenameInputRef.current.value;
    const dotIndex = val.toLowerCase().lastIndexOf('.pdf');
    if (dotIndex > 0) {
      filenameInputRef.current.setSelectionRange(0, dotIndex);
    } else {
      filenameInputRef.current.select();
    }
  };

  const handleUpdateWatermark = (partial: Partial<WatermarkSettings>) => {
    onUpdateSettings({
      watermark: {
        ...settings.watermark,
        ...partial,
      },
    });
  };

  return (
    <aside aria-label="Document settings and export" className="space-y-5">
      {/* Settings Container */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg divide-y divide-[#E5E7EB]">
        {/* Panel Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#6B7280]" />
            <h2 className="text-sm font-semibold text-[#202124]">Document settings</h2>
          </div>
          <span className="text-xs text-[#6B7280] font-mono tabular-nums">
            {images.length} {images.length === 1 ? 'page' : 'pages'}
          </span>
        </div>

        {/* Colouring Book Preset */}
        <div className="px-5 py-4 bg-[#FAFAF9]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#3559D9] shrink-0" />
                <span className="text-xs font-semibold text-[#202124]">Colouring book preset</span>
              </div>
              <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">
                A4, 10 mm margins, white background, fit to page, and lossless outline preservation.
              </p>
            </div>
            <button
              type="button"
              onClick={onApplyColouringBookPreset}
              disabled={isGenerating}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                settings.colouringBookPresetActive
                  ? 'bg-[#EEF2FF] text-[#3559D9] border-[#3559D9]/40'
                  : 'bg-white text-[#202124] border-[#E5E7EB] hover:bg-[#F3F4F6]'
              }`}
            >
              {settings.colouringBookPresetActive ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Applied</span>
                </span>
              ) : (
                'Apply preset'
              )}
            </button>
          </div>
        </div>

        {/* Paper Size & Orientation */}
        <div className="px-5 py-4 space-y-4">
          <div>
            <label
              htmlFor="folio-paper-size"
              className="block text-xs font-medium text-[#202124] mb-1.5"
            >
              Paper size
            </label>
            <select
              id="folio-paper-size"
              value={settings.paperSize}
              disabled={isGenerating}
              onChange={(e) =>
                onUpdateSettings({
                  paperSize: e.target.value as PaperSize,
                  colouringBookPresetActive: false,
                })
              }
              className="w-full px-3 py-2 text-sm text-[#202124] bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:border-[#3559D9] disabled:opacity-50"
            >
              {PAPER_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.dimensions}
                </option>
              ))}
            </select>
            {settings.paperSize === 'FitToImage' && (
              <p className="mt-1.5 text-xs text-[#6B7280] leading-relaxed">
                Each page is sized individually to match its image’s aspect ratio plus selected margins. Mixed page dimensions are supported.
              </p>
            )}
          </div>

          {settings.paperSize !== 'FitToImage' && (
            <div>
              <span className="block text-xs font-medium text-[#202124] mb-1.5">Orientation</span>
              <div className="grid grid-cols-3 gap-1 p-1 bg-[#FAFAF9] border border-[#E5E7EB] rounded-md">
                {ORIENTATION_OPTIONS.map((opt) => {
                  const active = settings.orientation === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isGenerating}
                      onClick={() =>
                        onUpdateSettings({
                          orientation: opt.value,
                          colouringBookPresetActive: false,
                        })
                      }
                      className={`py-1.5 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-white text-[#202124] shadow-xs border border-[#E5E7EB]'
                          : 'text-[#6B7280] hover:text-[#202124]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Image Placement */}
        <div className="px-5 py-4">
          <span className="block text-xs font-medium text-[#202124] mb-2">Image placement</span>
          <div className="space-y-1.5">
            {PLACEMENT_OPTIONS.map((opt) => {
              const active = settings.placement === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    onUpdateSettings({
                      placement: opt.value,
                      colouringBookPresetActive: false,
                    })
                  }
                  className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#EEF2FF]/60 border-[#3559D9] text-[#202124]'
                      : 'bg-white border-[#E5E7EB] text-[#202124] hover:bg-[#FAFAF9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        active ? 'border-[#3559D9] bg-[#3559D9]' : 'border-[#D1D5DB]'
                      }`}
                    >
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">{opt.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Margins */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#202124]">Margins</span>
            <span className="text-xs font-mono tabular-nums text-[#6B7280]">
              {settings.marginPreset === 'None'
                ? '0 mm'
                : settings.marginPreset === 'Small'
                ? '10 mm'
                : settings.marginPreset === 'Standard'
                ? '20 mm'
                : `${settings.customMarginMm} mm`}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1 p-1 bg-[#FAFAF9] border border-[#E5E7EB] rounded-md">
            {MARGIN_OPTIONS.map((opt) => {
              const active = settings.marginPreset === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    onUpdateSettings({
                      marginPreset: opt.value,
                      colouringBookPresetActive: false,
                    })
                  }
                  className={`py-1.5 px-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#202124] shadow-xs border border-[#E5E7EB]'
                      : 'text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Page Background */}
        <div className="px-5 py-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#202124]">Page background</span>
            <span className="text-xs font-mono uppercase text-[#6B7280]">
              {settings.backgroundColor}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {BACKGROUND_SWATCHES.map((swatch) => {
              const active =
                settings.backgroundColor.toLowerCase() === swatch.value.toLowerCase();
              return (
                <button
                  key={swatch.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    onUpdateSettings({
                      backgroundColor: swatch.value,
                      colouringBookPresetActive: false,
                    })
                  }
                  title={`${swatch.label} (${swatch.value})`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'border-[#3559D9] bg-[#EEF2FF]/60 text-[#202124] font-medium'
                      : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-xs border border-[#D1D5DB] shrink-0"
                    style={{ backgroundColor: swatch.value }}
                  />
                  <span>{swatch.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Compression Level & File Size Option */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#3559D9]" />
              <span className="text-xs font-semibold text-[#202124]">PDF Size Compression</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#15803D] font-medium">
              Est. ~{formatBytes(estimatedBytes)}
            </span>
          </div>

          <div className="space-y-1.5">
            {COMPRESSION_OPTIONS.map((opt) => {
              const active = settings.compressionLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => onUpdateSettings({ compressionLevel: opt.value })}
                  className={`w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#EEF2FF]/60 border-[#3559D9] text-[#202124]'
                      : 'bg-white border-[#E5E7EB] text-[#202124] hover:bg-[#FAFAF9]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{opt.label}</span>
                    <span
                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                        active ? 'border-[#3559D9] bg-[#3559D9]' : 'border-[#D1D5DB]'
                      }`}
                    >
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Watermark Section */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-[#3559D9]" />
              <span className="text-xs font-semibold text-[#202124]">Page Watermark</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.watermark.enabled}
                onChange={(e) => handleUpdateWatermark({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-7 h-4 bg-[#E5E7EB] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#D1D5DB] after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#3559D9]" />
            </label>
          </div>

          {settings.watermark.enabled && (
            <div className="space-y-3 pt-2">
              <div>
                <label htmlFor="wm-text" className="block text-[11px] font-medium text-[#6B7280] mb-1">
                  Watermark Text
                </label>
                <input
                  id="wm-text"
                  type="text"
                  value={settings.watermark.text}
                  onChange={(e) => handleUpdateWatermark({ text: e.target.value })}
                  placeholder="e.g. CONFIDENTIAL / SEYI"
                  className="w-full px-2.5 py-1.5 text-xs text-[#202124] bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:border-[#3559D9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="wm-pos" className="block text-[11px] font-medium text-[#6B7280] mb-1">
                    Position
                  </label>
                  <select
                    id="wm-pos"
                    value={settings.watermark.position}
                    onChange={(e) =>
                      handleUpdateWatermark({
                        position: e.target.value as WatermarkSettings['position'],
                      })
                    }
                    className="w-full px-2 py-1 text-xs text-[#202124] bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:border-[#3559D9]"
                  >
                    <option value="diagonal">Diagonal Center</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="center">Center</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="wm-opacity" className="block text-[11px] font-medium text-[#6B7280] mb-1">
                    Opacity ({Math.round(settings.watermark.opacity * 100)}%)
                  </label>
                  <input
                    id="wm-opacity"
                    type="range"
                    min={0.1}
                    max={1.0}
                    step={0.05}
                    value={settings.watermark.opacity}
                    onChange={(e) => handleUpdateWatermark({ opacity: parseFloat(e.target.value) })}
                    className="w-full accent-[#3559D9] mt-1.5 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Export Summary & Action Panel */}
      <div className="bg-white border border-[#E5E7EB] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileOutput className="w-4 h-4 text-[#6B7280]" />
            <h2 className="text-sm font-semibold text-[#202124]">Name & export PDF</h2>
          </div>
          {images.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-[#15803D] font-medium">
              ~{formatBytes(estimatedBytes)}
            </span>
          )}
        </div>

        {/* Document Name / Rename Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="folio-filename-input"
              className="text-xs font-medium text-[#202124]"
            >
              Document filename
            </label>
            <button
              type="button"
              onClick={handleSelectAndFocusFilename}
              className="inline-flex items-center gap-1 text-xs text-[#3559D9] hover:underline cursor-pointer"
            >
              <Pencil className="w-3 h-3" />
              <span>Rename</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <input
              ref={filenameInputRef}
              id="folio-filename-input"
              type="text"
              disabled={isGenerating}
              value={settings.filename}
              placeholder="Seyi-folio-document.pdf"
              onChange={(e) => onRenameFilename(e.target.value)}
              className="w-full pl-3 pr-14 py-2 text-sm text-[#202124] bg-white border border-[#E5E7EB] rounded-md focus:outline-none focus:border-[#3559D9] font-mono"
            />
            {!settings.filename.trim().toLowerCase().endsWith('.pdf') && (
              <span className="absolute right-3 text-xs font-mono text-[#6B7280] pointer-events-none">
                .pdf
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6B7280]">
            <span>Saves as:</span>
            <span className="font-mono text-[#202124] truncate max-w-[200px]" title={sanitizedPreviewName}>
              {sanitizedPreviewName}
            </span>
            {firstImageBaseName &&
              sanitizedPreviewName.toLowerCase() !== `${firstImageBaseName.toLowerCase()}.pdf` && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => onRenameFilename(`${firstImageBaseName}.pdf`)}
                    className="text-[#3559D9] hover:underline truncate max-w-[160px] cursor-pointer"
                    title={`Use first image name: ${firstImageBaseName}.pdf`}
                  >
                    Use “{firstImageBaseName}”
                  </button>
                </>
              )}
          </div>
        </div>

        {/* Clean Unboxed Export Summary Metadata */}
        <div className="py-2.5 px-3 bg-[#FAFAF9] border border-[#E5E7EB] rounded-md text-xs text-[#6B7280] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
          <span className="font-medium text-[#202124]">
            {images.length} {images.length === 1 ? 'page' : 'pages'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{paperLabel}</span>
          {settings.paperSize !== 'FitToImage' && (
            <>
              <span aria-hidden="true">·</span>
              <span>{settings.orientation}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{placementLabel}</span>
          {settings.compressionLevel !== 'none' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#3559D9]">Compressed</span>
            </>
          )}
        </div>

        {/* Error Feedback */}
        {generationError && (
          <div
            role="alert"
            className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded-md text-xs text-[#B91C1C] leading-relaxed"
          >
            {generationError}
          </div>
        )}

        {/* Processing State or Primary Actions */}
        {isGenerating ? (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs text-[#202124] font-medium tabular-nums">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-[#3559D9] animate-spin" />
                <span>
                  {generationProgress
                    ? `Creating page ${generationProgress.current} of ${generationProgress.total}…`
                    : 'Preparing document…'}
                </span>
              </span>
              {generationProgress && generationProgress.total > 0 && (
                <span className="font-mono text-[#6B7280]">
                  {Math.round((generationProgress.current / generationProgress.total) * 100)}%
                </span>
              )}
            </div>

            <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#3559D9] transition-all duration-100"
                style={{
                  width:
                    generationProgress && generationProgress.total > 0
                      ? `${Math.max(
                          5,
                          Math.round((generationProgress.current / generationProgress.total) * 100)
                        )}%`
                      : '25%',
                }}
              />
            </div>

            <button
              type="button"
              onClick={onCancelGeneration}
              className="w-full py-2 px-4 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Cancel generation</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => onCreatePdf(false)}
              disabled={images.length === 0}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3559D9] rounded-md hover:bg-[#2B4BC0] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3559D9] transition-colors whitespace-nowrap cursor-pointer"
            >
              Create PDF
            </button>

            <button
              type="button"
              onClick={() => onCreatePdf(true)}
              disabled={images.length === 0}
              className="w-full py-2 px-4 text-xs font-medium text-[#202124] bg-[#FAFAF9] border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] disabled:opacity-45 disabled:pointer-events-none transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#3559D9]" />
              <span>Create & download immediately</span>
            </button>
          </div>
        )}

        {/* Ready / Instant Download State */}
        {generatedPdf && !isGenerating && (
          <div className="pt-3 border-t border-[#E5E7EB] space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#15803D] flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>Your PDF is ready.</span>
                </p>
                <p
                  className="text-xs font-mono text-[#6B7280] mt-1 truncate tabular-nums"
                  title={generatedPdf.filename}
                >
                  {generatedPdf.filename} · {formatBytes(generatedPdf.sizeBytes)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                triggerFastPdfDownload(generatedPdf.blobUrl, generatedPdf.filename)
              }
              className="w-full py-2.5 px-4 text-sm font-medium text-[#202124] bg-[#EEF2FF] border border-[#3559D9]/40 rounded-md hover:bg-[#E0E7FF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3559D9] transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Download className="w-4 h-4 text-[#3559D9]" />
              <span>Download PDF ({generatedPdf.filename})</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
