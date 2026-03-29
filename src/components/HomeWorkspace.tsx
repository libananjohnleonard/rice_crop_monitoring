import { useState } from 'react';
import { CameraCapture, type AnalysisInput } from './UploadImages';
import { AnalysisResults, type AnalysisHistoryItem } from './AnalysisResults';

type HomeWorkspaceProps = {
  refreshKey: number;
  currentAnalysis: AnalysisHistoryItem | null;
  history: AnalysisHistoryItem[];
  onAnalyze: (payload: AnalysisInput) => void | Promise<void>;
  onClear?: () => void;
  onReanalyze?: (payload: {
    excludedSections: string[];
    imageIndex?: number;
  }) => void | Promise<void>;
  onSelectHistoryItem?: (item: AnalysisHistoryItem) => void;
};

export function HomeWorkspace({
  refreshKey,
  currentAnalysis,
  history,
  onAnalyze,
  onClear,
  onReanalyze,
  onSelectHistoryItem,
}: HomeWorkspaceProps) {
  const [historyView, setHistoryView] = useState<'card' | 'list'>('list');

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-emerald-200/80 bg-white/85 p-4 shadow-sm">
        <CameraCapture key={`capture-${refreshKey}`} onAnalyze={onAnalyze} />
      </section>

      <section className="rounded-2xl border border-emerald-200/80 bg-white/85 p-4 shadow-sm">
        <AnalysisResults
          key={`workspace-${refreshKey}`}
          showLatestOnly
          data={currentAnalysis}
          onClear={onClear}
          onReanalyze={onReanalyze}
        />
      </section>

      <section className="rounded-2xl border border-emerald-200/80 bg-white/85 p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-emerald-800">
            Analysis History
          </h2>
          <div className="inline-flex rounded-xl border border-emerald-200 bg-emerald-50 p-1">
            <button
              type="button"
              onClick={() => setHistoryView('card')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                historyView === 'card'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-700 hover:bg-white'
              }`}
            >
              Card View
            </button>
            <button
              type="button"
              onClick={() => setHistoryView('list')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                historyView === 'list'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-700 hover:bg-white'
              }`}
            >
              List View
            </button>
          </div>
        </div>

        <div className="max-h-[720px] overflow-y-auto pr-1">
          <AnalysisResults
            key={`history-${refreshKey}`}
            history={history}
            historyView={historyView}
            onSelectHistoryItem={onSelectHistoryItem}
            selectedHistoryId={currentAnalysis?.id ?? null}
          />
        </div>
      </section>
    </div>
  );
}
