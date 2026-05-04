import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import HomePage from './pages/HomePage';
import SalesAnalytics from './pages/SalesAnalytics';
import ProfitOptimization from './pages/ProfitOptimization';
import Inventory from './pages/Inventory';
import CalendarPage from './pages/Calendar';
import Settings from './pages/Settings';
import HelpContact from './pages/HelpContact';
import DataEntry from './pages/DataEntry';

/* Protected route wrapper */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<HomePage />} />
              <Route path="analytics" element={<SalesAnalytics />} />
              <Route path="profit" element={<ProfitOptimization />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="settings" element={<Settings />} />
              <Route path="help" element={<HelpContact />} />
              <Route path="data-entry" element={<DataEntry />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
