import React from 'react';
import { useTranslation } from 'react-i18next';

interface ErrorStateProps {
  error: any;
  onRetry?: () => void;
  onLogout?: () => void;
}

function ErrorState({ error, onRetry, onLogout }: ErrorStateProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center p-6">
      <div role="alert" className="text-center w-full max-w-[340px] flex flex-col items-center">
        <div aria-hidden="true" className="w-10 h-10 mb-4 rounded-[12px] bg-[#FF7A3D]/[0.12] text-[#FF7A3D] flex items-center justify-center">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.008v.008H12v-.008Z" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold text-white">{t('errorState.title')}</h2>
        <p className="mt-1 text-[13px] text-[#9CA3AF] break-words">{error}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 h-11 px-5 rounded-[10px] bg-[#FF5100] text-[#0A0A0A] text-sm font-semibold hover:bg-[#FF6A26] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
          >
            {t('errorState.tryAgain')}
          </button>
        )}
        {onLogout && (
          <div className="mt-8 flex flex-col items-center">
            <p className="text-xs text-[#9CA3AF] mb-3">{t('errorState.logoutHint')}</p>
            <button
              type="button"
              onClick={onLogout}
              className="h-11 px-5 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
            >
              {t('errorState.logout')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ErrorState;
