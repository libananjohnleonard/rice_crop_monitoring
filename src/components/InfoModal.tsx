import { useEffect } from 'react';

type Props = {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
};

export default function InfoModal({ isOpen, setIsOpen }: Props) {
  useEffect(() => {
    const key = 'rice_intro_seen';
    if (!localStorage.getItem(key)) {
      setIsOpen(true);
      localStorage.setItem(key, '1');
    }
    // If already seen, do nothing (never show again)
  }, [setIsOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />

      <div className="relative mx-4 max-w-4xl rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-emerald-800">How it works</h2>
            <p className="text-sm text-emerald-600">Quick overview of capture and analysis</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded-md bg-emerald-50 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Close
          </button>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 text-lg font-medium text-emerald-800">Steps</h3>
            <ul className="space-y-3 text-sm text-emerald-700">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">1</span>
                <span>Auto-capture every 5s or use manual capture</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">2</span>
                <span>RGB analysis identifies green, yellow, and brown pixels</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">3</span>
                <span>Health score from 0–100 based on color distribution</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">4</span>
                <span>Harvest readiness and recommendations</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-lg font-medium text-emerald-800">Health Status Guide</h3>
            <div className="grid gap-3">
              <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3">
                <h4 className="mb-1 font-semibold text-emerald-700">Healthy (70–100)</h4>
                <p className="text-sm text-emerald-600">High green percentage indicates vigorous growth</p>
              </div>
              <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50/80 p-3">
                <h4 className="mb-1 font-semibold text-amber-700">Moderate (40–69)</h4>
                <p className="text-sm text-amber-600">Mixed colors may indicate ripening or mild stress</p>
              </div>
              <div className="rounded-xl border-l-4 border-red-500 bg-red-50/80 p-3">
                <h4 className="mb-1 font-semibold text-red-700">Poor (0–39)</h4>
                <p className="text-sm text-red-600">High brown suggests disease, pests, or stress</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
