import { supabase } from '../lib/supabaseClient'
import { useEffect, useState } from 'react';
import { HomeWorkspace } from '../components/HomeWorkspace';
import type { AnalysisInput } from '../components/UploadImages';
import type { AnalysisHistoryItem } from '../components/AnalysisResults';
import {
  analyzeBatchInBrowser,
  summarizeSectionsForReanalysis,
  summarizeWholeFieldImageResults,
} from '../lib/fieldAnalysis';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type SyncStatus = {
  configured: boolean;
  pendingCount: number;
  failedCount: number;
  syncedCount: number;
  inProgress: boolean;
};

function currentStatusLabel(result?: AnalysisHistoryItem['result'] | null) {
  if (!result) return 'Waiting';
  const harvestStatus = result.harvestStatus ?? (result.harvestReady ? 'Ready to Harvest' : 'Not Ready');
  return `${result.status} - ${harvestStatus}`;
}

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisHistoryItem | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const isSupabaseConfigured = Boolean(supabase);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    configured: isSupabaseConfigured,
    pendingCount: 0,
    failedCount: 0,
    syncedCount: 0,
    inProgress: false,
  });
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const hasSyncQueueItems = syncStatus.pendingCount > 0 || syncStatus.failedCount > 0;

  const fetchSyncStatus = async () => {
    const response = await fetch(`${API_BASE_URL}/api/sync/status`);
    if (!response.ok) {
      throw new Error('Failed to fetch sync status');
    }

    const data: SyncStatus = await response.json();
    setSyncStatus(data);
    return data;
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyses`);
      if (!response.ok) {
        throw new Error('Failed to fetch analysis history');
      }

      const data: AnalysisHistoryItem[] = await response.json();
      const mergedData = data.map((item) =>
        mergeOriginalPreviews(
          item,
          currentAnalysis?.id === item.id
            ? currentAnalysis
            : history.find((historyItem) => historyItem.id === item.id)
        )
      );

      setHistory(mergedData);

      if (mergedData.length > 0 && !currentAnalysis) {
        setCurrentAnalysis(mergedData[0]);
      }

      return mergedData;
    } catch (error) {
      console.error('Fetch history error:', error);
      return [];
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const refreshSyncStatus = async () => {
      try {
        const data = await fetchSyncStatus();
        if (isMounted) {
          setSyncStatus(data);
        }
      } catch (error) {
        if (isMounted) {
          setSyncStatus((current) => ({
            ...current,
            configured: false,
            inProgress: false,
          }));
        }
      }
    };

    refreshSyncStatus();
    const intervalId = window.setInterval(refreshSyncStatus, 10000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const handleSyncNow = async () => {
    if (!syncStatus.configured || isManualSyncing) return;

    setIsManualSyncing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/sync/run`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to run sync now');
      }

      await fetchSyncStatus();
    } catch (error) {
      console.error('Manual sync error:', error);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const saveAnalysis = async (
    payload: AnalysisInput,
    result: AnalysisHistoryItem['result']
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/analysis/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, result }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to save analysis');
    }

    return response.json();
  };

  const replaceImageAtIndex = (
    item: AnalysisHistoryItem,
    imageIndex: number,
    image: AnalysisHistoryItem['images'][number]
  ): AnalysisHistoryItem => ({
    ...item,
    images: item.images.map((currentImage, currentIndex) =>
      currentIndex === imageIndex ? image : currentImage
    ),
  });

  const mergeOriginalPreviews = (
    incoming: AnalysisHistoryItem,
    existing?: AnalysisHistoryItem | null
  ): AnalysisHistoryItem => ({
    ...incoming,
    images: incoming.images.map((image, index) => {
      const existingImage = existing?.images[index];

      return {
        ...image,
        originalPreview:
          image.originalPreview ??
          existingImage?.originalPreview ??
          existingImage?.imageData ??
          existingImage?.preview ??
          image.imageData ??
          image.preview,
      };
    }),
  });

  const handleAnalyze = async (payload: AnalysisInput) => {
    const result = await analyzeBatchInBrowser(payload);
    const saved = await saveAnalysis(payload, result);

    const refreshed = await fetchHistory();
    const savedItem = refreshed.find((item) => item.id === saved.batch.id);

    if (savedItem) {
      setCurrentAnalysis(savedItem);
    } else {
      const nextItem: AnalysisHistoryItem = {
        id: saved.batch.id,
        createdAt: saved.batch.created_at,
        category: payload.category,
        flightHeightM: payload.flightHeightM,
        sourceType: payload.sourceType,
        notes: payload.notes,
        images: payload.images,
        result,
      };

      setCurrentAnalysis(nextItem);
    }

    setRefreshKey((prev) => prev + 1);
  };

  const handleReanalyze = async ({
    excludedSections: excludedSectionLabels,
    imageIndex,
  }: {
    excludedSections: string[];
    imageIndex?: number;
  }) => {
    if (!currentAnalysis) return;

    let nextResult: AnalysisHistoryItem['result'];

    if (
      currentAnalysis.category === 'whole_field' &&
      Array.isArray(currentAnalysis.result.imageResults) &&
      typeof imageIndex === 'number'
    ) {
      const targetImage = currentAnalysis.images[imageIndex];

      if (!targetImage) {
        throw new Error('Whole-field image not found.');
      }

      const singleImageAnalysis = await analyzeBatchInBrowser({
        category: currentAnalysis.category,
        flightHeightM: currentAnalysis.flightHeightM,
        sourceType: currentAnalysis.sourceType,
        notes: currentAnalysis.notes,
        images: [targetImage],
      });

      const baseImageResult = singleImageAnalysis.imageResults?.[0];

      if (!baseImageResult) {
        throw new Error('Edited image analysis could not be generated.');
      }

      const nextImageResults = currentAnalysis.result.imageResults.map((item) => ({
        ...item,
      }));
      const includedSections = (baseImageResult.sections ?? []).filter(
        (section) => !excludedSectionLabels.includes(section.sectionLabel)
      );

      nextImageResults[imageIndex] =
        excludedSectionLabels.length > 0
          ? {
              ...baseImageResult,
              ...summarizeSectionsForReanalysis(
                { category: currentAnalysis.category },
                includedSections,
                {
                  gridRows: baseImageResult.gridRows,
                  gridCols: baseImageResult.gridCols,
                  excludedCount: excludedSectionLabels.length,
                }
              ),
            }
          : baseImageResult;

      nextResult = summarizeWholeFieldImageResults(nextImageResults);
    } else {
      const targetImage = currentAnalysis.images[0];

      if (!targetImage) {
        throw new Error('Analysis image not found.');
      }

      const refreshedAnalysis = await analyzeBatchInBrowser({
        category: currentAnalysis.category,
        flightHeightM: currentAnalysis.flightHeightM,
        sourceType: currentAnalysis.sourceType,
        notes: currentAnalysis.notes,
        images: [targetImage],
      });

      if (excludedSectionLabels.length > 0) {
        const currentSections = refreshedAnalysis.sections ?? [];
        const includedSections = currentSections.filter(
          (section) => !excludedSectionLabels.includes(section.sectionLabel)
        );

        nextResult = summarizeSectionsForReanalysis(
          { category: currentAnalysis.category },
          includedSections,
          {
            gridRows: refreshedAnalysis.gridRows,
            gridCols: refreshedAnalysis.gridCols,
            excludedCount: excludedSectionLabels.length,
          }
        );
      } else {
        nextResult = refreshedAnalysis;
      }
    }

    const response = await fetch(`${API_BASE_URL}/api/analysis/reanalyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchId: currentAnalysis.id,
        result: nextResult,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || 'Failed to save re-analysis');
    }

    const refreshed = await fetchHistory();
    const updatedItem = refreshed.find((item) => item.id === currentAnalysis.id);

    if (updatedItem) {
      setCurrentAnalysis(updatedItem);
    }

    setRefreshKey((prev) => prev + 1);
  };

  const handleUpdateImage = async ({
    imageIndex,
    image,
  }: {
    imageIndex: number;
    image: AnalysisHistoryItem['images'][number];
  }) => {
    if (!currentAnalysis) return;

    const currentImage = currentAnalysis.images[imageIndex];

    if (!currentImage) {
      throw new Error('Image not found.');
    }

    if (currentImage.id) {
      const response = await fetch(`${API_BASE_URL}/api/images/${currentImage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageData: image.imageData,
          capturedAt: image.capturedAt,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to update image');
      }
    }

    const nextCurrentAnalysis = replaceImageAtIndex(currentAnalysis, imageIndex, {
      ...currentImage,
      ...image,
      id: currentImage.id ?? image.id,
      originalPreview:
        currentImage.originalPreview ?? currentImage.imageData ?? currentImage.preview,
    });

    setCurrentAnalysis(nextCurrentAnalysis);
    setHistory((currentHistory) =>
      currentHistory.map((item) =>
        item.id === currentAnalysis.id
          ? replaceImageAtIndex(item, imageIndex, {
              ...item.images[imageIndex],
              ...image,
              id: currentImage.id ?? image.id,
              originalPreview:
                item.images[imageIndex].originalPreview ??
                item.images[imageIndex].imageData ??
                item.images[imageIndex].preview,
            })
          : item
      )
    );
  };

  const handleClear = () => {
    setCurrentAnalysis(null);
    setRefreshKey((prev) => prev + 1);
  };

