import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  Grid,
  GripVertical,
  List,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
  AlertCircle,
  X,
  ArrowUpDown,
  Crop,
  Home,
} from 'lucide-react';
import { DocumentSettings, FolioImage, ValidationIssue } from '../types/folio';
import { formatBytes, isFullCrop } from '../utils/imageProcessor';
import { calculatePageGeometry } from '../utils/pdfEngine';

interface ImageWorkspaceProps {
  images: FolioImage[];
  settings: DocumentSettings;
  selectedIds: Set<string>;
  validationIssues: ValidationIssue[];
  isUploading: boolean;
  uploadProgress: { processed: number; total: number } | null;
  canUndoRemove: boolean;
  lastRemovedCount: number;
  onFilesSelected: (files: FileList | File[]) => void;
  onLoadSampleImages: () => void;
  onDismissIssue: (id: string) => void;
  onClearAllIssues: () => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onRemoveImage: (id: string) => void;
  onRemoveSelected: () => void;
  onUndoRemove: () => void;
  onRotateImage: (id: string) => void;
  onRotateSelected: () => void;
  onOpenCropModal: (id: string) => void;
  onMoveImage: (fromIndex: number, toIndex: number) => void;
  onSortImages: (mode: 'name-asc' | 'name-desc' | 'reverse') => void;
  onRequestClearDocument: () => void;
  onInspectPageInPreview: (pageIndex: number) => void;
}

