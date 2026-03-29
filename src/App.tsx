import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import InfoModal from './components/InfoModal';
import { HomePage } from './pages/HomePage';
import { AnalysisPage } from './pages/AnalysisPage';
import { DocsPage } from './pages/DocsPage';
import { AboutPage } from './pages/AboutPage';

function App() {
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-yellow-50/30 to-emerald-50">
        <InfoModal isOpen={isInfoOpen} setIsOpen={setIsInfoOpen} />

        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-5 lg:px-6">
          <Header onOpenInfo={() => setIsInfoOpen(true)} />

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            {/* <Route path="/desktop" element={<DesktopSyncPage />} /> */}
            <Route path="/docs" element={<DocsPage />} />
            <Route
              path="/about"
              element={<AboutPage onOpenHowItWorks={() => setIsInfoOpen(true)} />}
            />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