useEffect(() => {
  const fetchImages = async () => {
    if (!supabase) {
      console.info('Supabase is not configured. Running local mode only.')
      return
    }

    const { data, error } = await supabase
      .from('plant_images')
      .select('*')

    console.log('DATA:', data)
    console.log('ERROR:', error)
  }

  fetchImages()
}, [])

  return (
    <div className="space-y-4 py-1">
      <section className="rounded-2xl border border-emerald-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Rice Monitoring
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-emerald-950">
                Compact field analysis workspace
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  syncStatus.configured && isSupabaseConfigured
                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300'
                    : 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                }`}
              >
                {syncStatus.configured && isSupabaseConfigured
                  ? 'Supabase connected'
                  : 'Supabase required'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:min-w-[340px]">
            <div className="rounded-xl bg-emerald-50 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                History
              </p>
              <p className="text-sm font-semibold text-emerald-900">
                {history.length}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Current
              </p>
              <p className="truncate text-sm font-semibold text-emerald-900">
                {currentStatusLabel(currentAnalysis?.result)}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Category
              </p>
              <p className="truncate text-sm font-semibold text-emerald-900">
                {currentAnalysis ? currentAnalysis.category.replace('_', ' ') : '-'}
              </p>
            </div>
            <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-emerald-100">
              <p className="text-[10px] uppercase tracking-wide text-emerald-600">
                Sync Queue
              </p>
              <p className="text-sm font-semibold text-emerald-900">
                {syncStatus.pendingCount}
                {syncStatus.failedCount > 0 ? ` (${syncStatus.failedCount} failed)` : ''}
              </p>
              {hasSyncQueueItems ? (
                <button
                  type="button"
                  onClick={handleSyncNow}
                  disabled={!syncStatus.configured || isManualSyncing}
                  className="mt-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {isManualSyncing || syncStatus.inProgress ? 'Syncing...' : 'Sync now'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <HomeWorkspace
        refreshKey={refreshKey}
        currentAnalysis={currentAnalysis}
        history={history}
        onAnalyze={handleAnalyze}
        onClear={handleClear}
        onReanalyze={handleReanalyze}
        onUpdateImage={handleUpdateImage}
        onSelectHistoryItem={setCurrentAnalysis}
      />
    </div>
  );
}
