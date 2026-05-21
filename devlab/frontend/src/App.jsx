import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { ScanText, RefreshCw, Cpu, Home } from 'lucide-react';
import HomePage from './pages/Home';
import OcrTester from './pages/OcrTester';
import SyncTester from './pages/SyncTester';
import ComponentTester from './pages/ComponentTester';

const nav = [
  { to: '/', icon: Home, label: 'Sessions' },
  { to: '/ocr', icon: ScanText, label: 'OCR' },
  { to: '/sync', icon: RefreshCw, label: 'Sync' },
  { to: '/components', icon: Cpu, label: 'Components' },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <aside className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col">
          <div className="px-4 py-5 border-b border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest">VandeInspect</p>
            <p className="text-sm font-semibold text-amber-400">DevLab</p>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-1">
            {nav.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
            backend :8002 · ui :5174
          </div>
        </aside>

        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/ocr" element={<OcrTester />} />
            <Route path="/sync" element={<SyncTester />} />
            <Route path="/components" element={<ComponentTester />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
