import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, RotateCcw, RotateCw, SlidersHorizontal, SlidersVertical, X } from 'lucide-react';
import { CropRect, FolioImage, RotationAngle } from '../types/folio';
import { isFullCrop, rotateCropRect90CW } from '../utils/imageProcessor';

interface ImageCropModalProps {
  image: FolioImage;
  onClose: () => void;
  onApplyCrop: (imageId: string, rotation: RotationAngle, crop?: CropRect) => void;
}

type DragHandle =
  | 'move'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | null;

interface AspectPreset {
  id: string;
  label: string;
  ratio: number | null;
}

const ASPECT_PRESETS: AspectPreset[] = [
  { id: 'free', label: 'Freeform', ratio: null },
  { id: 'a4-p', label: 'A4 Portrait', ratio: 210 / 297 },
  { id: 'a4-l', label: 'A4 Landscape', ratio: 297 / 210 },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
];

const MIN_CROP_FRACTION = 0.05;

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  image,
  onClose,
  onApplyCrop,
}) => {
  const [rotation, setRotation] = useState<RotationAngle>(image.rotation);
  const [crop, setCrop] = useState<CropRect>(
    image.crop && !isFullCrop(image.crop)
      ? { ...image.crop }
      : { x: 0, y: 0, width: 1, height: 1 }
  );
  const [selectedAspectId, setSelectedAspectId] = useState<string>('free');
  const [showSliders, setShowSliders] = useState<boolean>(false);
  const [sourceUrl, setSourceUrl] = useState<string>('');

  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    handle: DragHandle;
    startPointerX: number;
    startPointerY: number;
    startCrop: CropRect;
    stageWidth: number;
    stageHeight: number;
  } | null>(null);

  // Instant object URL for zero prep time
  useEffect(() => {
    const url = URL.createObjectURL(image.file);
    setSourceUrl(url);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    };
  }, [image.file]);

  const isQuarter = rotation === 90 || rotation === 270;
  const fullRotWidthPx = isQuarter ? image.height : image.width;
  const fullRotHeightPx = isQuarter ? image.width : image.height;

  const applyAspectRatio = useCallback(
    (targetRatio: number | null, currentCrop: CropRect): CropRect => {
      if (!targetRatio) return currentCrop;
      const normRatio = targetRatio * (fullRotHeightPx / Math.max(1, fullRotWidthPx));

      const centerX = currentCrop.x + currentCrop.width / 2;
      const centerY = currentCrop.y + currentCrop.height / 2;

      let newW = currentCrop.width;
      let newH = newW / normRatio;

      if (newH > 1) {
        newH = 1;
        newW = newH * normRatio;
      }
      if (newW > 1) {
        newW = 1;
        newH = newW / normRatio;
      }

      const newX = Math.max(0, Math.min(1 - newW, centerX - newW / 2));
      const newY = Math.max(0, Math.min(1 - newH, centerY - newH / 2));

      return {
        x: newX,
        y: newY,
        width: newW,
        height: newH,
      };
    },
    [fullRotHeightPx, fullRotWidthPx]
  );

  const handleSelectAspectPreset = (preset: AspectPreset) => {
    setSelectedAspectId(preset.id);
    if (preset.ratio !== null) {
      setCrop((prev) => applyAspectRatio(preset.ratio, prev));
    }
  };

  const handleRotateInModal = () => {
    const nextRotation = ((rotation + 90) % 360) as RotationAngle;
    setRotation(nextRotation);
    setCrop((prev) => rotateCropRect90CW(prev) ?? { x: 0, y: 0, width: 1, height: 1 });
    setSelectedAspectId('free');
  };

  const handleResetCrop = () => {
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
    setSelectedAspectId('free');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>, handle: DragHandle) => {
    if (!stageRef.current || !handle) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const rect = stageRef.current.getBoundingClientRect();
    dragStateRef.current = {
      handle,
      startPointerX: e.clientX,
      startPointerY: e.clientY,
      startCrop: { ...crop },
      stageWidth: Math.max(1, rect.width),
      stageHeight: Math.max(1, rect.height),
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !drag.handle) return;
    e.preventDefault();

    const dx = (e.clientX - drag.startPointerX) / drag.stageWidth;
    const dy = (e.clientY - drag.startPointerY) / drag.stageHeight;
    const s = drag.startCrop;

    if (drag.handle === 'move') {
      const nextX = Math.max(0, Math.min(1 - s.width, s.x + dx));
      const nextY = Math.max(0, Math.min(1 - s.height, s.y + dy));
      setCrop({ x: nextX, y: nextY, width: s.width, height: s.height });
      return;
    }

    let left = s.x;
    let right = s.x + s.width;
    let top = s.y;
    let bottom = s.y + s.height;

    if (drag.handle.includes('w')) {
      left = Math.max(0, Math.min(right - MIN_CROP_FRACTION, s.x + dx));
    }
    if (drag.handle.includes('e')) {
      right = Math.min(1, Math.max(left + MIN_CROP_FRACTION, s.x + s.width + dx));
    }
    if (drag.handle.includes('n')) {
      top = Math.max(0, Math.min(bottom - MIN_CROP_FRACTION, s.y + dy));
    }
    if (drag.handle.includes('s')) {
      bottom = Math.min(1, Math.max(top + MIN_CROP_FRACTION, s.y + s.height + dy));
    }

    let nextWidth = right - left;
    let nextHeight = bottom - top;

    const activePreset = ASPECT_PRESETS.find((p) => p.id === selectedAspectId);
    if (activePreset && activePreset.ratio !== null) {
      const normRatio = activePreset.ratio * (fullRotHeightPx / Math.max(1, fullRotWidthPx));
      if (drag.handle === 'n' || drag.handle === 's') {
        nextWidth = Math.min(1 - left, nextHeight * normRatio);
        nextHeight = nextWidth / normRatio;
      } else {
        nextHeight = Math.min(1 - top, nextWidth / normRatio);
        nextWidth = nextHeight * normRatio;
      }
      if (drag.handle.includes('w')) {
        left = right - nextWidth;
      }
      if (drag.handle.includes('n')) {
        top = bottom - nextHeight;
      }
    }

    setCrop({
      x: Math.max(0, left),
      y: Math.max(0, top),
      width: Math.max(MIN_CROP_FRACTION, Math.min(1 - left, nextWidth)),
      height: Math.max(MIN_CROP_FRACTION, Math.min(1 - top, nextHeight)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (dragStateRef.current) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      dragStateRef.current = null;
    }
  };

  const handleSave = useCallback(() => {
    const finalCrop = isFullCrop(crop) ? undefined : crop;
    onApplyCrop(image.id, rotation, finalCrop);
  }, [crop, image.id, onApplyCrop, rotation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, onClose]);

  const croppedWidthPx = Math.max(1, Math.round(fullRotWidthPx * crop.width));
  const croppedHeightPx = Math.max(1, Math.round(fullRotHeightPx * crop.height));

  // Horizontal and vertical slider bounds for fine-tuning
  const leftPercent = Math.round(crop.x * 100);
  const rightPercent = Math.round((1 - (crop.x + crop.width)) * 100);
  const topPercent = Math.round(crop.y * 100);
  const bottomPercent = Math.round((1 - (crop.y + crop.height)) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-modal-title"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-6"
    >
      <div className="bg-white border border-[#E5E7EB] rounded-lg max-w-4xl w-full flex flex-col max-h-[94vh] overflow-hidden shadow-2xl">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-[#E5E7EB] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crop className="w-4 h-4 text-[#3559D9] shrink-0" />
            <h2 id="crop-modal-title" className="text-sm font-semibold text-[#202124] truncate">
              Crop image — {image.name}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs font-mono tabular-nums text-[#6B7280] hidden sm:inline">
              Region: {croppedWidthPx} × {croppedHeightPx} px
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close crop dialog"
              className="p-1 text-[#6B7280] hover:text-[#202124] rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Aspect Ratio & Quick Controls Toolbar */}
        <div className="px-5 py-2.5 bg-[#FAFAF9] border-b border-[#E5E7EB] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-[#6B7280] mr-1.5">Aspect ratio:</span>
            {ASPECT_PRESETS.map((preset) => {
              const active = selectedAspectId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectAspectPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#EEF2FF] text-[#3559D9] border-[#3559D9]/40'
                      : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#202124]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSliders((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showSliders
                  ? 'bg-[#EEF2FF] text-[#3559D9] border-[#3559D9]/40'
                  : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:text-[#202124]'
              }`}
              title="Toggle vertical & horizontal crop adjustment bars"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showSliders ? 'Hide crop bars' : 'Vertical & horizontal bars'}</span>
            </button>

            <button
              type="button"
              onClick={handleRotateInModal}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded hover:bg-[#F3F4F6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Rotate 90°</span>
            </button>

            <button
              type="button"
              onClick={handleResetCrop}
              disabled={isFullCrop(crop)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded hover:bg-[#F3F4F6] disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#6B7280]" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Vertical & Horizontal Crop Adjustment Bars Panel (when toggled) */}
        {showSliders && (
          <div className="px-5 py-3 bg-white border-b border-[#E5E7EB] grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#202124] font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#3559D9]" />
                  <span>Horizontal Trim (Left / Right)</span>
                </span>
                <span className="font-mono text-[#6B7280]">
                  L: {leftPercent}% · R: {rightPercent}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-[#6B7280]">
                    <span>Left trim</span>
                    <span>{leftPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={leftPercent}
                    onChange={(e) => {
                      const newLeft = parseInt(e.target.value) / 100;
                      const maxW = 1 - newLeft - (rightPercent / 100);
                      if (maxW > 0.05) {
                        setCrop({
                          x: newLeft,
                          y: crop.y,
                          width: maxW,
                          height: crop.height,
                        });
                        setSelectedAspectId('free');
                      }
                    }}
                    className="w-full accent-[#3559D9] cursor-pointer"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-[#6B7280]">
                    <span>Right trim</span>
                    <span>{rightPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={rightPercent}
                    onChange={(e) => {
                      const newRight = parseInt(e.target.value) / 100;
                      const maxW = 1 - crop.x - newRight;
                      if (maxW > 0.05) {
                        setCrop({
                          x: crop.x,
                          y: crop.y,
                          width: maxW,
                          height: crop.height,
                        });
                        setSelectedAspectId('free');
                      }
                    }}
                    className="w-full accent-[#3559D9] cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[#202124] font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <SlidersVertical className="w-3.5 h-3.5 text-[#3559D9]" />
                  <span>Vertical Trim (Top / Bottom)</span>
                </span>
                <span className="font-mono text-[#6B7280]">
                  T: {topPercent}% · B: {bottomPercent}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-[#6B7280]">
                    <span>Top trim</span>
                    <span>{topPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={topPercent}
                    onChange={(e) => {
                      const newTop = parseInt(e.target.value) / 100;
                      const maxH = 1 - newTop - (bottomPercent / 100);
                      if (maxH > 0.05) {
                        setCrop({
                          x: crop.x,
                          y: newTop,
                          width: crop.width,
                          height: maxH,
                        });
                        setSelectedAspectId('free');
                      }
                    }}
                    className="w-full accent-[#3559D9] cursor-pointer"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] text-[#6B7280]">
                    <span>Bottom trim</span>
                    <span>{bottomPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={bottomPercent}
                    onChange={(e) => {
                      const newBottom = parseInt(e.target.value) / 100;
                      const maxH = 1 - crop.y - newBottom;
                      if (maxH > 0.05) {
                        setCrop({
                          x: crop.x,
                          y: crop.y,
                          width: crop.width,
                          height: maxH,
                        });
                        setSelectedAspectId('free');
                      }
                    }}
                    className="w-full accent-[#3559D9] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Interactive Crop Canvas Stage (Instant Load via CSS Transform) */}
        <div className="flex-1 bg-[#18181B] p-6 sm:p-8 overflow-auto flex items-center justify-center min-h-[360px] select-none">
          {sourceUrl ? (
            <div
              ref={stageRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative inline-block max-w-full max-h-[58vh] leading-none touch-none"
            >
              <img
                src={sourceUrl}
                alt={image.name}
                draggable={false}
                referrerPolicy="no-referrer"
                className="block max-w-full max-h-[58vh] w-auto h-auto object-contain pointer-events-none select-none transition-transform duration-150"
                style={{ transform: `rotate(${rotation}deg)` }}
              />

              {/* Outside Darkened Scrims (Top, Bottom, Left, Right) */}
              <div
                className="absolute left-0 right-0 top-0 bg-black/65 pointer-events-none"
                style={{ height: `${crop.y * 100}%` }}
              />
              <div
                className="absolute left-0 right-0 bottom-0 bg-black/65 pointer-events-none"
                style={{ height: `${(1 - (crop.y + crop.height)) * 100}%` }}
              />
              <div
                className="absolute left-0 bg-black/65 pointer-events-none"
                style={{
                  top: `${crop.y * 100}%`,
                  height: `${crop.height * 100}%`,
                  width: `${crop.x * 100}%`,
                }}
              />
              <div
                className="absolute right-0 bg-black/65 pointer-events-none"
                style={{
                  top: `${crop.y * 100}%`,
                  height: `${crop.height * 100}%`,
                  width: `${(1 - (crop.x + crop.width)) * 100}%`,
                }}
              />

              {/* Active Rectangular Crop Selection Box */}
              <div
                onPointerDown={(e) => handlePointerDown(e, 'move')}
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
                className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move"
              >
                {/* Rule-of-Thirds Grid Lines */}
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div className="border-r border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-r border-b border-white/40" />
                  <div className="border-b border-white/40" />
                  <div className="border-r border-white/40" />
                  <div className="border-r border-white/40" />
                  <div />
                </div>

                {/* Corner Handles */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'nw')}
                  className="absolute -top-2 -left-2 w-4 h-4 bg-white border-2 border-[#3559D9] rounded-xs cursor-nwse-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'ne')}
                  className="absolute -top-2 -right-2 w-4 h-4 bg-white border-2 border-[#3559D9] rounded-xs cursor-nesw-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'sw')}
                  className="absolute -bottom-2 -left-2 w-4 h-4 bg-white border-2 border-[#3559D9] rounded-xs cursor-nesw-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'se')}
                  className="absolute -bottom-2 -right-2 w-4 h-4 bg-white border-2 border-[#3559D9] rounded-xs cursor-nwse-resize"
                />

                {/* Edge Handles */}
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-[#3559D9] rounded-xs cursor-ns-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-3 bg-white border border-[#3559D9] rounded-xs cursor-ns-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'w')}
                  className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-[#3559D9] rounded-xs cursor-ew-resize"
                />
                <div
                  onPointerDown={(e) => handlePointerDown(e, 'e')}
                  className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-6 bg-white border border-[#3559D9] rounded-xs cursor-ew-resize"
                />
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#9CA3AF]">Loading image…</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-[#E5E7EB] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#6B7280] font-mono tabular-nums">
            <span>
              Original: {fullRotWidthPx} × {fullRotHeightPx} px
            </span>
            <span className="mx-2" aria-hidden="true">
              →
            </span>
            <span className="text-[#202124] font-medium">
              Kept region: {croppedWidthPx} × {croppedHeightPx} px (
              {Math.round(crop.width * 100)}% × {Math.round(crop.height * 100)}%)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#202124] bg-white border border-[#E5E7EB] rounded-md hover:bg-[#F3F4F6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#3559D9] rounded-md hover:bg-[#2B4BC0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply crop</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
