import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BrandLogo } from '../components/BrandLogo';
import { extractErrorMessage } from '../utils/format';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const setupSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  full_name: z.string().min(2, 'Full name is required'),
  email: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;
type SetupForm = z.infer<typeof setupSchema>;

export const LoginPage: React.FC = () => {
  const { needsSetup, login, setupOwner, serverOffline, refreshSession } = useAuth();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const loginForm = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
  const setupForm = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { username: 'admin', full_name: 'Pranit Dabhade', email: '' },
  });

  const handleLogin = async (values: LoginForm) => {
    setSubmitting(true);
    setErrMsg(null);
    try {
      await login(values.username, values.password);
      showToast('Signed in to Blueberry Farm and Resort', 'success');
    } catch (err) {
      setErrMsg(extractErrorMessage(err, 'Invalid username or password.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetup = async (values: SetupForm) => {
    setSubmitting(true);
    setErrMsg(null);
    try {
      await setupOwner(values);
      showToast('Owner account created! Welcome to Blueberry Farm and Resort.', 'success');
    } catch (err) {
      setErrMsg(extractErrorMessage(err, 'Failed to create owner account.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#F5F7FB] px-4 py-8">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-[#E3E8F0] bg-white shadow-xl">
        <div className="bg-[#0752A5] px-6 py-7 text-center text-white">
          <div className="mx-auto mb-3 inline-flex rounded-full bg-white p-1 shadow-md">
            <BrandLogo size={76} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Blueberry Farm and Resort</h1>
          <p className="mt-1 text-xs text-[#D5DEFF]">
            At. Post – Mandawane, Tal – Karjat, Dist – Raigad, Maharashtra
          </p>
        </div>

        <div className="p-6">
          {serverOffline && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
              <p className="font-semibold">Backend server is unreachable.</p>
              <p className="mt-1 text-xs">Ensure the FastAPI server is running on port 8000.</p>
              <button
                type="button"
                onClick={() => void refreshSession()}
                className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Retry Connection
              </button>
            </div>
          )}

          {errMsg && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
              {errMsg}
            </div>
          )}

          {needsSetup ? (
            <form onSubmit={setupForm.handleSubmit(handleSetup)} className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl bg-[#D5DEFF]/40 px-3 py-2 text-xs font-semibold text-[#0752A5]">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Initial Resort Setup — Create Owner / Admin Account</span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  {...setupForm.register('full_name')}
                  className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] px-3.5 outline-none focus:border-[#0752A5]"
                />
                {setupForm.formState.errors.full_name && (
                  <p className="mt-1 text-xs text-rose-600">{setupForm.formState.errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Username *</label>
                <input
                  {...setupForm.register('username')}
                  autoCapitalize="none"
                  className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] px-3.5 outline-none focus:border-[#0752A5]"
                />
                {setupForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-rose-600">{setupForm.formState.errors.username.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Email (optional)</label>
                <input
                  type="email"
                  {...setupForm.register('email')}
                  className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] px-3.5 outline-none focus:border-[#0752A5]"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Password (min 8 chars) *</label>
                <input
                  type="password"
                  {...setupForm.register('password')}
                  className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] px-3.5 outline-none focus:border-[#0752A5]"
                />
                {setupForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-rose-600">{setupForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full rounded-xl bg-[#0752A5] font-semibold text-white shadow-sm hover:bg-[#236DC4] disabled:opacity-50"
              >
                {submitting ? 'Creating Owner Account...' : 'Complete Setup & Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-bold text-[#172033]">Staff Sign In</h2>
                <p className="text-xs text-slate-500">Enter your Blueberry Resort staff credentials</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Username / Name *</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    {...loginForm.register('username')}
                    autoCapitalize="none"
                    autoComplete="username"
                    placeholder="admin or pranit-dabhade"
                    className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] pl-11 pr-3.5 outline-none focus:border-[#0752A5]"
                  />
                </div>
                {loginForm.formState.errors.username && (
                  <p className="mt-1 text-xs text-rose-600">{loginForm.formState.errors.username.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Password *</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-400" />
                  <input
                    type="password"
                    {...loginForm.register('password')}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    className="min-h-[46px] w-full rounded-xl border border-[#E3E8F0] pl-11 pr-3.5 outline-none focus:border-[#0752A5]"
                  />
                </div>
                {loginForm.formState.errors.password && (
                  <p className="mt-1 text-xs text-rose-600">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[48px] w-full rounded-xl bg-[#0752A5] font-semibold text-white shadow-sm hover:bg-[#236DC4] disabled:opacity-50"
              >
                {submitting ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

