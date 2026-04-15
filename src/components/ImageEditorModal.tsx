import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Brush,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  RotateCw,
  Scissors,
  X,
} from 'lucide-react';
import {
  applyExclusionBoxes,
  applyExclusionMask,
  applyImageEdits,
  applyInclusionRegions,
  type BrushPoint,
  type BrushStroke,
  dataUrlToFile,
  DEFAULT_IMAGE_EDITS,
  type InclusionRegion,
  isDefaultImageEdits,
  type ImageEditSettings,
  type SelectionBox,
} from '../lib/imageEditing';

type ImageEditorModalProps = {
  open: boolean;
  imageSrc: string;
  originalImageSrc?: string;
  fileName: string;
  title: string;
  gridRows?: number;
  gridCols?: number;
  currentImageIndex?: number;
  totalImages?: number;
  onPrevImage?: () => void;
  onNextImage?: () => void;
  onClose: () => void;
  onSave: (payload: {
    imageData: string;
    preview: string;
    file: File;
  }) => void | Promise<void>;
};

type CropHandle =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight';

type PreviewBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const MIN_POINT_DELTA = 0.0035;

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

function clampRotation(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(-180, Math.min(180, value));
}

function clampCropValue(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(95, value));
}

function normalizeCrop(crop: ImageEditSettings['crop']) {
  let top = clampCropValue(crop.top);
  let right = clampCropValue(crop.right);
  let bottom = clampCropValue(crop.bottom);
  let left = clampCropValue(crop.left);

  if (top + bottom > 99) {
    const overflow = top + bottom - 99;
    if (top >= bottom) {
      top -= overflow;
    } else {
      bottom -= overflow;
    }
  }

  if (left + right > 99) {
    const overflow = left + right - 99;
    if (left >= right) {
      left -= overflow;
    } else {
      right -= overflow;
    }
  }

  return {
    top: roundToTenth(Math.max(0, top)),
    right: roundToTenth(Math.max(0, right)),
    bottom: roundToTenth(Math.max(0, bottom)),
    left: roundToTenth(Math.max(0, left)),
  };
}

