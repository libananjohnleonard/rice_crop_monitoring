import { RefreshCw } from 'lucide-react';
import { AnalysisResults, type AnalysisHistoryItem } from './AnalysisResults';

type AnalysisHistorySectionProps = {
  refreshKey: number;
  history: AnalysisHistoryItem[];
  onRefresh: () => void;
};

export function AnalysisHistorySection({
  refreshKey,
  history,
  onRefresh,
}: AnalysisHistorySectionProps) {
  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-white/90 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-emerald-800">
          Analysis History
        </h2>

        <button
          onClick={onRefresh}
          className="rounded-lg p-2 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
          title="Refresh"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        <AnalysisResults key={`history-${refreshKey}`} history={history} />
      </div>
    </section>
  );
}