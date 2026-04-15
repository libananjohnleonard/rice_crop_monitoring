import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  AnalysisInput,
  UploadImageItem,
  UploadCategory,
  UploadSourceType,
} from './UploadImages';
import { ImageEditorModal } from './ImageEditorModal';
import { supabase } from '../lib/supabaseClient';
import {
  softenExclusionMaskPreview,
  softenFieldBoundaryPreview,
} from '../lib/imageEditing';

export type AnalysisResultDetails = {
  status: 'Healthy' | 'Moderate' | 'Poor';
  harvestReady?: boolean;
  harvestStatus?: 'Not Ready' | 'Nearly Ready' | 'Ready to Harvest' | 'Needs Attention or Overripe';
  healthScore: number;
  green: number;
  yellow: number;
  brown: number;
  totalSections?: number;
  healthySections?: number;
  warningSections?: number;
  poorSections?: number;
  selectedSectionId?: string;
  gridEstimate?: string;
  recommendations?: string;
  analysisVersion?: number;
  parentAnalysisResultId?: string | null;
  interpretation: string;
  gridRows?: number;
  gridCols?: number;
  sections?: SectionResult[];
};

export type SectionResult = {
  id?: string;
  plantImageId?: string | null;
  sectionLabel: string;
  rowIndex: number;
  colIndex: number;
  healthStatus: 'Healthy' | 'Moderate' | 'Poor';
  healthScore: number;
  greenPercentage: number;
  yellowPercentage: number;
  brownPercentage: number;
  recommendations?: string;
  isExcluded?: boolean;
  excludeReason?: string | null;
  parentSectionId?: string | null;
  level?: number;
  gridRows?: number | null;
  gridCols?: number | null;
};

export type WholeFieldImageResult = AnalysisResultDetails & {
  imageIndex: number;
  imageId?: string | null;
  imageLabel: string;
};

export type AnalysisHistoryItem = AnalysisInput & {
  id: string;
  createdAt: string;
  result: AnalysisResultDetails & {
    imageResults?: WholeFieldImageResult[];
  };
};

type Props = {
  showLatestOnly?: boolean;
  data?: AnalysisHistoryItem | null;
  history?: AnalysisHistoryItem[];
  historyView?: 'card' | 'list';
  onClear?: () => void;
  onReanalyze?: (payload: {
    excludedSections: string[];
    imageIndex?: number;
  }) => void | Promise<void>;
  onUpdateImage?: (payload: {
    imageIndex: number;
    image: UploadImageItem;
  }) => void | Promise<void>;
  onSelectHistoryItem?: (item: AnalysisHistoryItem) => void;
  selectedHistoryId?: string | null;
};

const LIST_DISPLAY_LIMIT = 5;
const CARD_DISPLAY_LIMIT = 6;

function categoryLabel(category: UploadCategory) {
  switch (category) {
    case 'whole_field':
      return 'Whole Field';
    case 'partial_field':
      return 'Partial Field';
    case 'close_up':
      return 'Close-up';
    default:
      return 'Unknown';
  }
}

function sourceTypeLabel(sourceType: UploadSourceType) {
  switch (sourceType) {
    case 'upload':
      return 'Upload';
    case 'wifi':
      return 'Wi-Fi';
    case 'bluetooth':
      return 'Bluetooth';
    case 'webcam':
      return 'Webcam';
    default:
      return 'Unknown';
  }
}

