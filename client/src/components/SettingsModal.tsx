import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../utils/api';
import LogsModal from './LogsModal';
import LanguageModal from './LanguageModal';
import Modal from './Modal';
import { getLanguageState, LanguageState } from '../i18n';
import { AUTO_LANGUAGE, findLanguage } from '../config/languages';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

function SettingsModal({ isOpen, onClose, onLogout }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);
  const [showLogsModal, setShowLogsModal] = useState<boolean>(false);
  const [showLanguageModal, setShowLanguageModal] = useState<boolean>(false);
  const [languageState, setLanguageState] = useState<LanguageState | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAccountInfo();
      fetchAlwaysOnTopSetting();
    }
  }, [isOpen]);

  // Also refresh after the picker closes, so the summary line stays accurate.
  useEffect(() => {
    if (isOpen && !showLanguageModal) {
      fetchAppLanguage();
    }
  }, [isOpen, showLanguageModal, i18n.language]);

  // "Svenska" for an explicit choice, "Follows the system · Svenska" otherwise.
  const activeLanguage = findLanguage(languageState?.resolved ?? i18n.language);
  const activeName = activeLanguage?.nativeName ?? languageState?.resolved ?? i18n.language;
  const languageSummary =
    languageState?.mode === AUTO_LANGUAGE
      ? t('language.autoResolved', { language: activeName })
      : activeName;

  const fetchAccountInfo = async () => {
    try {
      setLoading(true);
      const response = await api.get('/account');
      setEmail(response.data.email);
    } catch (error) {
      console.error('Failed to fetch account info:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAlwaysOnTopSetting = async () => {
    try {
      if (window.electronWindow) {
        const isOnTop = await window.electronWindow.isAlwaysOnTop();
        setAlwaysOnTop(isOnTop);
      }
    } catch (error) {
      console.error('Failed to fetch always on top setting:', error);
    }
  };
  
  const fetchAppLanguage = async () => {
    try {
      setLanguageState(await getLanguageState());
    } catch (error) {
      console.error('Failed to fetch app language setting:', error);
    }
  };

  const handleAlwaysOnTopToggle = async () => {
    try {
      if (window.electronWindow) {
        const newValue = !alwaysOnTop;
        await window.electronWindow.setAlwaysOnTop(newValue);
        setAlwaysOnTop(newValue);
      }
    } catch (error) {
      console.error('Failed to toggle always on top:', error);
    }
  };
  
  const handleGithubClick = () => {
    window.open('https://github.com/debba/storytel-player', '_blank', 'noopener,noreferrer');
  };

  const handleDiscordClick = () => {
    window.open('https://discord.gg/YrZPHAwMSG', '_blank', 'noopener,noreferrer');
  };

  if (!isOpen) return null;

  const sectionLabel = 'mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]';
  const group = 'flex flex-col rounded-[10px] bg-white/[0.04]';
  const divider = <div aria-hidden="true" className="h-px bg-white/[0.06] mx-3.5" />;
  const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';
  const linkRow = `w-full flex items-center gap-3 px-3.5 py-3 text-left text-[13px] text-[#E5E7EB] rounded-[10px] hover:bg-white/[0.04] transition-colors ${focusRing}`;

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={t('settings.title')} maxWidth="max-w-[440px]">
      <div className="flex flex-col gap-5">

        {/* Account */}
        <section>
          <h3 className={sectionLabel}>{t('settings.account')}</h3>
          <div className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] bg-white/[0.04]">
            <span className="flex-1 min-w-0 truncate text-[13px] text-[#D1D5DB]" title={email || undefined}>
              <span className="sr-only">{t('settings.email')}: </span>
              {loading ? t('common.loading') : email || '-'}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className={`h-8 px-3 shrink-0 rounded-lg border border-white/[0.14] bg-transparent text-xs text-[#E5E7EB] hover:bg-white/[0.06] transition-colors ${focusRing}`}
            >
              {t('settings.logout')}
            </button>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <h3 className={sectionLabel}>{t('settings.appearance')}</h3>
          <div className={group}>
            <label className="flex items-center gap-3 px-3.5 py-3 cursor-pointer">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] text-white">{t('settings.alwaysOnTop')}</span>
                <span className="block mt-0.5 text-xs text-[#9CA3AF]">{t('settings.alwaysOnTopDescription')}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={alwaysOnTop}
                onChange={handleAlwaysOnTopToggle}
                className={`w-[18px] h-[18px] shrink-0 accent-[#FF5100] cursor-pointer ${focusRing}`}
              />
            </label>
            {divider}
            <button
              type="button"
              onClick={() => setShowLanguageModal(true)}
              className={linkRow}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-white">{t('settings.language')}</span>
                <span className="block mt-0.5 text-xs text-[#9CA3AF] truncate">{languageSummary}</span>
              </span>
              <span aria-hidden="true" className="text-[#9CA3AF]">›</span>
            </button>
          </div>
        </section>

        {/* Community */}
        <section>
          <h3 className={sectionLabel}>{t('settings.community')}</h3>
          <div className={group}>
            <button type="button" onClick={handleGithubClick} className={linkRow}>
              <span className="flex-1">{t('settings.githubRepo')}</span>
              <span aria-hidden="true" className="text-[#9CA3AF]">↗</span>
            </button>
            {divider}
            <button type="button" onClick={handleDiscordClick} className={linkRow}>
              <span className="flex-1">{t('settings.discordCommunity')}</span>
              <span aria-hidden="true" className="text-[#9CA3AF]">↗</span>
            </button>
          </div>
        </section>

        {/* Developer */}
        <section>
          <h3 className={sectionLabel}>{t('settings.developer', 'Developer')}</h3>
          <div className={group}>
            <button type="button" onClick={() => setShowLogsModal(true)} className={linkRow}>
              <span className="flex-1">{t('settings.viewLogs', 'View Session Logs')}</span>
              <span aria-hidden="true" className="text-[#9CA3AF]">›</span>
            </button>
          </div>
        </section>
      </div>
    </Modal>

    <LogsModal
      isOpen={showLogsModal}
      onClose={() => setShowLogsModal(false)}
    />

    <LanguageModal
      isOpen={showLanguageModal}
      onClose={() => setShowLanguageModal(false)}
    />
    </>
  );
}

export default SettingsModal;
