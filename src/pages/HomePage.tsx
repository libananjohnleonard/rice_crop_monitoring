import { useEffect, useState } from 'react';
import { HomeWorkspace } from '../components/HomeWorkspace';
import type { AnalysisInput } from '../components/UploadImages';
import type { AnalysisHistoryItem } from '../components/AnalysisResults';
import {
  analyzeBatchInBrowser,
  summarizeSectionsForReanalysis,
  summarizeWholeFieldImageResults,
} from '../lib/fieldAnalysis';

const API_BASE_URL = 'http://localhost:3001';

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentAnalysis, setCurrentAnalysis] =
    useState<AnalysisHistoryItem | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);

  const fetchHistory = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analyses`);
      if (!response.ok) {
        throw new Error('Failed to fetch analysis history');
      }

      const data: AnalysisHistoryItem[] = await response.json();
      setHistory(data);

      if (data.length > 0 && !currentAnalysis) {
        setCurrentAnalysis(data[0]);
      }

      return data;
    } catch (error) {
      console.error('Fetch history error:', error);
      return [];
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

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

  const handleAnalyze = async (payload: AnalysisInput) => {
    if (payload.category === 'whole_field' && payload.images.length > 1) {
      const savedBatchIds: string[] = [];

      for (const image of payload.images) {
        const singlePayload: AnalysisInput = {
          ...payload,
          images: [image],
        };
        const result = await analyzeBatchInBrowser(singlePayload);
        const saved = await saveAnalysis(singlePayload, result);
        savedBatchIds.push(saved.batch.id);
      }

      const refreshed = await fetchHistory();
      const latestSavedItem = refreshed.find((item) =>
        savedBatchIds.includes(item.id)
      );

      if (latestSavedItem) {
        setCurrentAnalysis(latestSavedItem);
      }

      setRefreshKey((prev) => prev + 1);
      return;
    }

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

    let nextResult;

    if (
      currentAnalysis.category === 'whole_field' &&
      Array.isArray(currentAnalysis.result.imageResults) &&
      typeof imageIndex === 'number'
    ) {
      const nextImageResults = currentAnalysis.result.imageResults.map((item) => ({
        ...item,
      }));
      const activeImageResult = nextImageResults[imageIndex];

      if (!activeImageResult) {
        throw new Error('Whole-field image result not found.');
      }

      const includedSections = (activeImageResult.sections ?? []).filter(
        (section) => !excludedSectionLabels.includes(section.sectionLabel)
      );

      nextImageResults[imageIndex] = {
        ...activeImageResult,
        ...summarizeSectionsForReanalysis(
          { category: currentAnalysis.category },
          includedSections,
          {
            gridRows: activeImageResult.gridRows,
            gridCols: activeImageResult.gridCols,
            excludedCount: excludedSectionLabels.length,
          }
        ),
      };

      nextResult = summarizeWholeFieldImageResults(nextImageResults);
    } else {
      const currentSections = currentAnalysis.result.sections ?? [];
      const includedSections = currentSections.filter(
        (section) => !excludedSectionLabels.includes(section.sectionLabel)
      );

      nextResult = summarizeSectionsForReanalysis(
        { category: currentAnalysis.category },
        includedSections,
        {
          gridRows: currentAnalysis.result.gridRows,
          gridCols: currentAnalysis.result.gridCols,
          excludedCount: excludedSectionLabels.length,
        }
      );
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

  const handleClear = () => {
    setCurrentAnalysis(null);
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-4 py-1">
      <section className="rounded-2xl border border-emerald-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Rice Monitoring
            </p>
            <h1 className="text-xl font-semibold text-emerald-950">
              Compact field analysis workspace
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
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
                {currentAnalysis ? currentAnalysis.result.status : 'Waiting'}
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
        onSelectHistoryItem={setCurrentAnalysis}
      />
    </div>
  );
}
