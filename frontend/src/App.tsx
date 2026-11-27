import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/ToastContainer';
import { LoadingSpinner } from './components/UiPrimitives';

// Layouts
import { AppLayout } from './layouts/AppLayout';

// Admin Pages
import { LoginPage } from './pages/LoginPage';
import { CreateHubPage, DocumentsHubPage, MoreHubPage } from './pages/MobileHubs';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { EnquiriesPage } from './modules/enquiries/EnquiriesPage';
import { BookingsPage } from './modules/bookings/BookingsPage';
import { CalendarPage } from './modules/calendar/CalendarPage';
import { RoomsPage } from './modules/rooms/RoomsPage';
import { MealsPage } from './modules/meals/MealsPage';
import { AddonsPage } from './modules/addons/AddonsPage';
import { CustomersPage } from './modules/customers/CustomersPage';
import { VehiclesPage } from './modules/vehicles/VehiclesPage';
import { PackagesPage } from './modules/packages/PackagesPage';
import { QuotationsPage } from './modules/quotations/QuotationsPage';
import { InvoicesPage } from './modules/invoices/InvoicesPage';
import { PaymentsPage } from './modules/payments/PaymentsPage';
import { ExpensesPage } from './modules/expenses/ExpensesPage';
import { ReportsPage } from './modules/reports/ReportsPage';
import { BackupsPage } from './modules/backups/BackupsPage';
import { SettingsPage } from './modules/settings/SettingsPage';

const ProtectedRoute: React.FC<{ permission?: string; ownerOnly?: boolean; children: React.ReactNode }> = ({
  permission,
  ownerOnly,
  children,
}) => {
  const { user, loading, hasPermission } = useAuth();
  if (loading) return <LoadingSpinner label="Verifying session..." />;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (ownerOnly && user.role !== 'OWNER_ADMIN') return <Navigate to="/admin" replace />;
  if (permission && !hasPermission(permission)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
};

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <LoadingSpinner label="Loading Blueberry Farm and Resort..." />
      </div>
    );
  }

  return (
    <Routes>
      {/* Admin-Only Mode: Root redirects directly to Admin Portal */}
      <Route path="/" element={<Navigate to="/admin" replace />} />

      {/* ADMIN AUTHENTICATION */}
      <Route
        path="/admin/login"
        element={user ? <Navigate to="/admin" replace /> : <LoginPage />}
      />
      <Route path="/login" element={<Navigate to="/admin/login" replace />} />

      {/* 3. ADMINISTRATION PORTAL (Protected) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="enquiries"
          element={
            <ProtectedRoute permission="enquiries:read">
              <EnquiriesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="bookings"
          element={
            <ProtectedRoute permission="bookings:read">
              <BookingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="calendar"
          element={
            <ProtectedRoute permission="bookings:read">
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="rooms"
          element={
            <ProtectedRoute permission="bookings:read">
              <RoomsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="meals"
          element={
            <ProtectedRoute permission="bookings:read">
              <MealsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="addons"
          element={
            <ProtectedRoute permission="packages:read">
              <AddonsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="customers"
          element={
            <ProtectedRoute permission="customers:read">
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="vehicles"
          element={
            <ProtectedRoute permission="vehicles:read">
              <VehiclesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="packages"
          element={
            <ProtectedRoute permission="packages:read">
              <PackagesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="quotations"
          element={
            <ProtectedRoute permission="quotations:read">
              <QuotationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="invoices"
          element={
            <ProtectedRoute permission="invoices:read">
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments"
          element={
            <ProtectedRoute permission="payments:read">
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <ProtectedRoute permission="expenses:read">
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute permission="reports:view">
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="data-management"
          element={
            <ProtectedRoute ownerOnly>
              <BackupsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="backups"
          element={
            <ProtectedRoute ownerOnly>
              <BackupsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute ownerOnly>
              <SettingsPage />
            </ProtectedRoute>
          }
        />

        {/* Mobile Hubs */}
        <Route path="create" element={<CreateHubPage />} />
        <Route path="documents" element={<DocumentsHubPage />} />
        <Route path="more" element={<MoreHubPage />} />
      </Route>

      {/* Legacy/Shortcut redirects to Admin (preserving query strings) */}
      <Route path="/dashboard" element={<RedirectWithSearch to="/admin/dashboard" />} />
      <Route path="/enquiries" element={<RedirectWithSearch to="/admin/enquiries" />} />
      <Route path="/bookings" element={<RedirectWithSearch to="/admin/bookings" />} />
      <Route path="/calendar" element={<RedirectWithSearch to="/admin/calendar" />} />
      <Route path="/rooms" element={<RedirectWithSearch to="/admin/rooms" />} />
      <Route path="/meals" element={<RedirectWithSearch to="/admin/meals" />} />
      <Route path="/addons" element={<RedirectWithSearch to="/admin/addons" />} />
      <Route path="/invoices" element={<RedirectWithSearch to="/admin/invoices" />} />
      <Route path="/quotations" element={<RedirectWithSearch to="/admin/quotations" />} />
      <Route path="/payments" element={<RedirectWithSearch to="/admin/payments" />} />
      <Route path="/vehicles" element={<RedirectWithSearch to="/admin/vehicles" />} />
      <Route path="/customers" element={<RedirectWithSearch to="/admin/customers" />} />
      <Route path="/expenses" element={<RedirectWithSearch to="/admin/expenses" />} />
      <Route path="/reports" element={<RedirectWithSearch to="/admin/reports" />} />
      <Route path="/settings" element={<RedirectWithSearch to="/admin/settings" />} />
      <Route path="/backups" element={<RedirectWithSearch to="/admin/data-management" />} />

      {/* 404 Catch-All -> Admin */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
};

const RedirectWithSearch: React.FC<{ to: string }> = ({ to }) => {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
          <ToastContainer />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