function clampUnit(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampBrushSize(value: number) {
  if (Number.isNaN(value)) return 2.5;
  return Math.max(0.5, Math.min(12, value));
}

function clampGridCount(value?: number) {
  if (!value || Number.isNaN(value)) return 4;
  return Math.max(1, Math.min(8, value));
}

function createSelectionBox(start: BrushPoint, end: BrushPoint): SelectionBox | null {
  const left = clampUnit(Math.min(start.x, end.x));
  const top = clampUnit(Math.min(start.y, end.y));
  const right = clampUnit(Math.max(start.x, end.x));
  const bottom = clampUnit(Math.max(start.y, end.y));
  const width = right - left;
  const height = bottom - top;

  if (width < 0.01 || height < 0.01) {
    return null;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    x: left,
    y: top,
    width,
    height,
  };
}

function createRegionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasMeaningfulPointDelta(previous: BrushPoint, next: BrushPoint) {
  const deltaX = next.x - previous.x;
  const deltaY = next.y - previous.y;
  return deltaX * deltaX + deltaY * deltaY >= MIN_POINT_DELTA * MIN_POINT_DELTA;
}

export function ImageEditorModal({
  open,
  imageSrc,
  originalImageSrc,
  fileName,
  title,
  gridRows = 4,
  gridCols = 4,
  currentImageIndex = 0,
  totalImages = 1,
  onPrevImage,
  onNextImage,
  onClose,
  onSave,
}: ImageEditorModalProps) {
  const compareOriginalSrc = originalImageSrc ?? imageSrc;
  const [edits, setEdits] = useState<ImageEditSettings>(DEFAULT_IMAGE_EDITS);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewBounds, setPreviewBounds] = useState<PreviewBounds | null>(null);
  const [editorMode, setEditorMode] = useState<
    'crop' | 'brush' | 'includeBrush' | 'excludeBox'
  >('crop');
  const [showCompareOriginal, setShowCompareOriginal] = useState(false);
  const [brushSize, setBrushSize] = useState(2.5);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>([]);
  const [redoBrushStrokes, setRedoBrushStrokes] = useState<BrushStroke[]>([]);
  const [brushCursorPoint, setBrushCursorPoint] = useState<BrushPoint | null>(null);
  const [includeRegions, setIncludeRegions] = useState<InclusionRegion[]>([]);
  const [redoIncludeRegions, setRedoIncludeRegions] = useState<InclusionRegion[]>([]);
  const [excludeBoxes, setExcludeBoxes] = useState<SelectionBox[]>([]);
  const [redoExcludeBoxes, setRedoExcludeBoxes] = useState<SelectionBox[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const brushLayerRef = useRef<HTMLDivElement | null>(null);
  const brushCursorFrameRef = useRef<number | null>(null);
  const queuedBrushCursorPointRef = useRef<BrushPoint | null>(null);

  const [dragState, setDragState] = useState<{
    handle: CropHandle;
    startX: number;
    startY: number;
    startCrop: ImageEditSettings['crop'];
  } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isTracingIncludeRegion, setIsTracingIncludeRegion] = useState(false);
  const [boxDraft, setBoxDraft] = useState<{
    mode: 'excludeBox';
    start: BrushPoint;
    current: BrushPoint;
  } | null>(null);
  const [includeRegionDraft, setIncludeRegionDraft] = useState<InclusionRegion | null>(null);

  useEffect(() => {
    if (!open) return;

    setEdits(DEFAULT_IMAGE_EDITS);
    setError('');
    setEditorMode('crop');
    setShowCompareOriginal(false);
    setBrushSize(2.5);
    setBrushStrokes([]);
    setRedoBrushStrokes([]);
    setBrushCursorPoint(null);
    setIncludeRegions([]);
    setRedoIncludeRegions([]);
    setExcludeBoxes([]);
    setRedoExcludeBoxes([]);
    setBoxDraft(null);
    setIncludeRegionDraft(null);
    setIsTracingIncludeRegion(false);
  }, [imageSrc, open]);

  useEffect(() => {
    if (!open) return;

    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [open]);

  const updatePreviewBounds = useCallback(() => {
    const container = containerRef.current;
    const image = imageRef.current;

    if (!container || !image) return;

    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();

    setPreviewBounds({
      left: imageRect.left - containerRect.left,
      top: imageRect.top - containerRect.top,
      width: imageRect.width,
      height: imageRect.height,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updatePreviewBounds();
  }, [edits.rotation, imageSrc, open, updatePreviewBounds]);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      updatePreviewBounds();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [open, updatePreviewBounds]);

  useEffect(() => {
    return () => {
      if (brushCursorFrameRef.current !== null) {
        cancelAnimationFrame(brushCursorFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!dragState || !previewBounds) return;

    const onPointerMove = (event: PointerEvent) => {
      const dxPercent = (event.clientX - dragState.startX) / previewBounds.width * 100;
      const dyPercent = (event.clientY - dragState.startY) / previewBounds.height * 100;

      const nextCrop = { ...dragState.startCrop };

      switch (dragState.handle) {
        case 'left':
          nextCrop.left = dragState.startCrop.left + dxPercent;
          break;
        case 'right':
          nextCrop.right = dragState.startCrop.right - dxPercent;
          break;
        case 'top':
          nextCrop.top = dragState.startCrop.top + dyPercent;
          break;
        case 'bottom':
          nextCrop.bottom = dragState.startCrop.bottom - dyPercent;
          break;
        case 'topLeft':
          nextCrop.top = dragState.startCrop.top + dyPercent;
          nextCrop.left = dragState.startCrop.left + dxPercent;
          break;
        case 'topRight':
          nextCrop.top = dragState.startCrop.top + dyPercent;
          nextCrop.right = dragState.startCrop.right - dxPercent;
          break;
        case 'bottomLeft':
          nextCrop.bottom = dragState.startCrop.bottom - dyPercent;
          nextCrop.left = dragState.startCrop.left + dxPercent;
          break;
        case 'bottomRight':
          nextCrop.bottom = dragState.startCrop.bottom - dyPercent;
          nextCrop.right = dragState.startCrop.right - dxPercent;
          break;
      }

      setEdits((current) => ({
        ...current,
        crop: normalizeCrop(nextCrop),
      }));
    };

    const onPointerUp = () => {
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragState, previewBounds]);

  const cropControls = useMemo(
    () => [
      { key: 'top', label: 'Top', value: edits.crop.top },
      { key: 'right', label: 'Right', value: edits.crop.right },
      { key: 'bottom', label: 'Bottom', value: edits.crop.bottom },
      { key: 'left', label: 'Left', value: edits.crop.left },
    ] as const,
    [edits.crop.bottom, edits.crop.left, edits.crop.right, edits.crop.top]
  );

  const cropFrame = useMemo(
    () =>
      previewBounds
        ? {
            left: previewBounds.left + (edits.crop.left / 100) * previewBounds.width,
            top: previewBounds.top + (edits.crop.top / 100) * previewBounds.height,
            width:
              previewBounds.width -
              ((edits.crop.left + edits.crop.right) / 100) * previewBounds.width,
            height:
              previewBounds.height -
              ((edits.crop.top + edits.crop.bottom) / 100) * previewBounds.height,
          }
        : null,
    [
      edits.crop.bottom,
      edits.crop.left,
      edits.crop.right,
      edits.crop.top,
      previewBounds,
    ]
  );

  const previewBrushDiameter = useMemo(() => {
    if (!cropFrame) return 0;

    return Math.max(1, (brushSize / 100) * Math.max(cropFrame.width, cropFrame.height));
  }, [brushSize, cropFrame]);

  const editorGridRows = clampGridCount(gridRows);
  const editorGridCols = clampGridCount(gridCols);

  const draftBox = useMemo(() => {
    if (!boxDraft) return null;
    return createSelectionBox(boxDraft.start, boxDraft.current);
  }, [boxDraft]);

  const rotateBy = (delta: number) => {
    setEdits((current) => ({
      ...current,
      rotation: roundToTenth(clampRotation(current.rotation + delta)),
    }));
  };

  const setRotation = (value: number) => {
    setEdits((current) => ({
      ...current,
      rotation: roundToTenth(clampRotation(value)),
    }));
  };

  const setCrop = (side: keyof ImageEditSettings['crop'], value: number) => {
    setEdits((current) => ({
      ...current,
      crop: normalizeCrop({
        ...current.crop,
        [side]: value,
      }),
    }));
  };

  const startHandleDrag = (
    handle: CropHandle,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();

    setDragState({
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startCrop: { ...edits.crop },
    });
  };

  const getBrushPoint = useCallback((
    clientX: number,
    clientY: number
  ): BrushPoint | null => {
    const brushLayer = brushLayerRef.current;

    if (!brushLayer || !cropFrame || cropFrame.width <= 0 || cropFrame.height <= 0) {
      return null;
    }

    const brushLayerRect = brushLayer.getBoundingClientRect();

    return {
      x: clampUnit((clientX - brushLayerRect.left) / brushLayerRect.width),
      y: clampUnit((clientY - brushLayerRect.top) / brushLayerRect.height),
    };
  }, [cropFrame]);

  const updateBrushCursor = useCallback((clientX: number, clientY: number) => {
    queuedBrushCursorPointRef.current = getBrushPoint(clientX, clientY);

    if (brushCursorFrameRef.current !== null) return;

    brushCursorFrameRef.current = requestAnimationFrame(() => {
      brushCursorFrameRef.current = null;
      setBrushCursorPoint(queuedBrushCursorPointRef.current);
    });
  }, [getBrushPoint]);

  const startBrushStroke = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getBrushPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setRedoBrushStrokes([]);
    setBrushCursorPoint(point);
    setBrushStrokes((current) => [
      ...current,
      {
        size: brushSize,
        points: [point],
      },
    ]);
    setIsDrawing(true);
  };

  const startSelectionBox = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getBrushPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setBrushCursorPoint(point);
    setBoxDraft({
      mode: 'excludeBox',
      start: point,
      current: point,
    });
  };

  const startIncludeRegion = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getBrushPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setBrushCursorPoint(point);
    setRedoIncludeRegions([]);
    setIncludeRegionDraft({
      id: createRegionId(),
      points: [point],
    });
    setIsTracingIncludeRegion(true);
  };

  useEffect(() => {
    if (!isDrawing) return;

    const onPointerMove = (event: PointerEvent) => {
      const point = getBrushPoint(event.clientX, event.clientY);
      setBrushCursorPoint(point);
      if (!point) return;

      setBrushStrokes((current) => {
        if (current.length === 0) return current;

        const next = [...current];
        const lastStroke = next[next.length - 1];
        const previousPoint = lastStroke.points[lastStroke.points.length - 1];
        if (previousPoint && !hasMeaningfulPointDelta(previousPoint, point)) {
          return current;
        }
        next[next.length - 1] = {
          ...lastStroke,
          points: [...lastStroke.points, point],
        };
        return next;
      });
    };

    const onPointerUp = () => {
      setIsDrawing(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [getBrushPoint, isDrawing]);

  useEffect(() => {
    if (!isTracingIncludeRegion) return;

    const onPointerMove = (event: PointerEvent) => {
      const point = getBrushPoint(event.clientX, event.clientY);
      setBrushCursorPoint(point);
      if (!point) return;

      setIncludeRegionDraft((current) => {
        if (!current) return current;
        const previousPoint = current.points[current.points.length - 1];
        if (previousPoint && !hasMeaningfulPointDelta(previousPoint, point)) {
          return current;
        }
        return {
          ...current,
          points: [...current.points, point],
        };
      });
    };

    const onPointerUp = () => {
      setIsTracingIncludeRegion(false);
      setIncludeRegionDraft((current) => {
        if (!current || current.points.length < 3) {
          return null;
        }

        setIncludeRegions((regions) => [...regions, current]);
        return null;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [getBrushPoint, isTracingIncludeRegion]);

  useEffect(() => {
    if (!boxDraft) return;

    const onPointerMove = (event: PointerEvent) => {
      const point = getBrushPoint(event.clientX, event.clientY);
      setBrushCursorPoint(point);
      if (!point) return;

      setBoxDraft((current) =>
        current
          ? {
              ...current,
              current: point,
            }
          : current
      );
    };

    const onPointerUp = () => {
      setBoxDraft((current) => {
        if (!current) return null;

        const nextBox = createSelectionBox(current.start, current.current);
        if (!nextBox) return null;

        setExcludeBoxes((boxes) => [...boxes, nextBox]);
        setRedoExcludeBoxes([]);

        return null;
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [boxDraft, getBrushPoint]);

  const undoBrushStroke = () => {
    setBrushStrokes((current) => {
      if (current.length === 0) return current;

      const removedStroke = current[current.length - 1];
      setRedoBrushStrokes((redoCurrent) => [...redoCurrent, removedStroke]);
      return current.slice(0, -1);
    });
  };

  const redoBrushStroke = () => {
    setRedoBrushStrokes((current) => {
      if (current.length === 0) return current;

      const restoredStroke = current[current.length - 1];
      setBrushStrokes((strokeCurrent) => [...strokeCurrent, restoredStroke]);
      return current.slice(0, -1);
    });
  };

  const resetBrushEditor = () => {
    setBrushStrokes([]);
    setRedoBrushStrokes([]);
    setBrushCursorPoint(null);
  };

  const undoIncludeRegion = () => {
    setIncludeRegions((current) => {
      if (current.length === 0) return current;

      const removedRegion = current[current.length - 1];
      setRedoIncludeRegions((redoCurrent) => [...redoCurrent, removedRegion]);
      return current.slice(0, -1);
    });
  };

  const redoIncludeRegion = () => {
    setRedoIncludeRegions((current) => {
      if (current.length === 0) return current;

      const restoredRegion = current[current.length - 1];
      setIncludeRegions((regionCurrent) => [...regionCurrent, restoredRegion]);
      return current.slice(0, -1);
    });
  };

  const resetIncludeRegionsEditor = () => {
    setIncludeRegions([]);
    setRedoIncludeRegions([]);
    setIncludeRegionDraft(null);
  };

  const undoExcludeBox = () => {
    setExcludeBoxes((current) => {
      if (current.length === 0) return current;

      const removedBox = current[current.length - 1];
      setRedoExcludeBoxes((redoCurrent) => [...redoCurrent, removedBox]);
      return current.slice(0, -1);
    });
  };

  const redoExcludeBox = () => {
    setRedoExcludeBoxes((current) => {
      if (current.length === 0) return current;

      const restoredBox = current[current.length - 1];
      setExcludeBoxes((boxCurrent) => [...boxCurrent, restoredBox]);
      return current.slice(0, -1);
    });
  };

  const resetExcludeBoxesEditor = () => {
    setExcludeBoxes([]);
    setRedoExcludeBoxes([]);
  };

  const resetEditor = () => {
    setEdits(DEFAULT_IMAGE_EDITS);
    setEditorMode('crop');
    setBrushSize(2.5);
    resetBrushEditor();
    resetIncludeRegionsEditor();
    resetExcludeBoxesEditor();
    setBoxDraft(null);
    setError('');
  };

  if (!open) return null;

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError('');

      const editedImageData = isDefaultImageEdits(edits)
        ? imageSrc
        : await applyImageEdits(imageSrc, edits);
      const includedImageData =
        includeRegions.length > 0
          ? await applyInclusionRegions(editedImageData, includeRegions)
          : editedImageData;
      const boxExcludedImageData =
        excludeBoxes.length > 0
          ? await applyExclusionBoxes(includedImageData, excludeBoxes)
          : includedImageData;
      const nextImageData =
        brushStrokes.length > 0
          ? await applyExclusionMask(boxExcludedImageData, brushStrokes)
          : boxExcludedImageData;

      await onSave({
        imageData: nextImageData,
        preview: nextImageData,
        file: dataUrlToFile(nextImageData, fileName || 'edited-image.png'),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Failed to save image.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="h-[98vh] w-full max-w-[98vw] overflow-hidden rounded-3xl border border-emerald-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Image Editor
            </p>
            <h3 className="text-lg font-semibold text-emerald-950">{title}</h3>
          </div>

          <div className="flex items-center gap-2">
            {totalImages > 1 && (
              <>
                <button
                  type="button"
                  onClick={onPrevImage}
                  disabled={currentImageIndex <= 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {`Image ${currentImageIndex + 1} of ${totalImages}`}
                </span>
                <button
                  type="button"
                  onClick={onNextImage}
                  disabled={currentImageIndex >= totalImages - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-emerald-200 bg-white p-2 text-emerald-700 hover:bg-emerald-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid h-[calc(98vh-81px)] gap-4 overflow-hidden p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col rounded-2xl border border-emerald-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-emerald-900">Full Preview</p>
                <button
                  type="button"
                  onClick={() => setShowCompareOriginal((current) => !current)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    showCompareOriginal
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  {showCompareOriginal ? 'Hide Original' : 'Compare Original'}
                </button>
              </div>
              <span className="text-xs text-emerald-700">
                {editorMode === 'crop'
                  ? 'Word-style crop handles enabled'
                  : editorMode === 'includeBrush'
                    ? 'Draw the freehand area that should stay included in analysis'
                    : editorMode === 'excludeBox'
                      ? 'Draw obstacle boxes that should be ignored'
                      : 'Brush marks will be excluded during analysis'}
              </span>
            </div>
            {showCompareOriginal && (
              <div className="mb-3 grid gap-3 lg:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                  <div className="border-b border-emerald-100 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-900">Original Image</p>
                    <p className="mt-1 text-xs text-emerald-600">
                      Untouched uploaded image for comparison.
                    </p>
                  </div>
                  <div className="flex h-56 items-center justify-center bg-slate-100 p-3">
                    <img
                      src={compareOriginalSrc}
                      alt="Original uploaded image"
                      className="h-full w-full rounded-xl object-contain"
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
                  <div className="border-b border-emerald-100 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-900">Edited Image</p>
                    <p className="mt-1 text-xs text-emerald-600">
                      Current edited result shown beside the untouched original.
                    </p>
                  </div>
                  <div className="flex h-56 items-center justify-center bg-slate-100 p-3">
                    <img
                      src={imageSrc}
                      alt="Edited comparison preview"
                      className="h-full w-full rounded-xl object-contain"
                    />
                  </div>
                </div>
              </div>
            )}

            <div
              ref={containerRef}
              className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-slate-100 p-3"
            >
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Edited preview"
                onLoad={updatePreviewBounds}
                className="h-full w-full rounded-xl object-contain"
                style={{
                  transform: `rotate(${edits.rotation}deg)`,
                  transformOrigin: 'center',
                  willChange: 'transform',
                }}
              />

              {previewBounds && cropFrame && (
                <>
                  <div
                    className="pointer-events-none absolute bg-black/40"
                    style={{
                      left: previewBounds.left,
                      top: previewBounds.top,
                      width: previewBounds.width,
                      height: Math.max(0, cropFrame.top - previewBounds.top),
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bg-black/40"
                    style={{
                      left: previewBounds.left,
                      top: cropFrame.top,
                      width: Math.max(0, cropFrame.left - previewBounds.left),
                      height: cropFrame.height,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bg-black/40"
                    style={{
                      left: cropFrame.left + cropFrame.width,
                      top: cropFrame.top,
                      width: Math.max(
                        0,
                        previewBounds.left + previewBounds.width - (cropFrame.left + cropFrame.width)
                      ),
                      height: cropFrame.height,
                    }}
                  />
                  <div
                    className="pointer-events-none absolute bg-black/40"
                    style={{
                      left: previewBounds.left,
                      top: cropFrame.top + cropFrame.height,
                      width: previewBounds.width,
                      height: Math.max(
                        0,
                        previewBounds.top + previewBounds.height - (cropFrame.top + cropFrame.height)
                      ),
                    }}
                  />

                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                    style={{
                      left: cropFrame.left,
                      top: cropFrame.top,
                      width: cropFrame.width,
                      height: cropFrame.height,
                    }}
                  />

                  <div
                    ref={brushLayerRef}
                    className={`absolute overflow-hidden ${
                      editorMode === 'crop' ? 'pointer-events-none' : 'cursor-crosshair'
                    }`}
                    style={{
                      left: cropFrame.left,
                      top: cropFrame.top,
                      width: cropFrame.width,
                      height: cropFrame.height,
                    }}
                    onPointerDown={
                      editorMode === 'brush'
                        ? startBrushStroke
                        : editorMode === 'includeBrush'
                          ? startIncludeRegion
                          : editorMode === 'excludeBox'
                            ? startSelectionBox
                            : undefined
                    }
                    onPointerMove={
                      editorMode !== 'crop'
                        ? (event) => updateBrushCursor(event.clientX, event.clientY)
                        : undefined
                    }
                    onPointerEnter={
                      editorMode !== 'crop'
                        ? (event) => updateBrushCursor(event.clientX, event.clientY)
                        : undefined
                    }
                    onPointerLeave={
                      editorMode !== 'crop'
                        ? () => {
                            if (!isDrawing && !boxDraft) {
                              setBrushCursorPoint(null);
                            }
                          }
                        : undefined
                    }
                  >
                    {editorMode !== 'crop' && (
                      <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.28) 1px, transparent 1px)',
                          backgroundSize: `${100 / editorGridCols}% ${100 / editorGridRows}%`,
                          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                        }}
                      />
                    )}

                    <svg
                      className="absolute inset-0 h-full w-full"
                      viewBox={`0 0 ${Math.max(cropFrame.width, 1)} ${Math.max(cropFrame.height, 1)}`}
                    >
                      {includeRegions.length > 0 && (
                        <path
                          fill="rgba(15, 23, 42, 0.28)"
                          fillRule="evenodd"
                          d={[
                            `M 0 0 H ${cropFrame.width} V ${cropFrame.height} H 0 Z`,
                            ...includeRegions
                              .filter((region) => region.points.length >= 3)
                              .map((region) => {
                                const [firstPoint, ...otherPoints] = region.points;
                                return [
                                  `M ${firstPoint.x * cropFrame.width} ${firstPoint.y * cropFrame.height}`,
                                  ...otherPoints.map(
                                    (point) =>
                                      `L ${point.x * cropFrame.width} ${point.y * cropFrame.height}`
                                  ),
                                  'Z',
                                ].join(' ');
                              }),
                            ...(includeRegionDraft && includeRegionDraft.points.length >= 3
                              ? [
                                  [
                                    `M ${includeRegionDraft.points[0].x * cropFrame.width} ${includeRegionDraft.points[0].y * cropFrame.height}`,
                                    ...includeRegionDraft.points.slice(1).map(
                                      (point) =>
                                        `L ${point.x * cropFrame.width} ${point.y * cropFrame.height}`
                                    ),
                                    'Z',
                                  ].join(' '),
                                ]
                              : []),
                          ].join(' ')}
                        />
                      )}

                      {includeRegions.map((region) =>
                        region.points.length >= 2 ? (
                          <polygon
                            key={region.id}
                            points={region.points
                              .map(
                                (point) =>
                                  `${point.x * cropFrame.width},${point.y * cropFrame.height}`
                              )
                              .join(' ')}
                            fill="rgba(34, 197, 94, 0.14)"
                            stroke="rgba(22, 163, 74, 0.95)"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                          />
                        ) : null
                      )}

                      {includeRegionDraft && includeRegionDraft.points.length >= 2 && (
                        <polygon
                          points={includeRegionDraft.points
                            .map(
                              (point) =>
                                `${point.x * cropFrame.width},${point.y * cropFrame.height}`
                            )
                            .join(' ')}
                          fill="rgba(34, 197, 94, 0.18)"
                          stroke="rgba(22, 163, 74, 0.98)"
                          strokeWidth="2"
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      )}

                      {includeRegionDraft &&
                        includeRegionDraft.points.length >= 1 &&
                        editorMode === 'includeBrush' &&
                        brushCursorPoint && (
                          <line
                            x1={
                              includeRegionDraft.points[includeRegionDraft.points.length - 1].x *
                              cropFrame.width
                            }
                            y1={
                              includeRegionDraft.points[includeRegionDraft.points.length - 1].y *
                              cropFrame.height
                            }
                            x2={brushCursorPoint.x * cropFrame.width}
                            y2={brushCursorPoint.y * cropFrame.height}
                            stroke="rgba(22, 163, 74, 0.65)"
                            strokeWidth="2"
                            strokeDasharray="6 6"
                          />
                        )}

                      {excludeBoxes.map((box) => (
                        <rect
                          key={box.id}
                          x={box.x * cropFrame.width}
                          y={box.y * cropFrame.height}
                          width={box.width * cropFrame.width}
                          height={box.height * cropFrame.height}
                          fill="rgba(239, 68, 68, 0.14)"
                          stroke="rgba(220, 38, 38, 0.95)"
                          strokeWidth="2"
                          strokeDasharray="10 6"
                        />
                      ))}

                      {draftBox && (
                        <rect
                          x={draftBox.x * cropFrame.width}
                          y={draftBox.y * cropFrame.height}
                          width={draftBox.width * cropFrame.width}
                          height={draftBox.height * cropFrame.height}
                          fill="rgba(239, 68, 68, 0.18)"
                          stroke="rgba(220, 38, 38, 0.98)"
                          strokeWidth="2"
                          strokeDasharray="8 6"
                        />
                      )}

                      {brushStrokes.map((stroke, index) =>
                        stroke.points.length > 0 ? (
                          <polyline
                            key={`${index}-${stroke.points.length}`}
                            fill="none"
                            stroke="rgba(6, 182, 212, 0.75)"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={Math.max(
                              1,
                              (stroke.size / 100) *
                                Math.max(cropFrame.width, cropFrame.height)
                            )}
                            points={stroke.points
                              .map(
                                (point) =>
                                  `${point.x * cropFrame.width},${point.y * cropFrame.height}`
                              )
                              .join(' ')}
                          />
                        ) : null
                      )}
                    </svg>

                    {editorMode === 'brush' && brushCursorPoint && (
                      <div
                        className="pointer-events-none absolute rounded-full border-2 border-cyan-500 bg-cyan-400/15 shadow-[0_0_0_1px_rgba(255,255,255,0.9)]"
                        style={{
                          left: `${brushCursorPoint.x * 100}%`,
                          top: `${brushCursorPoint.y * 100}%`,
                          width: `${previewBrushDiameter}px`,
                          height: `${previewBrushDiameter}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    )}
                  </div>

                  {editorMode === 'crop' && (
                    <>
                      <button
                        type="button"
                        aria-label="Crop top left"
                        onPointerDown={(event) => startHandleDrag('topLeft', event)}
                        className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border border-black bg-white"
                        style={{ left: cropFrame.left, top: cropFrame.top }}
                      />
                      <button
                        type="button"
                        aria-label="Crop top right"
                        onPointerDown={(event) => startHandleDrag('topRight', event)}
                        className="absolute h-4 w-4 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize rounded-sm border border-black bg-white"
                        style={{ left: cropFrame.left + cropFrame.width, top: cropFrame.top }}
                      />
                      <button
                        type="button"
                        aria-label="Crop bottom left"
                        onPointerDown={(event) => startHandleDrag('bottomLeft', event)}
                        className="absolute h-4 w-4 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize rounded-sm border border-black bg-white"
                        style={{ left: cropFrame.left, top: cropFrame.top + cropFrame.height }}
                      />
                      <button
                        type="button"
                        aria-label="Crop bottom right"
                        onPointerDown={(event) => startHandleDrag('bottomRight', event)}
                        className="absolute h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-nwse-resize rounded-sm border border-black bg-white"
                        style={{
                          left: cropFrame.left + cropFrame.width,
                          top: cropFrame.top + cropFrame.height,
                        }}
                      />

                      <button
                        type="button"
                        aria-label="Crop top"
                        onPointerDown={(event) => startHandleDrag('top', event)}
                        className="absolute h-3 w-8 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize rounded-sm border border-black bg-white"
                        style={{ left: cropFrame.left + cropFrame.width / 2, top: cropFrame.top }}
                      />
                      <button
                        type="button"
                        aria-label="Crop bottom"
                        onPointerDown={(event) => startHandleDrag('bottom', event)}
                        className="absolute h-3 w-8 -translate-x-1/2 translate-y-1/2 cursor-ns-resize rounded-sm border border-black bg-white"
                        style={{
                          left: cropFrame.left + cropFrame.width / 2,
                          top: cropFrame.top + cropFrame.height,
                        }}
                      />
                      <button
                        type="button"
                        aria-label="Crop left"
                        onPointerDown={(event) => startHandleDrag('left', event)}
                        className="absolute h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black bg-white"
                        style={{ left: cropFrame.left, top: cropFrame.top + cropFrame.height / 2 }}
                      />
                      <button
                        type="button"
                        aria-label="Crop right"
                        onPointerDown={(event) => startHandleDrag('right', event)}
                        className="absolute h-8 w-3 translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm border border-black bg-white"
                        style={{
                          left: cropFrame.left + cropFrame.width,
                          top: cropFrame.top + cropFrame.height / 2,
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </div>
            <p className="mt-3 text-xs text-emerald-700">
              {editorMode === 'crop'
                ? 'Drag corner and side handles directly on the preview for precise crop, similar to Word.'
                : editorMode === 'includeBrush'
                  ? 'Draw the boundary of the area you want analyzed. The inside of your freehand shape is kept, and everything outside becomes null.'
                  : editorMode === 'excludeBox'
                    ? 'Drag obstacle boxes inside the included area to ignore weeds, roads, shadows, or other unwanted regions.'
                    : 'Paint over regions you want ignored. Brushed areas will be excluded from analysis.'}
            </p>
          </div>

          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <p className="mb-3 text-sm font-semibold text-emerald-900">Tool</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEditorMode('crop')}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
                    editorMode === 'crop'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Scissors className="h-4 w-4" />
                  Crop
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('includeBrush')}
                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium ${
                    editorMode === 'includeBrush'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Include Area
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('excludeBox')}
                  className={`inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium ${
                    editorMode === 'excludeBox'
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Exclude Box
                </button>
                <button
                  type="button"
                  onClick={() => setEditorMode('brush')}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${
                    editorMode === 'brush'
                      ? 'border-cyan-600 bg-cyan-600 text-white'
                      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <Brush className="h-4 w-4" />
                  Exclude Brush
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <RotateCw className="h-4 w-4" />
                Rotation
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => rotateBy(-90)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  -90°
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(90)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  <RotateCw className="h-4 w-4" />
                  +90°
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => rotateBy(-1)}
                  className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  -1°
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(-0.1)}
                  className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  -0.1°
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(0.1)}
                  className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  +0.1°
                </button>
              </div>

              <label className="mt-3 block">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-emerald-700">
                  <span>Rotation Angle</span>
                  <span>{edits.rotation.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="0.1"
                  value={edits.rotation}
                  onChange={(event) => setRotation(Number(event.currentTarget.value))}
                  className="w-full accent-emerald-600"
                />
              </label>

              <label className="mt-2 block">
                <span className="mb-1 block text-xs font-medium text-emerald-700">
                  Exact Rotation (°)
                </span>
                <input
                  type="number"
                  min="-180"
                  max="180"
                  step="0.1"
                  value={edits.rotation}
                  onChange={(event) => setRotation(Number(event.currentTarget.value))}
                  className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-sm text-emerald-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Scissors className="h-4 w-4" />
                Crop
              </div>

              <div className="space-y-3">
                {cropControls.map((control) => (
                  <label key={control.key} className="block">
                    <div className="mb-1 flex items-center justify-between text-xs font-medium text-emerald-700">
                      <span>{control.label}</span>
                      <span>{control.value.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="95"
                        step="0.1"
                        value={control.value}
                        onChange={(event) =>
                          setCrop(control.key, Number(event.currentTarget.value))
                        }
                        className="w-full accent-emerald-600"
                      />
                      <input
                        type="number"
                        min="0"
                        max="95"
                        step="0.1"
                        value={control.value}
                        onChange={(event) =>
                          setCrop(control.key, Number(event.currentTarget.value))
                        }
                        className="w-20 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs text-emerald-900 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-emerald-700">
                You can crop by dragging handles on the image or entering exact side values here.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-emerald-900">
                Include Area
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={undoIncludeRegion}
                  disabled={includeRegions.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoIncludeRegion}
                  disabled={redoIncludeRegions.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Redo
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={resetIncludeRegionsEditor}
                  disabled={includeRegions.length === 0 && redoIncludeRegions.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Include
                </button>
                <div className="flex flex-1 items-center justify-end text-xs font-medium text-emerald-700">
                  {includeRegions.length} area{includeRegions.length === 1 ? '' : 's'}
                </div>
              </div>

              <p className="mt-2 text-xs text-emerald-700">
                Use Include Area to freehand the exact region you want analyzed. Anything outside your drawn region becomes null and is skipped during analysis.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-emerald-900">
                Exclude Area Boxes
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={undoExcludeBox}
                  disabled={excludeBoxes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoExcludeBox}
                  disabled={redoExcludeBoxes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Redo
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={resetExcludeBoxesEditor}
                  disabled={excludeBoxes.length === 0 && redoExcludeBoxes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Exclude
                </button>
                <div className="flex flex-1 items-center justify-end text-xs font-medium text-emerald-700">
                  {excludeBoxes.length} box{excludeBoxes.length === 1 ? '' : 'es'}
                </div>
              </div>

              <p className="mt-2 text-xs text-emerald-700">
                Use Exclude Box for rectangular obstacles inside your included region. This works together with the freehand exclude brush when you need finer control.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Brush className="h-4 w-4" />
                Exclude Brush
              </div>

              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-emerald-700">
                  <span>Brush Size</span>
                  <span>{brushSize.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="12"
                  step="0.1"
                  value={brushSize}
                  onChange={(event) =>
                    setBrushSize(clampBrushSize(Number(event.currentTarget.value)))
                  }
                  className="w-full accent-cyan-600"
                />
              </label>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={undoBrushStroke}
                  disabled={brushStrokes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={redoBrushStroke}
                  disabled={redoBrushStrokes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Redo
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={resetBrushEditor}
                  disabled={brushStrokes.length === 0 && redoBrushStrokes.length === 0}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reset Brush
                </button>
                <div className="flex flex-1 items-center justify-end text-xs font-medium text-emerald-700">
                  {brushStrokes.length} stroke{brushStrokes.length === 1 ? '' : 's'}
                </div>
              </div>

              <p className="mt-2 text-xs text-emerald-700">
                Switch to Exclude Brush, paint over unwanted areas, then save. The live circle shows the real paint target, and marked parts will not be counted during analysis.
              </p>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetEditor}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
              >
                Cancel
              </button>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Saving...' : 'Apply Image Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
