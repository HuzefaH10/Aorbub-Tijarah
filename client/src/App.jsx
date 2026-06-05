import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { BusinessProvider } from './context/BusinessContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import HomePage from './pages/HomePage';
import PageLoader from './components/ui/PageLoader';

const SalesAnalytics = lazy(() => import('./pages/SalesAnalytics'));
const ProfitOptimization = lazy(() => import('./pages/ProfitOptimization'));
const Inventory = lazy(() => import('./pages/Inventory'));
const CalendarPage = lazy(() => import('./pages/Calendar'));
const Settings = lazy(() => import('./pages/Settings'));
const HelpContact = lazy(() => import('./pages/HelpContact'));
const DataEntry = lazy(() => import('./pages/DataEntry'));
const Credits = lazy(() => import('./pages/Credits'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const Invoices = lazy(() => import('./pages/Invoices'));

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
        <BusinessProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<HomePage />} />
                <Route path="analytics" element={<Suspense fallback={<PageLoader />}><SalesAnalytics /></Suspense>} />
                <Route path="profit" element={<Suspense fallback={<PageLoader />}><ProfitOptimization /></Suspense>} />
                <Route path="inventory" element={<Suspense fallback={<PageLoader />}><Inventory /></Suspense>} />
                <Route path="calendar" element={<Suspense fallback={<PageLoader />}><CalendarPage /></Suspense>} />
                <Route path="credits" element={<Suspense fallback={<PageLoader />}><Credits /></Suspense>} />
                <Route path="expenses" element={<Suspense fallback={<PageLoader />}><Expenses /></Suspense>} />
                <Route path="suppliers" element={<Suspense fallback={<PageLoader />}><Suppliers /></Suspense>} />
                <Route path="invoices" element={<Suspense fallback={<PageLoader />}><Invoices /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<PageLoader />}><Settings /></Suspense>} />
                <Route path="help" element={<Suspense fallback={<PageLoader />}><HelpContact /></Suspense>} />
                <Route path="data-entry" element={<Suspense fallback={<PageLoader />}><DataEntry /></Suspense>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </BusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
