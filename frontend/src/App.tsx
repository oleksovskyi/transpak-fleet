import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { RequireAdmin, RequireAuth } from './components/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FleetPage from './pages/FleetPage';
import PlaceholderPage from './pages/PlaceholderPage';
import SettingsPage from './pages/SettingsPage';
import SetupPage from './pages/SetupPage';
import DriversPage from './pages/DriversPage';
import RepairsPage from './pages/RepairsPage';
import RoutesPage from './pages/RoutesPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/fleet" element={<FleetPage />} />
          <Route path="/maintenance" element={<RepairsPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route
            path="/fuel"
            element={<PlaceholderPage title="Паливо" subtitle="Контроль витрати по автопарку та окремих ТЗ" />}
          />
          <Route element={<RequireAdmin />}>
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/setup" element={<SetupPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}
