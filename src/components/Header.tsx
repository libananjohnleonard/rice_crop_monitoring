import { Link, useLocation } from 'react-router-dom';

type Props = {
  onOpenInfo?: () => void;
};

const logoUrl = new URL('../image/logo.png', import.meta.url).href;

const navClass = (active: boolean) =>
  `text-sm font-medium ${
    active ? 'text-emerald-900' : 'text-emerald-700 hover:text-emerald-900'
  }`;

export function Header({ onOpenInfo }: Props) {
  const location = useLocation();

  return (
    <header className="mb-10">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-white/80 px-6 py-3 shadow-sm">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Rice Plant Health Monitor"
            className="h-9 w-9 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold text-emerald-800">
              Rice Plant Health Monitor
            </h1>
            <p className="text-xs text-emerald-600">
              Field monitoring & RGB analysis
            </p>
          </div>
        </Link>

        <nav className="hidden sm:flex sm:items-center sm:gap-6">
          <Link to="/" className={navClass(location.pathname === '/')}>
            Home
          </Link>
          <Link
            to="/analysis"
            className={navClass(location.pathname === '/analysis')}
          >
            Analysis
          </Link>
          <Link to="/docs" className={navClass(location.pathname === '/docs')}>
            Docs
          </Link>
          <Link to="/about" className={navClass(location.pathname === '/about')}>
            About
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onOpenInfo?.()}
            className="hidden rounded-md px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-100 sm:inline-flex"
          >
            How it works
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;