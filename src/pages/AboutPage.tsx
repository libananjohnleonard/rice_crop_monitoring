import { Link } from 'react-router-dom';
import { Camera, BarChart3, BookOpen } from 'lucide-react';

type Props = {
  onOpenHowItWorks?: () => void;
};

export function AboutPage({ onOpenHowItWorks }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="rounded-2xl border border-emerald-200 bg-white/80 p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-emerald-800">About Rice Plant Health Monitor</h1>
        <p className="mb-6 text-emerald-700">
          This web system helps you monitor rice crop health in the field using your device&apos;s camera. Capture
          images of rice plants to get instant RGB-based health analysis, harvest readiness hints, and actionable
          recommendations.
        </p>

        <h2 className="mb-3 text-lg font-semibold text-emerald-800">What this system does</h2>
        <ul className="mb-6 space-y-2 text-emerald-700">
          <li className="flex items-start gap-2">
            <Camera className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <span>Live camera capture with optional auto-capture every 5 seconds</span>
          </li>
          <li className="flex items-start gap-2">
            <BarChart3 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <span>Color analysis (green, yellow, brown) to estimate plant condition</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="inline-block h-5 w-5 shrink-0" />
            <span>Health score (0–100) and status: Healthy, Moderate, or Poor</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="inline-block h-5 w-5 shrink-0" />
            <span>General analysis by current session, last 20 minutes, or all captures</span>
          </li>
          <li className="flex items-start gap-2">
            <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <span>Full analysis history and downloadable reports (Word/PDF) on the Docs page</span>
          </li>
        </ul>

        <h2 className="mb-3 text-lg font-semibold text-emerald-800">How it works</h2>
        <p className="mb-6 text-emerald-700">
          Each captured image is analyzed by measuring the proportion of green, yellow, and brown pixels. Higher
          green suggests healthy growth; more yellow can mean ripening or stress; brown may indicate disease or
          nutrient issues. The system combines these into a single health score and suggests whether plants may be
          ready for harvest.
        </p>

        <div className="flex flex-wrap gap-3">
          {onOpenHowItWorks && (
            <button
              onClick={onOpenHowItWorks}
              className="rounded-xl border-2 border-emerald-400 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
            >
              Open &quot;How it works&quot; guide
            </button>
          )}
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
