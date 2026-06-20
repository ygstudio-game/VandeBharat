import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Shell } from './components/layout/Shell';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { LiveQueue } from './pages/LiveQueue';
import { Sessions } from './pages/Sessions';
import { Reports } from './pages/Reports';
import { Analytics } from './pages/Analytics';
import { Infrastructure } from './pages/Infrastructure';
import { Settings } from './pages/Settings';
import { TrainWorkspace } from './pages/TrainWorkspace';
import { CoachSearch } from './pages/CoachSearch';
import { OcrResultsLog } from './pages/OcrResultsLog';
import { DefectAlertConsole } from './pages/DefectAlertConsole';
import { CameraHealthMonitor } from './pages/CameraHealthMonitor';
import { AiInferenceManagement } from './pages/AiInferenceManagement';

const Placeholder = ({ title }) => (
  <div className="flex h-full items-center justify-center p-8">
    <div className="text-center">
      <h2 className="text-2xl font-bold text-slate-400">{title}</h2>
      <p className="text-slate-500 mt-2">Component under development</p>
    </div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Protected — all app routes inside Shell */}
          <Route path="/" element={
            <ProtectedRoute>
              <Shell />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"      element={<Dashboard />} />
            <Route path="live-queue"     element={<LiveQueue />} />
            <Route path="sessions"       element={<Sessions />} />
            <Route path="train/:sessionId" element={<TrainWorkspace />} />
            <Route path="coach-search"   element={<CoachSearch />} />
            <Route path="ocr-log"        element={<OcrResultsLog />} />
            <Route path="defect-console" element={<DefectAlertConsole />} />
            <Route path="camera-health"  element={<CameraHealthMonitor />} />
            <Route path="reports"        element={<Reports />} />
            <Route path="analytics"      element={<Analytics />} />
            <Route path="infrastructure" element={<Infrastructure />} />
            <Route path="ai-inference"   element={<AiInferenceManagement />} />
            <Route path="settings"       element={<Settings />} />
            <Route path="*"              element={<Placeholder title="404 Not Found" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
