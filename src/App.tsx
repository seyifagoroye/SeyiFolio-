/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, FileText, Home, Layers, ShieldCheck } from 'lucide-react';
import {
  CropRect,
  DocumentSettings,
  FolioImage,
  GeneratedPdfResult,
  RotationAngle,
  ValidationIssue,
} from './types/folio';
import {
  formatBytes,
  generateCroppedThumbnailUrl,
  generateSampleLineArtFiles,
  isFullCrop,
  processUploadedFiles,
  revokeImageResources,
  rotateCropRect90CW,
} from './utils/imageProcessor';
import {
  generatePdfDocument,
  sanitizeFilename,
  triggerFastPdfDownload,
} from './utils/pdfEngine';
import { ImageWorkspace } from './components/ImageWorkspace';
import { DocumentPreview } from './components/DocumentPreview';
import { DocumentSettingsPanel } from './components/DocumentSettingsPanel';
import { ImageCropModal } from './components/ImageCropModal';

interface RemovedSnapshot {
  entries: Array<{ image: FolioImage; index: number }>;
}

const DEFAULT_SETTINGS: DocumentSettings = {
  paperSize: 'A4',
  orientation: 'Auto',
  placement: 'FitToPage',
  marginPreset: 'Small',
  customMarginMm: 10,
  backgroundColor: '#FFFFFF',
  quality: 'Original',
  compressionLevel: 'none',
  watermark: {
    enabled: false,
    text: 'SEYIFOLIO',
    position: 'diagonal',
    opacity: 0.2,
    fontSize: 28,
    color: '#3559D9',
    scope: 'all',
  },
  colouringBookPresetActive: false,
  filename: 'Seyi-folio-document.pdf',
};

