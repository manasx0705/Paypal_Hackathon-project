import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import AppShell from './components/AppShell';
import { FullScreenLoader } from './components/ui';

const Landing = lazy(() => import('./pages/Landing'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Transactions = lazy(() => import('./pages/Transactions'));
const ImportPage = lazy(() => import('./pages/Import'));
const Cart = lazy(() => import('./pages/Cart'));
const Trends = lazy(() => import('./pages/Trends'));
const TrendDetail = lazy(() => import('./pages/TrendDetail'));
const Alerts = lazy(() => import('./pages/Alerts'));
const AlertDetail = lazy(() => import('./pages/AlertDetail'));
const Orders = lazy(() => import('./pages/Orders'));
const OrderDetail = lazy(() => import('./pages/OrderDetail'));
const Agent = lazy(() => import('./pages/Agent'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }) {
  const { isAuthed, booting } = useAuth();
  const loc = useLocation();
  if (booting) return <FullScreenLoader label="Waking up your co-pilot…" />;
  if (!isAuthed) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return children;
}

function PublicOnly({ children }) {
  const { isAuthed, booting } = useAuth();
  if (booting) return <FullScreenLoader />;
  if (isAuthed) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/trends/:id" element={<TrendDetail />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/alerts/:id" element={<AlertDetail />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/agent" element={<Agent />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
