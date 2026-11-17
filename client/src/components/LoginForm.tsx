import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { trackAction } from '../utils/api';
import storage from "../utils/storage";
import LanguageButton from './LanguageButton';

interface LoginFormProps {
  onLogin: () => void;
  sessionExpired?: boolean;
}

function LoginForm({ onLogin, sessionExpired }: LoginFormProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSsoLoading, setIsSsoLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const ssoAvailable = typeof window !== 'undefined' && !!window.electronAuth;

  const [ssoProvider, setSsoProvider] = useState<'google' | 'apple' | null>(null);

  const handleSsoLogin = async (provider: 'google' | 'apple') => {
    if (!window.electronAuth) return;
    setIsSsoLoading(true);
    setSsoProvider(provider);
    setError('');
    try {
      trackAction('User attempted SSO login', { provider });
      const result = await window.electronAuth.openSsoWindow(provider);
      if (result.cancelled) {
        setIsSsoLoading(false);
        setSsoProvider(null);
        return;
      }
      if (result.error || !result.credentials) {
        setError(result.error ?? t('login.errors.failed'));
        setIsSsoLoading(false);
        setSsoProvider(null);
        return;
      }
      const response = await api.post('/sso-login', result.credentials);
      const { token } = response.data;
      await storage.set('token', token);
      onLogin();
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? t('login.errors.failed'));
    } finally {
      setIsSsoLoading(false);
      setSsoProvider(null);
    }
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();

    if (!email || !password) {
      setError(t('login.errors.required'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      trackAction('User attempted login', { email });
      const response = await api.post('/login', { email, password });
      const { token } = response.data;
      await storage.set('token', token);
      onLogin();
      navigate('/');
    } catch (error: any) {
      setError(error.response?.data?.error || t('login.errors.failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'h-11 w-full px-3 rounded-[10px] border border-white/[0.14] bg-[#121214] text-white text-sm placeholder-[#9CA3AF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';
  const ssoButtonClass =
    'h-11 w-full rounded-[10px] border border-white/[0.14] bg-transparent text-white text-sm font-medium hover:bg-white/[0.04] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center p-6">
      {/* Reachable before login: the app may have started in a language the
          user does not read, and the floating dock is not mounted yet. */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageButton variant="ghost" />
      </div>
      <form className="w-full max-w-[340px] flex flex-col gap-3" onSubmit={handleSubmit}>
        <div
          aria-hidden="true"
          className="w-10 h-10 mb-2 rounded-[12px] bg-[#FF5100] text-[#0A0A0A] flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 15v-3a8 8 0 0116 0v3" />
            <path d="M4 15a2 2 0 012-2h1v6H6a2 2 0 01-2-2zM20 15a2 2 0 00-2-2h-1v6h1a2 2 0 002-2z" />
          </svg>
        </div>
        <div className="mb-2">
          <h1 className="m-0 text-lg font-semibold">{t('login.title')}</h1>
          <p className="mt-1 text-[13px] text-[#9CA3AF]">{t('login.subtitle')}</p>
        </div>

        {sessionExpired && (
          <div role="status" className="text-[13px] text-[#FCD34D] bg-[#FCD34D]/[0.08] border border-[#FCD34D]/30 rounded-[10px] px-3 py-2.5">
            {t('login.errors.sessionExpired')}
          </div>
        )}

        {ssoAvailable && (
          <>
            <button
              type="button"
              onClick={() => handleSsoLogin('google')}
              disabled={isSsoLoading || isLoading}
              className={ssoButtonClass}
            >
              {isSsoLoading && ssoProvider === 'google' ? t('login.ssoOpening') : t('login.ssoGoogle')}
            </button>
            <button
              type="button"
              onClick={() => handleSsoLogin('apple')}
              disabled={isSsoLoading || isLoading}
              className={ssoButtonClass}
            >
              {isSsoLoading && ssoProvider === 'apple' ? t('login.ssoOpening') : t('login.ssoApple')}
            </button>

            <div className="flex items-center gap-3 my-1 text-xs text-[#9CA3AF]">
              <span className="flex-1 h-px bg-white/10" />
              {t('login.ssoDivider')}
              <span className="flex-1 h-px bg-white/10" />
            </div>
          </>
        )}

        <label htmlFor="email" className="flex flex-col gap-1.5 text-xs text-[#D1D5DB]">
          {t('login.email')}
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs text-[#D1D5DB]">
            {t('login.password')}
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t('login.hidePassword', 'Hide password') : t('login.showPassword', 'Show password')}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 w-11 flex items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100]"
            >
              {showPassword ? (
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                </svg>
              ) : (
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="text-[13px] text-[#FCA5A5] bg-[#F87171]/[0.08] border border-[#F87171]/30 rounded-[10px] px-3 py-2.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-1 h-11 w-full flex items-center justify-center gap-2 rounded-[10px] bg-[#FF5100] text-[#0A0A0A] text-sm font-semibold hover:bg-[#FF6A26] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
        >
          {isLoading && (
            <svg aria-hidden="true" className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {isLoading ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  );
}

export default LoginForm;
