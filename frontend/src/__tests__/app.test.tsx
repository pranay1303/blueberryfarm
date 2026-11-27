import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../context/ToastContext';
import { ToastContainer } from '../components/ToastContainer';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from '../pages/LoginPage';
import { AppLayout } from '../layouts/AppLayout';
import { CustomersPage } from '../modules/customers/CustomersPage';
import { BookingsPage } from '../modules/bookings/BookingsPage';
import { QuotationsPage } from '../modules/quotations/QuotationsPage';
import { InvoicesPage } from '../modules/invoices/InvoicesPage';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPut = vi.fn();
const mockDelete = vi.fn();

vi.mock('../services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
  fetchBlob: vi.fn(),
  setAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => 'test-token'),
  setUnauthorizedHandler: vi.fn(),
}));

const OWNER_USER = {
  id: 'USR-OWNER',
  username: 'owner',
  full_name: 'Pranit Dabhade',
  role: 'OWNER_ADMIN' as const,
  is_active: true,
  must_change_password: false,
  permissions: ['*'],
};

const RECEPTION_USER = {
  id: 'USR-REC',
  username: 'reception',
  full_name: 'Front Desk',
  role: 'RECEPTION_STAFF' as const,
  is_active: true,
  must_change_password: false,
  permissions: [
    'dashboard:view',
    'customers:read',
    'customers:write',
    'bookings:read',
    'bookings:write',
    'quotations:read',
    'quotations:write',
    'invoices:read',
    'payments:read',
    'packages:read',
  ],
};

