import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  AnalysisInput,
  UploadCategory,
  UploadSourceType,
} from './UploadImages';

const API_BASE_URL = 'http://localhost:3001';

export type AnalysisResultDetails = {
  status: 'Healthy' | 'Moderate' | 'Poor';
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
  onSelectHistoryItem?: (item: AnalysisHistoryItem) => void;
  selectedHistoryId?: string | null;
};

const DISPLAY_LIMIT = 6;

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
  sections = [],
  gridRows = 4,
  gridCols = 4,
  excludedSections,
  onToggleExclude,
}: {
  imageSrc: string;
  sections?: SectionResult[];
  gridRows?: number;
  gridCols?: number;
  excludedSections: Set<string>;
  onToggleExclude: (sectionLabel: string) => void | Promise<void>;
}) {
  const [hoveredCell, setHoveredCell] = useState<SectionResult | null>(null);
  const [pinnedCell, setPinnedCell] = useState<SectionResult | null>(null);

  const rows = clampGridSize(gridRows);
  const cols = clampGridSize(gridCols);

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
      <div>
        <img
          src={imageSrc}
          alt="Uploaded preview"
          className="h-52 w-full rounded-xl object-cover"
        />
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

        <div className="relative overflow-hidden rounded-xl">
          <img
            src={imageSrc}
            alt="Grid overlay preview"
            className="h-64 w-full object-cover"
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
                  <p className="text-xs text-emerald-600">Status</p>
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
  data,
  onClear,
  onReanalyze,
}: {
  data?: AnalysisHistoryItem | null;
  onClear?: () => void;
  onReanalyze?: (payload: {
    excludedSections: string[];
    imageIndex?: number;
  }) => void | Promise<void>;
}) {
  const [excludedSections, setExcludedSections] = useState<Set<string>>(new Set());
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isSavingExcluded, setIsSavingExcluded] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const wholeFieldImageResults = data?.result.imageResults ?? [];
  const hasWholeFieldImages =
    data?.category === 'whole_field' && wholeFieldImageResults.length > 0;
  const safeImageIndex =
    hasWholeFieldImages && currentImageIndex >= wholeFieldImageResults.length
      ? 0
      : currentImageIndex;
  const activeResult =
    hasWholeFieldImages && wholeFieldImageResults[safeImageIndex]
      ? wholeFieldImageResults[safeImageIndex]
      : data?.result;
  const activeImage =
    hasWholeFieldImages && data?.images[safeImageIndex]
      ? data.images[safeImageIndex]
      : data?.images[0];

  useEffect(() => {
    setCurrentImageIndex(0);
  }, [data?.id]);

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

  const savedSummary = {
    status: activeResult?.status ?? data.result.status,
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
      const response = await fetch(
        `${API_BASE_URL}/api/analysis/sections/${targetSection.id}/exclude`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isExcluded: shouldExclude,
            excludeReason: shouldExclude ? 'Excluded from UI grid selection' : null,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to save section exclusion');
      }
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
        imageIndex: hasWholeFieldImages ? safeImageIndex : undefined,
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
            className={`rounded-full px-3 py-1 text-xs font-bold ${statusClasses(
              savedSummary.status
            )}`}
          >
            {savedSummary.status}
          </span>
        </div>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl bg-emerald-100 p-2.5">
          <p className="text-xs text-emerald-700">Score</p>
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
      </div>

      <div className={`grid gap-2.5 ${isWhole ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>
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
          <p className="text-xs text-emerald-600">Flight Height</p>
          <p className="mt-1 font-semibold text-emerald-900">
            {data.flightHeightM ? `${data.flightHeightM} m` : '-'}
          </p>
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

      <div className="rounded-2xl border border-emerald-200 bg-slate-50 p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-emerald-900">Preview</h3>
          <div className="flex items-center gap-2">
            {hasWholeFieldImages ? (
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
                  {`Image ${safeImageIndex + 1} of ${wholeFieldImageResults.length}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIndex((prev) =>
                      prev < wholeFieldImageResults.length - 1 ? prev + 1 : prev
                    )
                  }
                  disabled={safeImageIndex >= wholeFieldImageResults.length - 1}
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
          {activeImage ? (
            isWhole || data.category === 'partial_field' ? (
              <GridOverlayPreview
                imageSrc={activeImage.preview}
                sections={activeResult?.sections}
                gridRows={gridRows}
                gridCols={gridCols}
                excludedSections={excludedSections}
                onToggleExclude={toggleExcludeSection}
              />
            ) : (
              <img
                src={activeImage.preview}
                alt="Analysis preview"
                className="h-44 w-full rounded-xl object-cover"
              />
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
  const totalPages = Math.max(1, Math.ceil(history.length / DISPLAY_LIMIT));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * DISPLAY_LIMIT;
  const displayed = showAll
    ? history
    : history.slice(startIndex, startIndex + DISPLAY_LIMIT);

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
                      className="h-full w-full object-cover"
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
                      {item.result.status}
                    </span>
                  </div>

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
                      className="h-full w-full object-cover"
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
                      {item.result.status}
                    </span>
                  </div>

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

      {history.length > DISPLAY_LIMIT && (
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
  onSelectHistoryItem,
  selectedHistoryId,
}: Props) {
  if (showLatestOnly) {
    return <Workspace data={data} onClear={onClear} onReanalyze={onReanalyze} />;
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