function normalizeGroupingText(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

function statusClasses(status: string) {
  switch (status) {
    case 'Healthy':
      return 'bg-emerald-100 text-emerald-700';
    case 'Moderate':
      return 'bg-amber-100 text-amber-700';
    case 'Poor':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function harvestStatusClasses(
  harvestStatus?: AnalysisResultDetails['harvestStatus']
) {
  switch (harvestStatus) {
    case 'Ready to Harvest':
      return 'bg-amber-100 text-amber-800';
    case 'Nearly Ready':
      return 'bg-yellow-100 text-yellow-800';
    case 'Needs Attention or Overripe':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function harvestStatusLabel(
  harvestStatus?: AnalysisResultDetails['harvestStatus'],
  harvestReady?: boolean
) {
  if (harvestStatus) return harvestStatus;
  return harvestReady ? 'Ready to Harvest' : 'Not Ready';
}

function overlayCellClasses(
  status: SectionResult['healthStatus'],
  excluded: boolean
) {
  if (excluded) return 'bg-slate-500/20';

  switch (status) {
    case 'Healthy':
      return 'bg-emerald-400/15';
    case 'Moderate':
      return 'bg-yellow-400/18';
    case 'Poor':
      return 'bg-red-400/18';
    default:
      return 'bg-transparent';
  }
}

function overlayLabelClasses(
  status?: SectionResult['healthStatus'],
  excluded = false
) {
  if (excluded) {
    return 'bg-slate-700/80 text-slate-100';
  }

  switch (status) {
    case 'Healthy':
      return 'bg-emerald-600/90 text-white';
    case 'Moderate':
      return 'bg-yellow-500/95 text-yellow-950';
    case 'Poor':
      return 'bg-red-600/90 text-white';
    default:
      return 'bg-black/45 text-white';
  }
}

function clampGridSize(value?: number) {
  if (!value || Number.isNaN(value)) return 4;
  return Math.max(1, Math.min(8, value));
}

type GpsDisplayFormat = 'decimal' | 'dms' | 'both';

function toDms(
  value: number,
  positiveDirection: 'N' | 'E',
  negativeDirection: 'S' | 'W'
) {
  const direction = value >= 0 ? positiveDirection : negativeDirection;
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  return `${degrees}° ${minutes}' ${seconds.toFixed(6)}" ${direction}`;
}

function EmptyWorkspace() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-50/80 px-3 py-2">
        <p className="text-sm font-semibold text-emerald-900">
          Analysis Workspace
        </p>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
          Waiting
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">Whole Field</p>
          <p className="mt-1 font-medium text-emerald-900">Grid analysis</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-700">Section</p>
          <p className="mt-1 font-medium text-slate-900">Focused area</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-700">Close-up</p>
          <p className="mt-1 font-medium text-slate-900">Plant inspection</p>
        </div>
      </div>

      <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-slate-50 px-6 text-center">
        <div className="mb-3 text-5xl">📊</div>
        <p className="font-semibold text-emerald-900">No analysis yet</p>
        <p className="mt-1 text-sm text-emerald-600">
          Upload images and run analysis.
        </p>
      </div>
    </div>
  );
}

function GridOverlayPreview({
  imageSrc,
  originalImageSrc,
  sections = [],
  gridRows = 4,
  gridCols = 4,
  excludedSections,
  onToggleExclude,
  onOpenPreview,
}: {
  imageSrc: string;
  originalImageSrc?: string;
  sections?: SectionResult[];
  gridRows?: number;
  gridCols?: number;
  excludedSections: Set<string>;
  onToggleExclude: (sectionLabel: string) => void | Promise<void>;
  onOpenPreview: () => void;
}) {
  const [hoveredCell, setHoveredCell] = useState<SectionResult | null>(null);
  const [pinnedCell, setPinnedCell] = useState<SectionResult | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(4 / 3);
  const [displayImageSrc, setDisplayImageSrc] = useState(imageSrc);
  const [previewImageSrc, setPreviewImageSrc] = useState(imageSrc);

  const rows = clampGridSize(gridRows);
  const cols = clampGridSize(gridCols);

  useEffect(() => {
    let cancelled = false;

    const renderDisplayImage = async () => {
      try {
        const softenedPreview = await softenExclusionMaskPreview(imageSrc);
        if (!cancelled) {
          setDisplayImageSrc(softenedPreview);
        }
      } catch {
        if (!cancelled) {
          setDisplayImageSrc(imageSrc);
        }
      }
    };

    void renderDisplayImage();

    return () => {
      cancelled = true;
    };
  }, [imageSrc]);

  useEffect(() => {
    let cancelled = false;

    const renderPreviewImage = async () => {
      if (!originalImageSrc || originalImageSrc === imageSrc) {
        setPreviewImageSrc(imageSrc);
        return;
      }

      try {
        const softenedPreview = await softenFieldBoundaryPreview(imageSrc);
        if (!cancelled) {
          setPreviewImageSrc(softenedPreview);
        }
      } catch {
        if (!cancelled) {
          setPreviewImageSrc(imageSrc);
        }
      }
    };

    void renderPreviewImage();

    return () => {
      cancelled = true;
    };
  }, [imageSrc, originalImageSrc]);

  const sectionMap = useMemo(() => {
    const map = new Map<string, SectionResult>();
    sections.forEach((section) => {
      map.set(`${section.rowIndex}-${section.colIndex}`, section);
    });
    return map;
  }, [sections]);

  const cells = useMemo(() => {
    const items: Array<{
      key: string;
      section?: SectionResult;
      rowIndex: number;
      colIndex: number;
      label: string;
    }> = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const found = sectionMap.get(`${row}-${col}`);
        const fallbackLabel = `${String.fromCharCode(65 + row)}${col + 1}`;
        items.push({
          key: `${row}-${col}`,
          section: found,
          rowIndex: row,
          colIndex: col,
          label: found?.sectionLabel ?? fallbackLabel,
        });
      }
    }

    return items;
  }, [rows, cols, sectionMap]);

  const activeCell = pinnedCell ?? hoveredCell;
  const activeExcluded = activeCell
    ? excludedSections.has(activeCell.sectionLabel)
    : false;
  const previewModeLabel =
    originalImageSrc && originalImageSrc !== imageSrc ? 'Edited' : 'Original';

  const handleCellClick = (section?: SectionResult) => {
    if (!section) return;

    if (pinnedCell?.sectionLabel === section.sectionLabel) {
      setPinnedCell(null);
      return;
    }

    setPinnedCell(section);
  };

  return (
    <div className="space-y-3">
      <div className={originalImageSrc ? 'grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]' : ''}>
        {originalImageSrc && (
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40">
            <div className="border-b border-emerald-100 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-900">Original Preview</p>
              <p className="mt-1 text-xs text-emerald-600">
                Untouched uploaded image for comparison.
              </p>
            </div>
            <div className="flex min-h-[220px] items-center justify-center bg-slate-100 p-3">
              <div
                className="relative w-full max-w-full overflow-hidden rounded-xl bg-slate-100"
                style={{ aspectRatio: `${imageAspectRatio}` }}
              >
                <img
                  src={originalImageSrc}
                  alt="Original uploaded preview"
                  className="h-full w-full object-contain"
                />
                <div
                  className="pointer-events-none absolute inset-0 grid"
                  style={{
                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  }}
                >
                  {cells.map((cell) => (
                    <div
                      key={`original-${cell.key}`}
                      className="border border-white/60 bg-transparent"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        <div>
          <button
            type="button"
            onClick={onOpenPreview}
            className="block w-full"
            title="Open full preview"
          >
            <div
              className="relative w-full max-w-full overflow-hidden rounded-xl bg-slate-100"
              style={{ aspectRatio: `${imageAspectRatio}` }}
            >
              <div className="pointer-events-none absolute left-4 top-3 z-10">
                <p className="text-base font-semibold text-emerald-900">
                  Preview: <span className="text-emerald-700">{previewModeLabel}</span>
                </p>
              </div>
              {previewModeLabel === 'Edited' && originalImageSrc && (
                <>
                  <img
                    src={originalImageSrc}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full scale-[1.01] object-contain opacity-85 blur-[1.5px]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-black/16" />
                </>
              )}
              <img
                src={previewImageSrc}
                alt="Uploaded preview"
                className="relative h-full w-full object-contain"
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setImageAspectRatio(naturalWidth / naturalHeight);
                  }
                }}
              />
              {previewModeLabel === 'Edited' && (
                <img
                  src={previewImageSrc}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-20"
                  style={{
                    filter:
                      'sepia(1) saturate(6) hue-rotate(32deg) brightness(0.95)',
                  }}
                />
              )}
              {previewModeLabel === 'Edited' && (
                <img
                  src={previewImageSrc}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                  style={{
                    filter:
                      'drop-shadow(0 0 0.75px rgba(16, 185, 129, 0.95)) drop-shadow(0 0 1.25px rgba(16, 185, 129, 0.75))',
                  }}
                />
              )}
              <div
                className="pointer-events-none absolute inset-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }}
              >
                {cells.map((cell) => (
                  <div
                    key={`edited-${cell.key}`}
                    className="border border-white/60 bg-transparent"
                  />
                ))}
              </div>
            </div>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-emerald-900">
            Section Overlay
          </p>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            {rows}×{cols} grid
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Healthy
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 px-2 py-1 text-yellow-700">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            Moderate
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-700">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Poor
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-slate-700">
            <span className="h-2 w-2 rounded-full bg-slate-500" />
            Excluded
          </span>
        </div>

        <div
          className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl bg-slate-100"
          style={{ aspectRatio: `${imageAspectRatio}` }}
        >
          <img
            src={displayImageSrc}
            alt="Grid overlay preview"
            className="h-full w-full object-fill"
          />

          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            }}
          >
            {cells.map((cell) => {
              const excluded = cell.section
                ? excludedSections.has(cell.section.sectionLabel)
                : false;

              const isPinned =
                pinnedCell?.sectionLabel &&
                cell.section?.sectionLabel === pinnedCell.sectionLabel;

              return (
                <div
                  key={cell.key}
                  className={`relative border border-white/80 ${
                    cell.section
                      ? overlayCellClasses(cell.section.healthStatus, excluded)
                      : ''
                  } ${isPinned ? 'ring-2 ring-emerald-500' : ''}`}
                  onMouseEnter={() => {
                    if (!pinnedCell) setHoveredCell(cell.section ?? null);
                  }}
                  onMouseLeave={() => {
                    if (!pinnedCell) setHoveredCell(null);
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleCellClick(cell.section)}
                    className="absolute inset-0 h-full w-full bg-transparent hover:bg-white/10"
                    title={cell.label}
                  />

                  <span
                    className={`absolute left-1 top-1 z-10 px-1.5 py-0.5 text-[10px] font-semibold ${overlayLabelClasses(
                      cell.section?.healthStatus,
                      excluded
                    )}`}
                  >
                    {cell.label}
                  </span>

                  {cell.section && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleExclude(cell.section!.sectionLabel);
                      }}
                      className={`absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center text-[10px] font-bold text-white ${
                        excluded ? 'bg-emerald-600' : 'bg-red-600'
                      }`}
                      title={excluded ? 'Include section' : 'Exclude section'}
                    >
                      {excluded ? '↺' : '×'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-emerald-200 bg-slate-50 p-3">
          {activeCell ? (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-emerald-600">Selected Section</p>
                  <p className="font-semibold text-emerald-900">
                    {activeCell.sectionLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleExclude(activeCell.sectionLabel)}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                      activeExcluded
                        ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    <X className="h-4 w-4" />
                    {activeExcluded ? 'Include' : 'Exclude'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPinnedCell(null);
                      setHoveredCell(null);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-emerald-600">Section Health Status</p>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(
                      activeCell.healthStatus
                    )}`}
                  >
                    {activeCell.healthStatus}
                  </span>
                </div>

                <div>
                  <p className="text-xs text-emerald-600">Health Score</p>
                  <p className="font-semibold text-emerald-900">
                    {activeCell.healthScore}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-emerald-600">Green</p>
                  <p className="font-semibold text-emerald-900">
                    {activeCell.greenPercentage.toFixed(1)}%
                  </p>
                </div>

                <div>
                  <p className="text-xs text-emerald-600">Yellow</p>
                  <p className="font-semibold text-emerald-900">
                    {activeCell.yellowPercentage.toFixed(1)}%
                  </p>
                </div>

                <div>
                  <p className="text-xs text-emerald-600">Brown</p>
                  <p className="font-semibold text-emerald-900">
                    {activeCell.brownPercentage.toFixed(1)}%
                  </p>
                </div>

                <div>
                  <p className="text-xs text-emerald-600">Analysis State</p>
                  <p className="font-semibold text-emerald-900">
                    {activeExcluded ? 'Excluded' : 'Included'}
                  </p>
                </div>
              </div>

              {activeCell.recommendations && (
                <div>
                  <p className="text-xs text-emerald-600">Recommendation</p>
                  <p className="font-medium text-emerald-900">
                    {activeCell.recommendations}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-emerald-700">
              Hover a section to preview it, or click a section to keep its details open.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Workspace({
  showLatestOnly = false,
  data,
  history,
  onClear,
  onReanalyze,
  onUpdateImage,
  onSelectHistoryItem,
}: {
  showLatestOnly?: boolean;
  data?: AnalysisHistoryItem | null;
  history?: AnalysisHistoryItem[];
  onClear?: () => void;
  onReanalyze?: (payload: {
    excludedSections: string[];
    imageIndex?: number;
  }) => void | Promise<void>;
  onUpdateImage?: (payload: {
    imageIndex: number;
    image: UploadImageItem;
  }) => void | Promise<void>;
  onSelectHistoryItem?: (item: AnalysisHistoryItem) => void;
}) {
  const [excludedSections, setExcludedSections] = useState<Set<string>>(new Set());
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isSavingExcluded, setIsSavingExcluded] = useState(false);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [gpsDisplayFormat, setGpsDisplayFormat] = useState<GpsDisplayFormat>('dms');

  const wholeFieldImageResults = data?.result.imageResults ?? [];
  const imageCount = data?.images.length ?? 0;
  const resultImageCount = wholeFieldImageResults.length;
  const navigableImageCount = Math.max(imageCount, resultImageCount);
  const hasMultipleImages = navigableImageCount > 1;
  const relatedGroupedHistoryItems = useMemo(() => {
    if (!showLatestOnly || !data || !history || hasMultipleImages) {
      return [];
    }

    if (data.images.length !== 1) {
      return [];
    }

    const createdAt = new Date(data.createdAt).getTime();
    const notesKey = normalizeGroupingText(data.notes);

    return history
      .filter((item) => {
        if (item.images.length !== 1) return false;
        if (item.category !== data.category) return false;
        if (item.sourceType !== data.sourceType) return false;
        if ((item.flightHeightM ?? null) !== (data.flightHeightM ?? null)) return false;
        if (normalizeGroupingText(item.notes) !== notesKey) return false;

        const itemCreatedAt = new Date(item.createdAt).getTime();
        if (Number.isNaN(createdAt) || Number.isNaN(itemCreatedAt)) return item.id === data.id;

        return Math.abs(itemCreatedAt - createdAt) <= 2 * 60 * 1000;
      })
      .sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
  }, [data, hasMultipleImages, history, showLatestOnly]);
  const relatedGroupIndex = relatedGroupedHistoryItems.findIndex(
    (item) => item.id === data?.id
  );
  const hasRelatedGroupedHistory = relatedGroupedHistoryItems.length > 1;
  const hasPerImageWholeFieldResults =
    data?.category === 'whole_field' && wholeFieldImageResults.length > 0;
  const safeImageIndex =
    navigableImageCount > 0 && currentImageIndex >= navigableImageCount ? 0 : currentImageIndex;
  const activeResult =
    wholeFieldImageResults[safeImageIndex] ??
    (hasPerImageWholeFieldResults
      ? undefined
      : data?.result);
  const activeImage = data?.images[safeImageIndex] ?? data?.images[0];
  const hasOriginalPreview =
    Boolean(activeImage?.originalPreview) &&
    activeImage?.originalPreview !== activeImage?.preview;
  const previewModeLabel = hasOriginalPreview ? 'Edited' : 'Original';
  const [previewDisplaySrc, setPreviewDisplaySrc] = useState<string | null>(null);

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [data?.id]);

  useEffect(() => {
    let cancelled = false;

    const renderPreviewDisplay = async () => {
      if (!activeImage?.preview) {
        setPreviewDisplaySrc(null);
        return;
      }

      if (!hasOriginalPreview) {
        setPreviewDisplaySrc(activeImage.preview);
        return;
      }

      try {
        const softenedPreview = await softenFieldBoundaryPreview(activeImage.preview);
        if (!cancelled) {
          setPreviewDisplaySrc(softenedPreview);
        }
      } catch {
        if (!cancelled) {
          setPreviewDisplaySrc(activeImage.preview);
        }
      }
    };

    void renderPreviewDisplay();

    return () => {
      cancelled = true;
    };
  }, [activeImage?.preview, hasOriginalPreview]);

  useEffect(() => {
    const nextExcluded = new Set(
      (activeResult?.sections ?? [])
        .filter((section) => section.isExcluded)
        .map((section) => section.sectionLabel)
    );

    setExcludedSections(nextExcluded);
  }, [activeResult?.sections, data?.id, safeImageIndex]);

  if (!data) return <EmptyWorkspace />;

  const isWhole = data.category === 'whole_field';
  const gridRows = clampGridSize(activeResult?.gridRows);
  const gridCols = clampGridSize(activeResult?.gridCols);
  const hasGpsData =
    typeof activeImage?.latitude === 'number' ||
    typeof activeImage?.longitude === 'number' ||
    typeof activeImage?.altitude === 'number';
  const hasGpsCoordinates =
    typeof activeImage?.latitude === 'number' &&
    typeof activeImage?.longitude === 'number';
  const googleMapsUrl = hasGpsCoordinates
    ? `https://www.google.com/maps?q=${activeImage.latitude},${activeImage.longitude}`
    : '';

  const decimalLatitude =
    typeof activeImage?.latitude === 'number'
      ? String(activeImage.latitude)
      : 'GPS not available';
  const decimalLongitude =
    typeof activeImage?.longitude === 'number'
      ? String(activeImage.longitude)
      : 'GPS not available';
  const dmsLatitude =
    typeof activeImage?.latitude === 'number'
      ? toDms(activeImage.latitude, 'N', 'S')
      : 'GPS not available';
  const dmsLongitude =
    typeof activeImage?.longitude === 'number'
      ? toDms(activeImage.longitude, 'E', 'W')
      : 'GPS not available';
  const formattedAltitude =
    typeof activeImage?.altitude === 'number'
      ? `${activeImage.altitude} m`
      : 'GPS not available';

  const savedSummary = {
    status: activeResult?.status ?? data.result.status,
    harvestReady: activeResult?.harvestReady ?? data.result.harvestReady ?? false,
    harvestStatus: (
      activeResult?.harvestStatus ??
      data.result.harvestStatus ??
      ((activeResult?.harvestReady ?? data.result.harvestReady)
        ? 'Ready to Harvest'
        : 'Not Ready')
    ),
    healthScore: activeResult?.healthScore ?? data.result.healthScore,
    green: activeResult?.green ?? data.result.green,
    yellow: activeResult?.yellow ?? data.result.yellow,
    brown: activeResult?.brown ?? data.result.brown,
    totalSections: activeResult?.totalSections ?? data.result.totalSections ?? 0,
    healthySections:
      activeResult?.healthySections ?? data.result.healthySections ?? 0,
    warningSections:
      activeResult?.warningSections ?? data.result.warningSections ?? 0,
    poorSections: activeResult?.poorSections ?? data.result.poorSections ?? 0,
  };

  const toggleExcludeSection = async (sectionLabel: string) => {
    const targetSection = (activeResult?.sections ?? []).find(
      (section) => section.sectionLabel === sectionLabel
    );

    if (!targetSection?.id || isSavingExcluded) return;

    const shouldExclude = !excludedSections.has(sectionLabel);
    const nextExcluded = new Set(excludedSections);

    if (shouldExclude) {
      nextExcluded.add(sectionLabel);
    } else {
      nextExcluded.delete(sectionLabel);
    }

    setExcludedSections(nextExcluded);
    setIsSavingExcluded(true);

    try {
      if (!supabase) {
        throw new Error('Supabase is not configured');
      }
      const { error } = await supabase
        .from('analysis_sections')
        .update({
          is_excluded: shouldExclude,
          excluded_at: shouldExclude ? new Date().toISOString() : null,
          exclude_reason: shouldExclude ? 'Excluded from UI grid selection' : null,
        })
        .eq('id', targetSection.id);

      if (error) throw error;
    } catch (error) {
      setExcludedSections(excludedSections);
      console.error('Save excluded section error:', error);
    } finally {
      setIsSavingExcluded(false);
    }
  };

  const handleReanalyzeClick = async () => {
    if (!onReanalyze) return;

    try {
      setIsReanalyzing(true);
      await onReanalyze({
        excludedSections: Array.from(excludedSections),
        imageIndex: hasPerImageWholeFieldResults ? safeImageIndex : undefined,
      });
    } finally {
      setIsReanalyzing(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-emerald-900">
          Analysis Workspace
        </p>

        <div className="flex items-center gap-2">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50"
            >
              Clear
            </button>
          )}

          {onUpdateImage && (
            <button
              type="button"
              onClick={() => setIsEditorOpen(true)}
              disabled={!activeImage || isSavingImage}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <Pencil className="h-4 w-4" />
              {isSavingImage ? 'Saving image...' : 'Edit Image'}
            </button>
          )}

          {onReanalyze && (
            <button
              type="button"
              onClick={handleReanalyzeClick}
              disabled={isReanalyzing}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw className="h-4 w-4" />
              {isReanalyzing ? 'Re-analyzing...' : 'Re-analyze'}
            </button>
          )}

          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${harvestStatusClasses(
              savedSummary.harvestStatus
            )}`}
          >
            Harvest Status: {harvestStatusLabel(savedSummary.harvestStatus, savedSummary.harvestReady)}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
              savedSummary.status
            )}`}
          >
            Overall Health: {savedSummary.status}
          </span>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-5">
        <div className="rounded-xl bg-emerald-100 p-2.5">
          <p className="text-xs text-emerald-700">Health Points</p>
          <p className="mt-1 text-xl font-bold text-emerald-900">
            {savedSummary.healthScore}
          </p>
        </div>
        <div className="rounded-xl bg-green-50 p-2.5">
          <p className="text-xs text-green-700">Green</p>
          <p className="mt-1 text-xl font-bold text-green-700">
            {savedSummary.green.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl bg-yellow-50 p-2.5">
          <p className="text-xs text-yellow-700">Yellow</p>
          <p className="mt-1 text-xl font-bold text-yellow-700">
            {savedSummary.yellow.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl bg-orange-50 p-2.5">
          <p className="text-xs text-orange-700">Brown</p>
          <p className="mt-1 text-xl font-bold text-orange-700">
            {savedSummary.brown.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl bg-amber-50 p-2.5">
          <p className="text-xs text-amber-700">Harvest Status</p>
          <p className="mt-1 text-base font-bold text-amber-800">
            {harvestStatusLabel(savedSummary.harvestStatus, savedSummary.harvestReady)}
          </p>
        </div>
      </div>

      <div className={`grid gap-2.5 ${isWhole ? 'sm:grid-cols-4' : 'sm:grid-cols-5'}`}>
        <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
          <p className="text-xs text-emerald-600">Category</p>
          <p className="mt-1 font-semibold text-emerald-900">
            {categoryLabel(data.category)}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-3">
          <p className="text-xs text-emerald-600">Source</p>
          <p className="mt-1 font-semibold text-emerald-900">
            {sourceTypeLabel(data.sourceType)}
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
          <p className="text-xs text-emerald-600">Altitude Source</p>
          <p className="mt-1 font-semibold text-emerald-900">
            From image EXIF geotag
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-emerald-600">GPS Data</p>
            <select
              value={gpsDisplayFormat}
              onChange={(event) =>
                setGpsDisplayFormat(event.target.value as GpsDisplayFormat)
              }
              className="rounded-md border border-emerald-200 bg-white px-1.5 py-1 text-[11px] font-medium text-emerald-700 outline-none focus:border-emerald-400"
            >
              <option value="decimal">Decimal</option>
              <option value="dms">DMS</option>
              <option value="both">Both</option>
            </select>
          </div>
          {hasGpsData ? (
            <>
              <div className="mt-1 space-y-0.5 text-xs font-semibold text-emerald-900">
                {gpsDisplayFormat !== 'dms' && <p>Latitude: {decimalLatitude}</p>}
                {gpsDisplayFormat !== 'dms' && <p>Longitude: {decimalLongitude}</p>}
                {gpsDisplayFormat !== 'decimal' && <p>Latitude (DMS): {dmsLatitude}</p>}
                {gpsDisplayFormat !== 'decimal' && <p>Longitude (DMS): {dmsLongitude}</p>}
                <p>Altitude: {formattedAltitude}</p>
              </div>
              {hasGpsCoordinates && (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Open in Google Maps
                </a>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold text-slate-500">
              GPS not available
            </p>
          )}
        </div>

        {!isWhole && (
          <div className="rounded-xl border border-emerald-200 bg-white p-2.5">
            <p className="text-xs text-emerald-600">Images</p>
            <p className="mt-1 font-semibold text-emerald-900">
              {`${data.images.length} selected`}
            </p>
          </div>
        )}
      </div>

      {(isWhole || data.category === 'partial_field') && (
        <div className="grid gap-2.5 sm:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-xs text-slate-600">Sections</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {savedSummary.totalSections}
            </p>
          </div>
          <div className="rounded-xl bg-green-50 p-2.5">
            <p className="text-xs text-green-700">Healthy</p>
            <p className="mt-1 text-lg font-bold text-green-700">
              {savedSummary.healthySections}
            </p>
          </div>
          <div className="rounded-xl bg-yellow-50 p-2.5">
            <p className="text-xs text-yellow-700">Warning</p>
            <p className="mt-1 text-lg font-bold text-yellow-700">
              {savedSummary.warningSections}
            </p>
          </div>
          <div className="rounded-xl bg-red-50 p-2.5">
            <p className="text-xs text-red-700">Poor</p>
            <p className="mt-1 text-lg font-bold text-red-700">
              {savedSummary.poorSections}
            </p>
          </div>
          <div className="rounded-xl bg-slate-100 p-2.5">
            <p className="text-xs text-slate-600">Excluded</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {excludedSections.size}
            </p>
          </div>
        </div>
      )}

      {(isWhole || data.category === 'partial_field') && (
        <p className="text-xs font-medium text-emerald-700">
          Section Health Status Breakdown
        </p>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-slate-50 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-emerald-900">Preview</h3>
          <div className="flex items-center gap-2">
            {hasGpsCoordinates && (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <MapPin className="h-3.5 w-3.5" />
                Google Maps
              </a>
            )}
            {hasMultipleImages ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev))
                  }
                  disabled={safeImageIndex === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {`Image ${safeImageIndex + 1} of ${navigableImageCount}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev < navigableImageCount - 1 ? prev + 1 : prev
                    )
                  }
                  disabled={safeImageIndex >= navigableImageCount - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : hasRelatedGroupedHistory ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (relatedGroupIndex <= 0) return;
                    onSelectHistoryItem?.(relatedGroupedHistoryItems[relatedGroupIndex - 1]);
                  }}
                  disabled={relatedGroupIndex <= 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </button>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  {`Upload ${relatedGroupIndex + 1} of ${relatedGroupedHistoryItems.length}`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (relatedGroupIndex >= relatedGroupedHistoryItems.length - 1) return;
                    onSelectHistoryItem?.(relatedGroupedHistoryItems[relatedGroupIndex + 1]);
                  }}
                  disabled={relatedGroupIndex >= relatedGroupedHistoryItems.length - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {isWhole ? 'Grid View' : 'Adaptive View'}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-2.5">
          {activeImage &&
            hasOriginalPreview &&
            !(isWhole || data.category === 'partial_field') && (
            <div className="mb-3 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40">
              <div className="border-b border-emerald-100 px-4 py-3">
                <p className="text-sm font-semibold text-emerald-900">
                  Original Preview
                </p>
                <p className="mt-1 text-xs text-emerald-600">
                  Untouched uploaded image for comparison.
                </p>
              </div>
              <div className="flex min-h-[220px] items-center justify-center bg-slate-100 p-3">
                <img
                  src={activeImage.originalPreview}
                  alt="Original analysis preview"
                  className="max-h-72 w-full rounded-xl object-contain"
                />
              </div>
            </div>
          )}
          {activeImage ? (
            isWhole || data.category === 'partial_field' ? (
              <GridOverlayPreview
                imageSrc={activeImage.preview}
                originalImageSrc={activeImage.originalPreview}
                sections={activeResult?.sections}
                gridRows={gridRows}
                gridCols={gridCols}
                excludedSections={excludedSections}
                onToggleExclude={toggleExcludeSection}
                onOpenPreview={() => setIsEditorOpen(true)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsEditorOpen(true)}
                className="block w-full"
                title="Open full preview"
              >
                <div className="relative overflow-hidden rounded-xl bg-slate-100">
                  <div className="pointer-events-none absolute left-4 top-3 z-10">
                    <p className="text-base font-semibold text-emerald-900">
                      Preview: <span className="text-emerald-700">{previewModeLabel}</span>
                    </p>
                  </div>
                  {hasOriginalPreview && activeImage.originalPreview && (
                    <>
                      <img
                        src={activeImage.originalPreview}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 h-full max-h-72 w-full scale-[1.01] object-contain opacity-85 blur-[1.5px]"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-black/16" />
                    </>
                  )}
                  <img
                    src={previewDisplaySrc ?? activeImage.preview}
                    alt="Analysis preview"
                    className="relative max-h-72 w-full object-contain"
                  />
                  {hasOriginalPreview && (
                    <img
                      src={previewDisplaySrc ?? activeImage.preview}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full max-h-72 w-full object-contain opacity-20"
                      style={{
                        filter:
                          'sepia(1) saturate(6) hue-rotate(32deg) brightness(0.95)',
                      }}
                    />
                  )}
                  {hasOriginalPreview && (
                    <img
                      src={previewDisplaySrc ?? activeImage.preview}
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 h-full max-h-72 w-full object-contain"
                      style={{
                        filter:
                          'drop-shadow(0 0 0.75px rgba(16, 185, 129, 0.95)) drop-shadow(0 0 1.25px rgba(16, 185, 129, 0.75))',
                      }}
                    />
                  )}
                </div>
              </button>
            )
          ) : (
              <div className="flex h-44 items-center justify-center text-5xl">
              📊
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-200 bg-white p-3">
        <p className="text-sm font-semibold text-emerald-900">Interpretation</p>
        <p className="mt-1 text-sm text-emerald-700">
          {activeResult?.interpretation ?? data.result.interpretation}
        </p>
      </div>

      {activeImage && isEditorOpen && onUpdateImage && (
        <ImageEditorModal
          open
          imageSrc={activeImage.preview}
          originalImageSrc={activeImage.originalPreview}
          fileName={activeImage.file?.name || `analysis-image-${safeImageIndex + 1}.png`}
          title={`Edit ${hasMultipleImages ? `Image ${safeImageIndex + 1}` : 'Analysis Image'}`}
          gridRows={gridRows}
          gridCols={gridCols}
          currentImageIndex={safeImageIndex}
          totalImages={navigableImageCount}
          onPrevImage={() =>
            setCurrentImageIndex((prev) => (prev > 0 ? prev - 1 : prev))
          }
          onNextImage={() =>
            setCurrentImageIndex((prev) =>
              prev < navigableImageCount - 1 ? prev + 1 : prev
            )
          }
          onClose={() => setIsEditorOpen(false)}
          onSave={async ({ imageData, preview, file }) => {
            try {
              setIsSavingImage(true);
              await onUpdateImage({
                imageIndex: safeImageIndex,
                image: {
                  ...activeImage,
                  file,
                  imageData,
                  preview,
                },
              });
              setIsEditorOpen(false);
            } finally {
              setIsSavingImage(false);
            }
          }}
        />
      )}
    </div>
  );
}

function History({
  history = [],
  historyView = 'list',
  onSelectHistoryItem,
  selectedHistoryId,
}: {
  history?: AnalysisHistoryItem[];
  historyView?: 'card' | 'list';
  onSelectHistoryItem?: (item: AnalysisHistoryItem) => void;
  selectedHistoryId?: string | null;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const displayLimit =
    historyView === 'card' ? CARD_DISPLAY_LIMIT : LIST_DISPLAY_LIMIT;
  const totalPages = Math.max(1, Math.ceil(history.length / displayLimit));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * displayLimit;
  const displayed = showAll
    ? history
    : history.slice(startIndex, startIndex + displayLimit);

  useEffect(() => {
    setCurrentPage(1);
    setShowAll(false);
  }, [history.length, historyView]);

  if (history.length === 0) {
    return (
      <div className="py-10 text-center">
        <Activity className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
        <p className="text-emerald-700">No history yet</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="max-h-[720px] overflow-y-auto pr-1">
        <div className={historyView === 'card' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'}>
          {displayed.map((item) => {
            const isSelected = selectedHistoryId === item.id;

            if (historyView === 'card') {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectHistoryItem?.(item)}
                  className={`w-full overflow-hidden rounded-2xl border text-left transition ${
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                      : 'border-emerald-200 bg-white hover:bg-emerald-50'
                  }`}
                >
                  <div className="h-24 w-full overflow-hidden bg-emerald-100">
                    {item.images[0] ? (
                      <img
                        src={item.images[0].preview}
                        alt="History preview"
                        className="h-full w-full bg-slate-100 object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-emerald-900">
                        {categoryLabel(item.category)}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(
                          item.result.status
                        )}`}
                      >
                      Overall Health: {item.result.status}
                    </span>
                  </div>

                    <p className="text-[11px] font-medium text-amber-700">
                      Harvest Status: {harvestStatusLabel(
                        item.result.harvestStatus,
                        item.result.harvestReady
                      )}
                    </p>

                    <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                      <Clock className="h-3 w-3 text-emerald-500" />
                      <span className="truncate">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                      <div className="rounded-lg bg-emerald-100/70 px-2 py-1">
                        <p className="text-emerald-600">Score</p>
                        <p className="font-semibold text-emerald-900">
                          {item.result.healthScore}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Source</p>
                        <p className="font-semibold text-slate-800">
                          {sourceTypeLabel(item.sourceType)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Sections</p>
                        <p className="font-semibold text-slate-800">
                          {item.result.totalSections ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Images</p>
                        <p className="font-semibold text-slate-800">
                          {item.images.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectHistoryItem?.(item)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-50 shadow-sm'
                    : 'border-emerald-200 bg-white hover:bg-emerald-50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-100">
                    {item.images[0] ? (
                      <img
                        src={item.images[0].preview}
                        alt="History preview"
                        className="h-full w-full bg-slate-100 object-contain"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-emerald-900">
                        {categoryLabel(item.category)}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClasses(
                          item.result.status
                        )}`}
                      >
                          Overall Health: {item.result.status}
                        </span>
                      </div>

                    <p className="text-[11px] font-medium text-amber-700">
                      Harvest Status: {harvestStatusLabel(
                        item.result.harvestStatus,
                        item.result.harvestReady
                      )}
                    </p>

                    <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                      <Clock className="h-3 w-3 text-emerald-500" />
                      <span className="truncate">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                      <div className="rounded-lg bg-emerald-100/70 px-2 py-1">
                        <p className="text-emerald-600">Score</p>
                        <p className="font-semibold text-emerald-900">
                          {item.result.healthScore}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Source</p>
                        <p className="font-semibold text-slate-800">
                          {sourceTypeLabel(item.sourceType)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Sections</p>
                        <p className="font-semibold text-slate-800">
                          {item.result.totalSections ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-1">
                        <p className="text-slate-500">Images</p>
                        <p className="font-semibold text-slate-800">
                          {item.images.length}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {history.length > displayLimit && (
        <div className="flex w-full flex-col items-center justify-center gap-2 pt-3 text-center">
          <div className="mx-auto flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAll(false);
                setCurrentPage((prev) => Math.max(1, prev - 1));
              }}
              disabled={showAll || safePage === 1}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              {showAll ? 'Paged View' : 'Show All'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAll(false);
                setCurrentPage((prev) => Math.min(totalPages, prev + 1));
              }}
              disabled={showAll || safePage === totalPages}
              className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>

          <p className="w-full text-center text-xs text-emerald-700">
            {showAll
              ? `Showing all ${history.length} analyses`
              : `Page ${safePage} of ${totalPages}`}
          </p>
        </div>
      )}
    </div>
  );
}

export function AnalysisResults({
  showLatestOnly = false,
  data,
  history,
  historyView = 'list',
  onClear,
  onReanalyze,
  onUpdateImage,
  onSelectHistoryItem,
  selectedHistoryId,
}: Props) {
  if (showLatestOnly) {
    return (
      <Workspace
        showLatestOnly={showLatestOnly}
        data={data}
        history={history}
        onClear={onClear}
        onReanalyze={onReanalyze}
        onUpdateImage={onUpdateImage}
        onSelectHistoryItem={onSelectHistoryItem}
      />
    );
  }

  return (
    <History
      history={history}
      historyView={historyView}
      onSelectHistoryItem={onSelectHistoryItem}
      selectedHistoryId={selectedHistoryId}
    />
  );
}
