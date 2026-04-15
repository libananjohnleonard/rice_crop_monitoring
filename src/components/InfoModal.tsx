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

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => setIsOpen(false)} />

      <div className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-lg max-h-[calc(100vh-2rem)] sm:max-h-[85vh]">
        <div className="flex items-start justify-between gap-4 border-b border-emerald-100 px-4 py-4 sm:px-6">
          <div>
            <h2 className="text-xl font-semibold text-emerald-800">How it works</h2>
            <p className="text-sm text-emerald-600">Quick overview of capture and analysis</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="shrink-0 rounded-md bg-emerald-50 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-100"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
                  <span>Each image gets an Overall Health Status and Health Points from 0-100</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">4</span>
                  <span>Field images are divided into sections so you can also see Section Health Status</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-700">5</span>
                  <span>Harvest Status is labeled as Not Ready, Nearly Ready, Ready to Harvest, or Needs Attention or Overripe</span>
                </li>
              </ul>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="mb-3 text-lg font-medium text-emerald-800">Health Status Guide</h3>
                <div className="grid gap-3">
                  <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50/80 p-3">
                    <h4 className="mb-1 font-semibold text-emerald-700">Healthy (70-100)</h4>
                    <p className="text-sm text-emerald-600">Strong growth with high green percentage</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50/80 p-3">
                    <h4 className="mb-1 font-semibold text-amber-700">Moderate (40-69)</h4>
                    <p className="text-sm text-amber-600">Mixed condition with some ripening or mild stress</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-red-500 bg-red-50/80 p-3">
                    <h4 className="mb-1 font-semibold text-red-700">Poor (0-39)</h4>
                    <p className="text-sm text-red-600">High brown can suggest stress, pests, or possible disease</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-medium text-emerald-800">Harvest Status Guide</h3>
                <div className="grid gap-3">
                  <div className="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-3">
                    <h4 className="mb-1 font-semibold text-slate-700">Not Ready</h4>
                    <p className="text-sm text-slate-600">Rice is still mostly green and should continue maturing</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-yellow-500 bg-yellow-50 p-3">
                    <h4 className="mb-1 font-semibold text-yellow-700">Nearly Ready</h4>
                    <p className="text-sm text-yellow-700">Rice is maturing and may be close to harvest time</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-3">
                    <h4 className="mb-1 font-semibold text-amber-700">Ready to Harvest</h4>
                    <p className="text-sm text-amber-700">Ripening is strong enough that the crop can be harvested</p>
                  </div>
                  <div className="rounded-xl border-l-4 border-red-500 bg-red-50 p-3">
                    <h4 className="mb-1 font-semibold text-red-700">Needs Attention or Overripe</h4>
                    <p className="text-sm text-red-600">The crop may be overripe or showing a condition that needs checking</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
