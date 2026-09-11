import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard/index';
import Loads from './pages/Loads/index';
import LoadDetail from './pages/Loads/LoadDetail';
import Customers from './pages/Customers/index';
import Drivers from './pages/Drivers/index';
import DriverDetail from './pages/Drivers/DriverDetail';
import Fleet from './pages/Fleet/index';
import Billing from './pages/Billing/index';
import Expenses from './pages/Expenses/index';
import Payroll from './pages/Payroll/index';
import PnL from './pages/PnL/index';
import Fuel from './pages/Fuel/index';
import Compliance from './pages/Compliance/index';
import Users from './pages/Users/index';
import Settings from './pages/Settings/index';
import Import from './pages/Import/index';
import ExtractLoad from './pages/ExtractLoad/index';
import OtherRevenue from './pages/OtherRevenue/index';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', minHeight:'100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/loads" element={<ProtectedRoute><Loads /></ProtectedRoute>} />
      <Route path="/loads/:id" element={<ProtectedRoute><LoadDetail /></ProtectedRoute>} />
      <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
      <Route path="/drivers" element={<ProtectedRoute><Drivers /></ProtectedRoute>} />
      <Route path="/drivers/:id" element={<ProtectedRoute><DriverDetail /></ProtectedRoute>} />
      <Route path="/fleet" element={<ProtectedRoute><Fleet /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
      <Route path="/other-revenue" element={<ProtectedRoute><OtherRevenue /></ProtectedRoute>} />
      <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
      <Route path="/payroll" element={<ProtectedRoute><Payroll /></ProtectedRoute>} />
      <Route path="/pnl" element={<ProtectedRoute adminOnly><PnL /></ProtectedRoute>} />
      <Route path="/fuel" element={<ProtectedRoute><Fuel /></ProtectedRoute>} />
      <Route path="/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
<Route path="/import" element={<ProtectedRoute adminOnly><Import 
/></ProtectedRoute>} />
      <Route path="/extract-load" element={<ProtectedRoute><ExtractLoad 
/></ProtectedRoute>} />
      <Route path="/import" element={<ProtectedRoute adminOnly><Import 
/></ProtectedRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#162040',
              color: '#F1F5F9',
              border: '1px solid #1e3060',
              fontFamily: 'Inter, sans-serif',
              fontSize: '13.5px',
            },
            success: { iconTheme: { primary: '#10B981', secondary: '#162040' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#162040' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