export const ImageWorkspace: React.FC<ImageWorkspaceProps> = ({
  images,
  settings,
  selectedIds,
  validationIssues,
  isUploading,
  uploadProgress,
  canUndoRemove,
  lastRemovedCount,
  onFilesSelected,
  onLoadSampleImages,
  onDismissIssue,
  onClearAllIssues,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onRemoveImage,
  onRemoveSelected,
  onUndoRemove,
  onRotateImage,
  onRotateSelected,
  onOpenCropModal,
  onMoveImage,
  onSortImages,
  onRequestClearDocument,
  onInspectPageInPreview,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDraggingFilesOver, setIsDraggingFilesOver] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  const handleDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFilesOver(true);
    }
  };

  const handleDropZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFilesOver(false);
  };

  const handleDropZoneDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFilesOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleItemDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleItemDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleItemDrop = (e: React.DragEvent<HTMLLIElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      onMoveImage(draggedIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleItemDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const allSelected = images.length > 0 && selectedIds.size === images.length;
  const singleSelectedId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Validation Issues Banner */}
      {validationIssues.length > 0 && (
        <div
          role="region"
          aria-label="File validation notices"
          className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 space-y-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#B91C1C]">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {validationIssues.length}{' '}
                {validationIssues.length === 1
                  ? 'file could not be added'
                  : 'files could not be added'}
              </span>
            </div>
            <button
              type="button"
              onClick={onClearAllIssues}
              className="text-xs font-medium text-[#B91C1C] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss all
            </button>
          </div>
          <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
            {validationIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex items-center justify-between gap-2 text-xs text-[#7F1D1D] py-0.5"
              >
                <div className="min-w-0 truncate">
                  <span className="font-medium">{issue.fileName}</span>
                  <span className="mx-1.5" aria-hidden="true">
                    —
                  </span>
                  <span>{issue.reason}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onDismissIssue(issue.id)}
                  aria-label={`Dismiss notice for ${issue.fileName}`}
                  className="p-0.5 text-[#991B1B] hover:text-[#7F1D1D] shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Undo Accidental Removal Banner */}
      {canUndoRemove && (
        <div className="bg-white border border-[#E5E7EB] rounded-lg px-4 py-2.5 flex items-center justify-between gap-3">
          <span className="text-xs text-[#202124] tabular-nums">
            Removed {lastRemovedCount} {lastRemovedCount === 1 ? 'image' : 'images'} from the
            document.
          </span>
          <button
            type="button"
            onClick={onUndoRemove}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#3559D9] bg-[#EEF2FF] rounded-md hover:bg-[#E0E7FF] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo removal</span>
          </button>
        </div>
      )}

      {/* Empty-State Upload Area OR Populated Workspace */}
      {images.length === 0 ? (
        <div
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          className={`bg-white border-2 border-dashed rounded-lg px-6 py-12 sm:py-16 text-center transition-colors ${
            isDraggingFilesOver
              ? 'border-[#3559D9] bg-[#EEF2FF]/40'
              : 'border-[#D1D5DB] hover:border-[#9CA3AF]'
          }`}
        >
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-10 h-10 mx-auto rounded-lg bg-[#FAFAF9] border border-[#E5E7EB] flex items-center justify-center text-[#202124]">
              {isUploading ? (
                <Loader2 className="w-5 h-5 text-[#3559D9] animate-spin" />
              ) : (
                <Upload className="w-5 h-5 text-[#6B7280]" />
              )}
            </div>

            <div className="space-y-1">
              <p className="text-base font-semibold text-[#202124]">Drop your images here</p>
              <p className="text-sm text-[#6B7280]">or choose files</p>
              <p className="text-xs text-[#6B7280] pt-1">JPG, PNG and WebP supported</p>
            </div>

            {isUploading && uploadProgress ? (
              <div className="pt-2">
                <p className="text-xs font-mono tabular-nums text-[#3559D9]">
                  Decoding image {uploadProgress.processed} of {uploadProgress.total}…
                </p>
              </div>
            ) : (
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleTriggerFileInput}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#3559D9] rounded-md hover:bg-[#2B4BC0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3559D9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Choose images
                </button>
                <button
                  type="button"
                  onClick={onLoadSampleImages}
                  className="px-4 py-2.5 text-xs font-medium text-[#202124] bg-[#FAFAF9] border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Try sample colouring pages
                </button>
              </div>
            )}

            <p className="text-xs text-[#6B7280] pt-2">No account required.</p>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDropZoneDragOver}
          onDragLeave={handleDropZoneDragLeave}
          onDrop={handleDropZoneDrop}
          className={`bg-white border rounded-lg transition-colors ${
            isDraggingFilesOver ? 'border-[#3559D9] ring-2 ring-[#EEF2FF]' : 'border-[#E5E7EB]'
          }`}
        >
          {/* Workspace Toolbar Header */}
          <div className="px-4 py-3 border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onRequestClearDocument}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Back to home / start fresh"
              >
                <Home className="w-3.5 h-3.5 text-[#3559D9]" />
                <span>← Back to home</span>
              </button>

              <div className="h-4 w-px bg-[#E5E7EB] hidden sm:block" />

              <label className="inline-flex items-center gap-2 text-xs font-medium text-[#202124] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
                  className="w-4 h-4 rounded border-[#D1D5DB] text-[#3559D9] focus:ring-[#3559D9] cursor-pointer"
                />
                <span className="font-mono tabular-nums">
                  {images.length} {images.length === 1 ? 'image' : 'images'} · {images.length}{' '}
                  {images.length === 1 ? 'page' : 'pages'}
                </span>
              </label>

              {isUploading && uploadProgress && (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-[#3559D9]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Adding {uploadProgress.processed}/{uploadProgress.total}…
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {images.length > 1 && (
                <div className="inline-flex items-center gap-1 bg-[#FAFAF9] border border-[#E5E7EB] rounded-md px-2 py-1">
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#6B7280]" />
                  <select
                    aria-label="Sort pages"
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value as 'name-asc' | 'name-desc' | 'reverse' | '';
                      if (val) {
                        onSortImages(val);
                        e.target.value = '';
                      }
                    }}
                    className="text-xs text-[#202124] bg-transparent focus:outline-none cursor-pointer"
                  >
                    <option value="" disabled>
                      Sort order…
                    </option>
                    <option value="name-asc">Filename (A → Z)</option>
                    <option value="name-desc">Filename (Z → A)</option>
                    <option value="reverse">Reverse current order</option>
                  </select>
                </div>
              )}

              <div className="inline-flex items-center p-0.5 bg-[#FAFAF9] border border-[#E5E7EB] rounded-md">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  title="Compact list view"
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    viewMode === 'list'
                      ? 'bg-white text-[#202124] shadow-xs'
                      : 'text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  title="Page grid view"
                  className={`p-1.5 rounded transition-colors cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-white text-[#202124] shadow-xs'
                      : 'text-[#6B7280] hover:text-[#202124]'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleTriggerFileInput}
                disabled={isUploading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#3559D9] rounded-md hover:bg-[#2B4BC0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add images</span>
              </button>

              <button
                type="button"
                onClick={onRequestClearDocument}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#6B7280] bg-white border border-[#E5E7EB] rounded-md hover:text-[#B91C1C] hover:border-[#FECACA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Clear all pages and restart"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Batch Selection Bar */}
          {selectedIds.size > 0 && (
            <div className="px-4 py-2 bg-[#EEF2FF] border-b border-[#3559D9]/20 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-[#202124] tabular-nums">
                <span>
                  {selectedIds.size} {selectedIds.size === 1 ? 'page' : 'pages'} selected
                </span>
                <button
                  type="button"
                  onClick={onDeselectAll}
                  className="text-[#3559D9] hover:underline ml-1 cursor-pointer"
                >
                  Clear selection
                </button>
              </div>

              <div className="flex items-center gap-2">
                {singleSelectedId && (
                  <button
                    type="button"
                    onClick={() => onOpenCropModal(singleSelectedId)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#FAFAF9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Crop className="w-3.5 h-3.5 text-[#3559D9]" />
                    <span>Crop selected</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onRotateSelected}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#FAFAF9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-[#6B7280]" />
                  <span>Rotate selected</span>
                </button>
                <button
                  type="button"
                  onClick={onRemoveSelected}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#B91C1C] bg-white border border-[#FECACA] rounded-md hover:bg-[#FEF2F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove selected</span>
                </button>
              </div>
            </div>
          )}

          {/* Page Ordering List or Grid */}
          {viewMode === 'list' ? (
            <ul
              aria-label="Document pages"
              className="divide-y divide-[#E5E7EB] max-h-[640px] overflow-y-auto"
            >
              {images.map((img, index) => {
                const isSelected = selectedIds.has(img.id);
                const isDragged = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const geometry = calculatePageGeometry(img, settings);
                const hasUserCrop = Boolean(img.crop && !isFullCrop(img.crop));
                const displayThumbUrl =
                  hasUserCrop && img.croppedThumbnailUrl
                    ? img.croppedThumbnailUrl
                    : img.thumbnailUrl;

                return (
                  <li
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDrop={(e) => handleItemDrop(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                      isDragged
                        ? 'opacity-40 bg-[#FAFAF9]'
                        : isDragOver
                        ? 'bg-[#EEF2FF]/70 border-t-2 border-t-[#3559D9]'
                        : isSelected
                        ? 'bg-[#EEF2FF]/35'
                        : 'hover:bg-[#FAFAF9]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        className="text-[#9CA3AF] hover:text-[#6B7280] cursor-grab active:cursor-grabbing shrink-0 hidden sm:inline-flex"
                        title="Drag to reorder page"
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>

                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(img.id)}
                        aria-label={`Select page ${index + 1}: ${img.name}`}
                        className="w-4 h-4 rounded border-[#D1D5DB] text-[#3559D9] focus:ring-[#3559D9] shrink-0 cursor-pointer"
                      />

                      <span className="w-14 text-xs font-mono tabular-nums text-[#6B7280] shrink-0">
                        Page {index + 1}
                      </span>

                      {/* Thumbnail Frame */}
                      <button
                        type="button"
                        onClick={() => onInspectPageInPreview(index)}
                        title="Click to inspect page in preview"
                        className="w-12 h-12 rounded border border-[#E5E7EB] bg-[#FAFAF9] flex items-center justify-center overflow-hidden shrink-0 group relative cursor-pointer"
                      >
                        <img
                          src={displayThumbUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="max-w-full max-h-full object-contain transition-transform duration-150"
                          style={{
                            transform:
                              hasUserCrop && img.croppedThumbnailUrl
                                ? undefined
                                : `rotate(${img.rotation}deg)`,
                          }}
                        />
                      </button>

                      {/* Filename & Metadata */}
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-sm font-medium text-[#202124] truncate"
                          title={img.name}
                        >
                          {img.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#6B7280] font-mono tabular-nums mt-0.5">
                          <span>
                            {geometry.rotatedImgWidthPx} × {geometry.rotatedImgHeightPx} px
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatBytes(img.sizeBytes)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-sans">{geometry.effectiveOrientation}</span>
                          {hasUserCrop && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#3559D9] font-sans">Cropped</span>
                            </>
                          )}
                          {img.rotation !== 0 && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-[#3559D9]">{img.rotation}°</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onInspectPageInPreview(index)}
                        aria-label={`Preview page ${index + 1}`}
                        title="Preview this page"
                        className="p-1.5 text-[#6B7280] hover:text-[#202124] hover:bg-[#F3F4F6] rounded transition-colors cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenCropModal(img.id)}
                        aria-label={`Crop ${img.name}`}
                        title={hasUserCrop ? 'Edit crop region' : 'Crop image'}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          hasUserCrop
                            ? 'text-[#3559D9] bg-[#EEF2FF] hover:bg-[#E0E7FF]'
                            : 'text-[#6B7280] hover:text-[#202124] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        <Crop className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onRotateImage(img.id)}
                        aria-label={`Rotate ${img.name} 90 degrees clockwise`}
                        title="Rotate 90°"
                        className="p-1.5 text-[#6B7280] hover:text-[#202124] hover:bg-[#F3F4F6] rounded transition-colors cursor-pointer"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onMoveImage(index, index - 1)}
                        disabled={index === 0}
                        aria-label={`Move ${img.name} up`}
                        title="Move page earlier"
                        className="p-1.5 text-[#6B7280] hover:text-[#202124] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none rounded transition-colors cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onMoveImage(index, index + 1)}
                        disabled={index === images.length - 1}
                        aria-label={`Move ${img.name} down`}
                        title="Move page later"
                        className="p-1.5 text-[#6B7280] hover:text-[#202124] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none rounded transition-colors cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveImage(img.id)}
                        aria-label={`Remove ${img.name}`}
                        title="Remove page"
                        className="p-1.5 text-[#6B7280] hover:text-[#B91C1C] hover:bg-[#FEF2F2] rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul
              aria-label="Document pages grid"
              className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[640px] overflow-y-auto"
            >
              {images.map((img, index) => {
                const isSelected = selectedIds.has(img.id);
                const isDragged = draggedIndex === index;
                const isDragOver = dragOverIndex === index;
                const geometry = calculatePageGeometry(img, settings);
                const hasUserCrop = Boolean(img.crop && !isFullCrop(img.crop));
                const displayThumbUrl =
                  hasUserCrop && img.croppedThumbnailUrl
                    ? img.croppedThumbnailUrl
                    : img.thumbnailUrl;

                return (
                  <li
                    key={img.id}
                    draggable
                    onDragStart={(e) => handleItemDragStart(e, index)}
                    onDragOver={(e) => handleItemDragOver(e, index)}
                    onDrop={(e) => handleItemDrop(e, index)}
                    onDragEnd={handleItemDragEnd}
                    className={`border rounded-md p-2.5 flex flex-col justify-between transition-colors ${
                      isDragged
                        ? 'opacity-40 bg-[#FAFAF9] border-[#E5E7EB]'
                        : isDragOver
                        ? 'border-[#3559D9] bg-[#EEF2FF]/50'
                        : isSelected
                        ? 'border-[#3559D9] bg-[#EEF2FF]/25'
                        : 'border-[#E5E7EB] bg-white hover:border-[#D1D5DB]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-[#202124] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleSelect(img.id)}
                          className="w-3.5 h-3.5 rounded border-[#D1D5DB] text-[#3559D9] focus:ring-[#3559D9] cursor-pointer"
                        />
                        <span>Page {index + 1}</span>
                      </label>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onMoveImage(index, index - 1)}
                          disabled={index === 0}
                          aria-label={`Move page ${index + 1} earlier`}
                          className="p-1 text-[#6B7280] hover:text-[#202124] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onMoveImage(index, index + 1)}
                          disabled={index === images.length - 1}
                          aria-label={`Move page ${index + 1} later`}
                          className="p-1 text-[#6B7280] hover:text-[#202124] disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onInspectPageInPreview(index)}
                      className="w-full h-36 bg-[#FAFAF9] border border-[#E5E7EB] rounded flex items-center justify-center overflow-hidden mb-2 cursor-pointer"
                      title="Inspect page in preview"
                    >
                      <img
                        src={displayThumbUrl}
                        alt={img.name}
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-full object-contain transition-transform duration-150"
                        style={{
                          transform:
                            hasUserCrop && img.croppedThumbnailUrl
                              ? undefined
                              : `rotate(${img.rotation}deg)`,
                        }}
                      />
                    </button>

                    <div className="space-y-1.5">
                      <p
                        className="text-xs font-medium text-[#202124] truncate"
                        title={img.name}
                      >
                        {img.name}
                      </p>
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#E5E7EB]">
                        <span className="text-[11px] font-mono tabular-nums text-[#6B7280]">
                          {geometry.rotatedImgWidthPx}×{geometry.rotatedImgHeightPx}
                          {hasUserCrop ? ' · Crop' : ''}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onInspectPageInPreview(index)}
                            aria-label={`Preview ${img.name}`}
                            className="p-1 text-[#6B7280] hover:text-[#202124] rounded cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenCropModal(img.id)}
                            aria-label={`Crop ${img.name}`}
                            title={hasUserCrop ? 'Edit crop region' : 'Crop image'}
                            className={`p-1 rounded cursor-pointer ${
                              hasUserCrop
                                ? 'text-[#3559D9] bg-[#EEF2FF]'
                                : 'text-[#6B7280] hover:text-[#202124]'
                            }`}
                          >
                            <Crop className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRotateImage(img.id)}
                            aria-label={`Rotate ${img.name}`}
                            className="p-1 text-[#6B7280] hover:text-[#202124] rounded cursor-pointer"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveImage(img.id)}
                            aria-label={`Remove ${img.name}`}
                            className="p-1 text-[#6B7280] hover:text-[#B91C1C] rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Subtle Bottom Drop Hint Bar */}
          <div className="px-4 py-2.5 bg-[#FAFAF9] border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B7280]">
            <span>
              Drag pages to reorder, or use the arrow buttons. Use the crop tool on any image to trim borders.
            </span>
            <button
              type="button"
              onClick={handleTriggerFileInput}
              className="font-medium text-[#3559D9] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              + Add more images
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