function renderWithProviders(ui: React.ReactNode, initialEntries: string[] = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <ToastProvider>
        <AuthProvider>
          {ui}
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('Blueberry Farm & Resort Frontend Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Initial Owner Setup when setup-status requires onboarding and validates password length', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/auth/setup-status') {
        return Promise.resolve({ data: { needs_initial_setup: true } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LoginPage />, ['/login']);

    expect(
      await screen.findByText(/Initial Resort Setup — Create Owner \/ Admin Account/i)
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Complete Setup & Sign In/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Password must be at least 8 characters/i)).toBeInTheDocument();

    mockPost.mockResolvedValueOnce({
      data: { access_token: 'tok-123', user: OWNER_USER },
    });

    const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: 'Blueberry@123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/auth/setup-owner',
        expect.objectContaining({
          username: 'admin',
          full_name: 'Pranit Dabhade',
          password: 'Blueberry@123',
        })
      );
    });
  });

  it('validates login form and displays backend authentication errors cleanly', async () => {
    mockGet.mockResolvedValue({ data: { needs_initial_setup: false } });
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.reject(new Error('No refresh cookie'));
      }
      if (url === '/auth/login') {
        return Promise.reject({ response: { data: { detail: 'Invalid username or password' } } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LoginPage />, ['/login']);

    expect(await screen.findByText(/Staff Sign In/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));
    expect(await screen.findByText(/Username is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/Password is required/i)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/admin or pranit-dabhade/i), { target: { value: 'pranit-dabhade' } });
    fireEvent.change(screen.getByPlaceholderText(/Enter password/i), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: /^Sign In$/i }));

    expect(await screen.findByText(/Invalid username or password/i)).toBeInTheDocument();
  });

  it('renders mobile bottom navigation and enforces role-based sidebar visibility', async () => {
    mockGet.mockResolvedValue({ data: { needs_initial_setup: false } });
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-rec', user: RECEPTION_USER } });
      }
      return Promise.resolve({ data: {} });
    });

    const { unmount } = renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Dashboard Mock</div>} />
        </Route>
      </Routes>
    );

    expect(await screen.findByText('Dashboard Mock')).toBeInTheDocument();
    // Mobile bottom bar tabs must all be rendered
    expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bookings').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Create')).toBeInTheDocument();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();

    // Receptionist must NOT see Owner-only nav items
    expect(screen.queryByText('Storage & Backups')).not.toBeInTheDocument();
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();

    unmount();

    // Now simulate OWNER_ADMIN
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-own', user: OWNER_USER } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>Dashboard Owner</div>} />
        </Route>
      </Routes>
    );

    expect(await screen.findByText('Dashboard Owner')).toBeInTheDocument();
    expect(screen.queryByText('Staff & Roles')).not.toBeInTheDocument();
    expect(screen.getByText('Storage & Backups')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('loads customers, filters via search, creates a customer, and handles API errors', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-own', user: OWNER_USER } });
      }
      if (url === '/customers') {
        return Promise.resolve({ data: { id: 'CUS-2', customer_id: 'CUS-002' } });
      }
      return Promise.resolve({ data: {} });
    });
    mockGet.mockImplementation((url: string, config?: { params?: Record<string, string> }) => {
      if (url === '/auth/setup-status') return Promise.resolve({ data: { needs_initial_setup: false } });
      if (url === '/customers') {
        if (config?.params?.search === 'Fail') {
          return Promise.reject({ response: { data: { detail: 'Simulated customer API error' } } });
        }
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'CUS-1',
                customer_id: 'CUS-001',
                full_name: 'Nikhil Patil',
                mobile: '9876543210',
                customer_type: 'Individual',
                city: 'Pune',
                state: 'Maharashtra',
                created_at: '2026-04-01T10:00:00Z',
                updated_at: '2026-04-01T10:00:00Z',
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<CustomersPage />);

    expect((await screen.findAllByText('Nikhil Patil')).length).toBeGreaterThanOrEqual(1);

    // Open Add Customer modal
    fireEvent.click(screen.getByRole('button', { name: /Add Customer/i }));
    expect(await screen.findByText(/Add New Customer/i)).toBeInTheDocument();

    // Trigger validation error on empty submit
    fireEvent.click(screen.getByRole('button', { name: /Create Customer/i }));
    expect(await screen.findByText(/Full name is required/i)).toBeInTheDocument();
    expect(await screen.findByText(/Valid mobile number is required/i)).toBeInTheDocument();

    // Fill valid fields and submit
    const fullNameInput = document.querySelector('input[name="full_name"]') as HTMLInputElement;
    const mobileInput = document.querySelector('input[name="mobile"]') as HTMLInputElement;
    fireEvent.change(fullNameInput, { target: { value: 'Aarav Kulkarni' } });
    fireEvent.change(mobileInput, { target: { value: '9822011223' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Customer/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({ full_name: 'Aarav Kulkarni', mobile: '9822011223' })
      );
    });

    // Search error toast test
    fireEvent.change(screen.getByPlaceholderText(/Search name, phone, city, company/i), {
      target: { value: 'Fail' },
    });
    expect(await screen.findByText(/Simulated customer API error/i)).toBeInTheDocument();
  });

  it('supports bookings filtering, view switching, and creating a new booking', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-own', user: OWNER_USER } });
      }
      if (url === '/bookings') {
        return Promise.resolve({ data: { id: 'BKG-10', booking_reference: 'BK-202604-0010' } });
      }
      return Promise.resolve({ data: {} });
    });
    mockGet.mockImplementation((url: string) => {
      if (url === '/auth/setup-status') return Promise.resolve({ data: { needs_initial_setup: false } });
      if (url === '/bookings') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'BKG-1',
                booking_reference: 'BK-202604-0001',
                customer_id: 'CUS-1',
                customer_name: 'Nikhil Patil',
                contact_number: '9876543210',
                booking_date: '2026-04-01',
                check_in_date: '2026-04-10',
                check_out_date: '2026-04-11',
                package_name: '24-Hour Stay Package',
                adults: 4,
                children: 1,
                infants: 0,
                rooms: 2,
                dormitory_guests: 0,
                booking_source: 'WhatsApp',
                booking_status: 'Confirmed',
                payment_status: 'Partially Paid',
                total_booking_amount: 8400,
                advance_paid: 3000,
                remaining_balance: 5400,
                created_at: '2026-04-01T10:00:00Z',
                updated_at: '2026-04-01T10:00:00Z',
              },
            ],
          },
        });
      }
      if (url === '/customers') {
        return Promise.resolve({
          data: { items: [{ id: 'CUS-1', customer_id: 'CUS-001', full_name: 'Nikhil Patil', mobile: '9876543210' }] },
        });
      }
      if (url === '/packages') {
        return Promise.resolve({
          data: { items: [{ id: 'PKG-1', name: '24-Hour Stay Package', weekday_rate: 1800, weekend_rate: 2500 }] },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<BookingsPage />);

    expect((await screen.findAllByText('BK-202604-0001')).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: /Upcoming Check-ins/i }));
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/bookings',
        expect.objectContaining({ params: expect.objectContaining({ view: 'upcoming_checkins' }) })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /New Booking/i }));
    expect(await screen.findByText(/Create New Booking/i)).toBeInTheDocument();
  });

  it('supports live quotation calculation and line-item creation', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-own', user: OWNER_USER } });
      }
      if (url === '/quotations/calculate') {
        return Promise.resolve({
          data: { subtotal: 7200, discount_total: 0, tax_total: 0, grand_total: 7200 },
        });
      }
      if (url === '/quotations') {
        return Promise.resolve({ data: { id: 'QT-1', quotation_number: 'QT-202604-0001' } });
      }
      return Promise.resolve({ data: {} });
    });
    mockGet.mockImplementation((url: string) => {
      if (url === '/auth/setup-status') return Promise.resolve({ data: { needs_initial_setup: false } });
      if (url === '/quotations') return Promise.resolve({ data: { items: [] } });
      if (url === '/customers') {
        return Promise.resolve({
          data: { items: [{ id: 'CUS-1', customer_id: 'CUS-001', full_name: 'Nikhil Patil', mobile: '9876543210' }] },
        });
      }
      if (url === '/packages') {
        return Promise.resolve({
          data: { items: [{ id: 'PKG-1', name: '24-Hour Stay Package', weekday_rate: 1800, weekend_rate: 2500, included_meals: 'Unlimited Food' }] },
        });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<QuotationsPage />);

    expect(await screen.findByText(/No quotations found/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New Quotation/i }));
    expect(await screen.findByRole('button', { name: /Save Quotation/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Quotation/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/quotations',
        expect.objectContaining({
          customer_id: 'CUS-1',
          line_items: expect.arrayContaining([
            expect.objectContaining({ description: '24-Hour Stay Package', quantity: 4, rate: 1800 }),
          ]),
        })
      );
    });
  });

  it('allows entering a direct customer name on invoice creation without pre-registering in Customers', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/auth/refresh') {
        return Promise.resolve({ data: { access_token: 'tok-own', user: OWNER_USER } });
      }
      if (url === '/invoices') {
        return Promise.resolve({ data: { invoice: { id: 'INV-1', invoice_number: 'INV-0001' } } });
      }
      return Promise.resolve({ data: {} });
    });
    mockGet.mockImplementation((url: string) => {
      if (url === '/auth/setup-status') return Promise.resolve({ data: { needs_initial_setup: false } });
      if (url === '/invoices') return Promise.resolve({ data: { items: [] } });
      if (url === '/customers') return Promise.resolve({ data: { items: [] } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<InvoicesPage />);

    expect(await screen.findByText(/No invoices generated yet/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New Invoice/i }));

    const nameInput = await screen.findByPlaceholderText(/Type customer full name/i);
    fireEvent.change(nameInput, { target: { value: 'Soham Desai' } });

    // 1-tap meal add-on (Chicken 65 ₹320) updates live auto-calculation
    fireEvent.click(screen.getByRole('button', { name: /Chicken 65/i }));
    // Initial row: 2 * 1800 = 3600 + 320 = 3920 -> Full Paid button shows ₹3,920
    expect(await screen.findByRole('button', { name: /Full Paid \(₹3,920\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Finalize & Generate Invoice/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/invoices',
        expect.objectContaining({
          customer_id: null,
          customer_name: 'Soham Desai',
          line_items: expect.arrayContaining([
            expect.objectContaining({ description: 'Chicken 65', quantity: 1, rate: 320 }),
          ]),
        })
      );
    });
  });
});

