import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface PlaybackSpeedModalProps {
  isOpen: boolean;
  playbackRate: number;
  onClose: () => void;
  onRateChange: (rate: number) => void;
}

function PlaybackSpeedModal({ isOpen, playbackRate, onClose, onRateChange }: PlaybackSpeedModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('playbackSpeed.title')}>
      <div className="flex flex-col gap-5">

        {/* Preset speeds */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]">{t('playbackSpeed.presets')}</h3>
          <ul className="flex flex-col gap-0.5">
            {[1.0, 1.25, 1.5, 1.75, 2.0].map((speed) => {
              const isSelected = playbackRate === speed;
              return (
                <li key={speed}>
                  <button
                    type="button"
                    onClick={() => onRateChange(speed)}
                    aria-pressed={isSelected}
                    className={`w-full h-11 flex items-center px-3 rounded-[10px] text-left text-[13px] tabular-nums transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-[-2px] ${
                      isSelected ? 'bg-white/[0.06] text-[#FF5100] font-semibold' : 'text-[#E5E7EB] hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="flex-1">{speed}x</span>
                    {isSelected && (
                      <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Custom speed slider */}
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9CA3AF]">{t('playbackSpeed.custom')}</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#9CA3AF] tabular-nums">0.5x</span>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={playbackRate}
              onChange={(e) => onRateChange(parseFloat(e.target.value))}
              aria-label={t('playbackSpeed.custom')}
              className="flex-1 accent-[#FF5100] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
            />
            <span className="text-xs text-[#9CA3AF] tabular-nums">2.0x</span>
          </div>
          <div className="text-center mt-2 text-sm font-semibold text-[#FF7A3D] tabular-nums">{playbackRate}x</div>
        </section>

        <button type="button" onClick={onClose} className="w-full h-11 px-4 rounded-[10px] bg-[#FF5100] text-white text-sm font-semibold hover:bg-[#FF6A26] transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
          {t('playbackSpeed.confirm')}
        </button>
      </div>
    </Modal>
  );
}

export default PlaybackSpeedModal;