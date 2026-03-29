import { Link } from 'react-router-dom';
import { BarChart3, History, ClipboardList } from 'lucide-react';

export function AnalysisPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-2xl border border-emerald-200 bg-white/80 p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-emerald-800">Analysis</h1>
        <p className="mb-6 text-emerald-700">
          This section explains how analysis results, summary, and history work in the Rice Plant Health Monitor.
        </p>

        <div className="space-y-6">
          <div className="flex gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-200">
              <BarChart3 className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="mb-1 font-semibold text-emerald-800">General Analysis Summary</h2>
              <p className="text-sm text-emerald-700">
                On the home page, the General Analysis panel shows aggregated health across your captures. You can
                switch between: <strong>All Captures</strong>, <strong>Current Session</strong> (only images from
                the last camera run), <strong>Last 20 mins</strong>, or <strong>Current Image</strong>. Summary
                includes average health score, green/yellow/brown percentages, and how many sections are ready for
                harvest.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-200">
              <History className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="mb-1 font-semibold text-emerald-800">Analysis History</h2>
              <p className="text-sm text-emerald-700">
                The Analysis History list on the home page shows every captured image with its health status, score,
                color breakdown (green, yellow, brown %), harvest readiness, and recommendations. Use card or list
                view and click an entry to see full details.
              </p>
            </div>
          </div>

          <div className="flex gap-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-200">
              <ClipboardList className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="mb-1 font-semibold text-emerald-800">Downloading Results</h2>
              <p className="text-sm text-emerald-700">
                You can export analysis data as Word or PDF from the <Link to="/docs" className="font-medium text-emerald-600 underline hover:text-emerald-800">Docs</Link> page for
                reports and record-keeping.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