export default function App() {
  const [images, setImages] = useState<FolioImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [settings, setSettings] = useState<DocumentSettings>(DEFAULT_SETTINGS);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    processed: number;
    total: number;
  } | null>(null);

  // Undo accidental removal snapshot
  const [removedSnapshot, setRemovedSnapshot] = useState<RemovedSnapshot | null>(null);

  // Clear entire document confirmation modal
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  // Active image ID being cropped in ImageCropModal
  const [cropModalImageId, setCropModalImageId] = useState<string | null>(null);

  // Workspace view mode: 'arrange' or 'preview'
  const [workspaceTab, setWorkspaceTab] = useState<'arrange' | 'preview'>('arrange');
  const [activePreviewPageIndex, setActivePreviewPageIndex] = useState<number>(0);

  // PDF generation & export state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [generatedPdf, setGeneratedPdf] = useState<GeneratedPdfResult | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const imagesRef = useRef<FolioImage[]>([]);
  imagesRef.current = images;

  useEffect(() => {
    return () => {
      revokeImageResources(imagesRef.current);
    };
  }, []);

  const clearGeneratedPdf = useCallback(() => {
    setGeneratedPdf((prev) => {
      if (prev?.blobUrl) {
        try {
          URL.revokeObjectURL(prev.blobUrl);
        } catch {
          // Ignore
        }
      }
      return null;
    });
  }, []);

  const handleReturnToHomepage = useCallback(() => {
    if (images.length > 0) {
      setIsClearModalOpen(true);
    } else {
      setWorkspaceTab('arrange');
      setSettings(DEFAULT_SETTINGS);
      clearGeneratedPdf();
    }
  }, [images.length, clearGeneratedPdf]);

  const handleFilesSelected = useCallback(
    async (fileList: FileList | File[]) => {
      if (!fileList || fileList.length === 0) return;

      if (removedSnapshot) {
        revokeImageResources(removedSnapshot.entries.map((e) => e.image));
        setRemovedSnapshot(null);
      }

      setIsUploading(true);
      setUploadProgress({ processed: 0, total: fileList.length });
      setGenerationError(null);

      try {
        const { validImages, issues } = await processUploadedFiles(
          fileList,
          (processed, total) => {
            setUploadProgress({ processed, total });
          }
        );

        if (issues.length > 0) {
          setValidationIssues((prev) => [...issues, ...prev]);
        }

        if (validImages.length > 0) {
          setImages((prev) => [...prev, ...validImages]);
          clearGeneratedPdf();
        }
      } finally {
        setIsUploading(false);
        setUploadProgress(null);
      }
    },
    [clearGeneratedPdf, removedSnapshot]
  );

  const handleLoadSampleImages = useCallback(async () => {
    setIsUploading(true);
    setGenerationError(null);
    try {
      const sampleFiles = await generateSampleLineArtFiles();
      await handleFilesSelected(sampleFiles);
    } finally {
      setIsUploading(false);
    }
  }, [handleFilesSelected]);

  const handleDismissIssue = useCallback((id: string) => {
    setValidationIssues((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleClearAllIssues = useCallback(() => {
    setValidationIssues([]);
  }, []);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(images.map((img) => img.id)));
  }, [images]);

  const handleDeselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleRemoveImage = useCallback(
    (id: string) => {
      setImages((prev) => {
        const idx = prev.findIndex((img) => img.id === id);
        if (idx === -1) return prev;

        if (removedSnapshot) {
          revokeImageResources(removedSnapshot.entries.map((e) => e.image));
        }

        setRemovedSnapshot({
          entries: [{ image: prev[idx], index: idx }],
        });

        const next = prev.filter((img) => img.id !== id);
        if (next.length === 0) {
          setWorkspaceTab('arrange');
        } else if (activePreviewPageIndex >= next.length) {
          setActivePreviewPageIndex(Math.max(0, next.length - 1));
        }
        return next;
      });

      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      clearGeneratedPdf();
    },
    [activePreviewPageIndex, clearGeneratedPdf, removedSnapshot]
  );

  const handleRemoveSelected = useCallback(() => {
    if (selectedIds.size === 0) return;

    setImages((prev) => {
      const removedEntries: Array<{ image: FolioImage; index: number }> = [];
      const next: FolioImage[] = [];

      prev.forEach((img, idx) => {
        if (selectedIds.has(img.id)) {
          removedEntries.push({ image: img, index: idx });
        } else {
          next.push(img);
        }
      });

      if (removedEntries.length > 0) {
        if (removedSnapshot) {
          revokeImageResources(removedSnapshot.entries.map((e) => e.image));
        }
        setRemovedSnapshot({ entries: removedEntries });
      }

      if (next.length === 0) {
        setWorkspaceTab('arrange');
      } else if (activePreviewPageIndex >= next.length) {
        setActivePreviewPageIndex(Math.max(0, next.length - 1));
      }

      return next;
    });

    setSelectedIds(new Set());
    clearGeneratedPdf();
  }, [activePreviewPageIndex, clearGeneratedPdf, removedSnapshot, selectedIds]);

  const handleUndoRemove = useCallback(() => {
    if (!removedSnapshot || removedSnapshot.entries.length === 0) return;

    setImages((prev) => {
      const next = [...prev];
      const sorted = [...removedSnapshot.entries].sort((a, b) => a.index - b.index);
      for (const entry of sorted) {
        const insertAt = Math.min(Math.max(0, entry.index), next.length);
        next.splice(insertAt, 0, entry.image);
      }
      return next;
    });

    setRemovedSnapshot(null);
    clearGeneratedPdf();
  }, [clearGeneratedPdf, removedSnapshot]);

  const handleRotateImage = useCallback(
    async (id: string) => {
      const target = imagesRef.current.find((img) => img.id === id);
      if (!target) return;

      const nextRotation = ((target.rotation + 90) % 360) as RotationAngle;
      const rotatedCrop = rotateCropRect90CW(target.crop);
      let nextCroppedThumbUrl: string | undefined;

      if (rotatedCrop && !isFullCrop(rotatedCrop)) {
        nextCroppedThumbUrl = await generateCroppedThumbnailUrl(
          target,
          nextRotation,
          rotatedCrop
        );
      }

      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== id) return img;
          if (img.croppedThumbnailUrl) {
            try {
              URL.revokeObjectURL(img.croppedThumbnailUrl);
            } catch {
              // Ignore
            }
          }
          return {
            ...img,
            rotation: nextRotation,
            crop: rotatedCrop,
            croppedThumbnailUrl: nextCroppedThumbUrl,
          };
        })
      );
      clearGeneratedPdf();
    },
    [clearGeneratedPdf]
  );

  const handleRotateSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const updates = new Map<
      string,
      { rotation: RotationAngle; crop?: CropRect; croppedThumbnailUrl?: string }
    >();

    for (const img of imagesRef.current) {
      if (!selectedIds.has(img.id)) continue;
      const nextRotation = ((img.rotation + 90) % 360) as RotationAngle;
      const rotatedCrop = rotateCropRect90CW(img.crop);
      let nextCroppedThumbUrl: string | undefined;
      if (rotatedCrop && !isFullCrop(rotatedCrop)) {
        nextCroppedThumbUrl = await generateCroppedThumbnailUrl(img, nextRotation, rotatedCrop);
      }
      updates.set(img.id, {
        rotation: nextRotation,
        crop: rotatedCrop,
        croppedThumbnailUrl: nextCroppedThumbUrl,
      });
    }

    setImages((prev) =>
      prev.map((img) => {
        const u = updates.get(img.id);
        if (!u) return img;
        if (img.croppedThumbnailUrl) {
          try {
            URL.revokeObjectURL(img.croppedThumbnailUrl);
          } catch {
            // Ignore
          }
        }
        return {
          ...img,
          rotation: u.rotation,
          crop: u.crop,
          croppedThumbnailUrl: u.croppedThumbnailUrl,
        };
      })
    );
    clearGeneratedPdf();
  }, [clearGeneratedPdf, selectedIds]);

  const handleApplyCrop = useCallback(
    async (imageId: string, rotation: RotationAngle, crop?: CropRect) => {
      const target = imagesRef.current.find((img) => img.id === imageId);
      if (!target) {
        setCropModalImageId(null);
        return;
      }

      const normalizedCrop = crop && !isFullCrop(crop) ? crop : undefined;
      let croppedThumbnailUrl: string | undefined;

      if (normalizedCrop) {
        croppedThumbnailUrl = await generateCroppedThumbnailUrl(
          target,
          rotation,
          normalizedCrop
        );
      }

      setImages((prev) =>
        prev.map((img) => {
          if (img.id !== imageId) return img;
          if (img.croppedThumbnailUrl) {
            try {
              URL.revokeObjectURL(img.croppedThumbnailUrl);
            } catch {
              // Ignore
            }
          }
          return {
            ...img,
            rotation,
            crop: normalizedCrop,
            croppedThumbnailUrl,
          };
        })
      );

      setCropModalImageId(null);
      clearGeneratedPdf();
    },
    [clearGeneratedPdf]
  );

  const handleMoveImage = useCallback(
    (fromIndex: number, toIndex: number) => {
      setImages((prev) => {
        if (
          fromIndex < 0 ||
          fromIndex >= prev.length ||
          toIndex < 0 ||
          toIndex >= prev.length ||
          fromIndex === toIndex
        ) {
          return prev;
        }
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
      clearGeneratedPdf();
    },
    [clearGeneratedPdf]
  );

  const handleSortImages = useCallback(
    (mode: 'name-asc' | 'name-desc' | 'reverse') => {
      setImages((prev) => {
        const next = [...prev];
        if (mode === 'reverse') {
          next.reverse();
        } else if (mode === 'name-asc') {
          next.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          );
        } else if (mode === 'name-desc') {
          next.sort((a, b) =>
            b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
          );
        }
        return next;
      });
      clearGeneratedPdf();
    },
    [clearGeneratedPdf]
  );

  const handleConfirmClearDocument = useCallback(() => {
    if (removedSnapshot) {
      revokeImageResources(removedSnapshot.entries.map((e) => e.image));
      setRemovedSnapshot(null);
    }
    revokeImageResources(images);
    setImages([]);
    setSelectedIds(new Set());
    setValidationIssues([]);
    setWorkspaceTab('arrange');
    setActivePreviewPageIndex(0);
    setIsClearModalOpen(false);
    clearGeneratedPdf();
    setGenerationError(null);
    setSettings(DEFAULT_SETTINGS);
  }, [clearGeneratedPdf, images, removedSnapshot]);

  const handleUpdateSettings = useCallback(
    (partial: Partial<DocumentSettings>) => {
      setSettings((prev) => ({ ...prev, ...partial }));
      clearGeneratedPdf();
    },
    [clearGeneratedPdf]
  );

  const handleRenameFilename = useCallback((filename: string) => {
    setSettings((prev) => ({ ...prev, filename }));
    setGeneratedPdf((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        filename: sanitizeFilename(filename),
      };
    });
  }, []);

  const handleApplyColouringBookPreset = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      paperSize: 'A4',
      orientation: 'Auto',
      placement: 'FitToPage',
      marginPreset: 'Small',
      customMarginMm: 10,
      backgroundColor: '#FFFFFF',
      quality: 'Original',
      colouringBookPresetActive: true,
    }));
    clearGeneratedPdf();
  }, [clearGeneratedPdf]);

  const handleInspectPageInPreview = useCallback((pageIndex: number) => {
    setActivePreviewPageIndex(pageIndex);
    setWorkspaceTab('preview');
  }, []);

  const handleCreatePdf = useCallback(
    async (autoDownload = false) => {
      if (images.length === 0 || isGenerating) return;

      clearGeneratedPdf();
      setGenerationError(null);
      setIsGenerating(true);
      setGenerationProgress({ current: 1, total: images.length });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const result = await generatePdfDocument(
          images,
          settings,
          (current, total) => {
            setGenerationProgress({ current, total });
          },
          controller.signal
        );
        setGeneratedPdf(result);
        if (autoDownload) {
          triggerFastPdfDownload(result.blobUrl, result.filename);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setGenerationError(null);
        } else {
          setGenerationError(
            err instanceof Error
              ? err.message
              : 'An unexpected error occurred while creating the PDF. Your uploaded images are still intact.'
          );
        }
      } finally {
        setIsGenerating(false);
        setGenerationProgress(null);
        abortControllerRef.current = null;
      }
    },
    [clearGeneratedPdf, images, isGenerating, settings]
  );

  const handleCancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const totalSourceBytes = images.reduce((acc, img) => acc + img.sizeBytes, 0);
  const cropTargetImage = cropModalImageId
    ? images.find((img) => img.id === cropModalImageId) ?? null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9] text-[#202124]">
      {/* 1. Compact Header */}
      <header className="bg-white border-b border-[#E5E7EB]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleReturnToHomepage}
              className="flex items-center gap-2 text-left group cursor-pointer focus-visible:outline-2 focus-visible:outline-[#3559D9] rounded"
              title="Return to homepage / new document"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                className="text-[#3559D9] shrink-0"
              >
                <rect
                  x="5"
                  y="3"
                  width="14"
                  height="18"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="2"
                />
                <path
                  d="M9 8H15M9 12H15M9 16H12"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-base font-bold tracking-tight text-[#202124] group-hover:text-[#3559D9] transition-colors whitespace-nowrap">
                SeyiFolio
              </span>
            </button>
            <span className="text-[#D1D5DB] select-none" aria-hidden="true">
              /
            </span>
            <span className="text-xs font-medium text-[#6B7280] whitespace-nowrap">
              Images to PDF
            </span>
          </div>

          <div className="flex items-center gap-4">
            {images.length > 0 && (
              <button
                type="button"
                onClick={handleReturnToHomepage}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#6B7280] hover:text-[#202124] bg-[#FAFAF9] border border-[#E5E7EB] rounded-md transition-colors cursor-pointer"
                title="Return to homepage / start new document"
              >
                <Home className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Home</span>
              </button>
            )}

            <div className="flex items-center gap-1.5 text-xs text-[#6B7280] shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
              <span className="whitespace-nowrap hidden sm:inline">Files stay on your device</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main Conversion Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Introductory Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-[#3559D9] tracking-tight mb-1">
              SeyiFolio Converter
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#202124] text-balance">
              Bring everything together.
            </h1>
            <p className="text-sm text-[#6B7280] mt-1 max-w-xl">
              Combine your images into one PDF. Arrange your pages, crop, watermark, and download.
            </p>
          </div>

          {images.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              <div className="flex items-center gap-1.5 bg-white border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 focus-within:border-[#3559D9]">
                <FileText className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                <input
                  type="text"
                  aria-label="PDF document name"
                  value={settings.filename}
                  onChange={(e) => handleRenameFilename(e.target.value)}
                  placeholder="Seyi-folio-document.pdf"
                  className="text-xs font-mono text-[#202124] bg-transparent focus:outline-none w-40 sm:w-48"
                />
              </div>

              <span className="text-xs font-mono tabular-nums text-[#6B7280] hidden xl:inline">
                {images.length} {images.length === 1 ? 'image' : 'images'} ·{' '}
                {formatBytes(totalSourceBytes)}
              </span>

              <div
                role="tablist"
                aria-label="Workspace view"
                className="inline-flex items-center p-1 bg-white border border-[#E5E7EB] rounded-lg"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === 'arrange'}
                  onClick={() => setWorkspaceTab('arrange')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    workspaceTab === 'arrange'
                      ? 'bg-[#202124] text-white'
                      : 'text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Arrange pages</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={workspaceTab === 'preview'}
                  onClick={() => setWorkspaceTab('preview')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    workspaceTab === 'preview'
                      ? 'bg-[#202124] text-white'
                      : 'text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview document</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Balanced Two-Column Desktop Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 xl:col-span-8">
            {workspaceTab === 'preview' && images.length > 0 ? (
              <DocumentPreview
                images={images}
                settings={settings}
                activePageIndex={activePreviewPageIndex}
                onChangePageIndex={setActivePreviewPageIndex}
                onRotateImage={handleRotateImage}
                onOpenCropModal={(id) => setCropModalImageId(id)}
                onReturnToWorkspace={() => setWorkspaceTab('arrange')}
              />
            ) : (
              <ImageWorkspace
                images={images}
                settings={settings}
                selectedIds={selectedIds}
                validationIssues={validationIssues}
                isUploading={isUploading}
                uploadProgress={uploadProgress}
                canUndoRemove={Boolean(removedSnapshot && removedSnapshot.entries.length > 0)}
                lastRemovedCount={removedSnapshot?.entries.length ?? 0}
                onFilesSelected={handleFilesSelected}
                onLoadSampleImages={handleLoadSampleImages}
                onDismissIssue={handleDismissIssue}
                onClearAllIssues={handleClearAllIssues}
                onToggleSelect={handleToggleSelect}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onRemoveImage={handleRemoveImage}
                onRemoveSelected={handleRemoveSelected}
                onUndoRemove={handleUndoRemove}
                onRotateImage={handleRotateImage}
                onRotateSelected={handleRotateSelected}
                onOpenCropModal={(id) => setCropModalImageId(id)}
                onMoveImage={handleMoveImage}
                onSortImages={handleSortImages}
                onRequestClearDocument={() => setIsClearModalOpen(true)}
                onInspectPageInPreview={handleInspectPageInPreview}
              />
            )}
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <DocumentSettingsPanel
              images={images}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onRenameFilename={handleRenameFilename}
              onApplyColouringBookPreset={handleApplyColouringBookPreset}
              onCreatePdf={handleCreatePdf}
              onCancelGeneration={handleCancelGeneration}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              generatedPdf={generatedPdf}
              generationError={generationError}
            />
          </div>
        </div>
      </main>

      {/* 3. Minimal Footer with Seyi Branding */}
      <footer className="border-t border-[#E5E7EB] bg-white mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#6B7280]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#202124]">SeyiFolio</span>
            <span aria-hidden="true">·</span>
            <span>Every image. One document.</span>
          </div>
          <div className="flex items-center gap-2 text-center sm:text-right">
            <span>Seyi-2026</span>
            <span aria-hidden="true">·</span>
            <span>Local browser processing</span>
          </div>
        </div>
      </footer>

      {/* Interactive Image Crop Modal */}
      {cropTargetImage && (
        <ImageCropModal
          image={cropTargetImage}
          onClose={() => setCropModalImageId(null)}
          onApplyCrop={handleApplyCrop}
        />
      )}

      {/* Confirmation Modal for Clearing / Returning to Homepage */}
      {isClearModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-doc-modal-title"
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
        >
          <div className="bg-white border border-[#E5E7EB] rounded-lg max-w-sm w-full p-5 space-y-4 shadow-lg">
            <div className="space-y-1.5">
              <h2 id="clear-doc-modal-title" className="text-base font-semibold text-[#202124]">
                Return to homepage?
              </h2>
              <p className="text-xs text-[#6B7280] leading-relaxed">
                This will clear your current workspace containing {images.length}{' '}
                {images.length === 1 ? 'image' : 'images'}. Your original files on your device will not
                be affected.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsClearModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearDocument}
                className="px-3.5 py-2 text-xs font-medium text-white bg-[#B91C1C] rounded-md hover:bg-[#991B1B] transition-colors cursor-pointer"
              >
                Clear & go home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
