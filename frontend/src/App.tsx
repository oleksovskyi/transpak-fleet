import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireAdmin, RequireAuth } from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FleetPage from './pages/FleetPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import SetupDocumentsPage from './pages/SetupDocumentsPage';
import DriversPage from './pages/DriversPage';
import RepairsPage from './pages/RepairsPage';
import RoutesPage from './pages/RoutesPage';
import DocumentsPage from './pages/DocumentsPage';
import PlatformAdminPage from './pages/PlatformAdminPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Окремий рівень довіри (X-Platform-Key, не JWT користувача компанії) — навмисно
          поза RequireAuth/Layout, без сайдбару конкретного клієнта. */}
      <Route path="/platform" element={<PlatformAdminPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/fleet" element={<FleetPage />} />
          <Route path="/maintenance" element={<RepairsPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/setup-documents" element={<SetupDocumentsPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
