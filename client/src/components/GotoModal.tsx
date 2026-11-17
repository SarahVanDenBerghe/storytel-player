import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface GotoModalProps {
  isOpen: boolean;
  playbackRate: number;
  gotoHours: number;
  gotoMinutes: number;
  gotoSeconds: number;
  onClose: () => void;
  onHoursChange: (hours: number) => void;
  onMinutesChange: (minutes: number) => void;
  onSecondsChange: (seconds: number) => void;
  onGoto: () => void;
}

function GotoModal({
  isOpen,
  playbackRate,
  gotoHours,
  gotoMinutes,
  gotoSeconds,
  onClose,
  onHoursChange,
  onMinutesChange,
  onSecondsChange,
  onGoto
}: GotoModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('gotoModal.title')}>
      <div className="flex flex-col gap-5">
        <p className="text-[13px] text-[#9CA3AF]">
          {t('gotoModal.description', { speed: playbackRate })}
        </p>

        <div className="flex items-end justify-center gap-3">
            <label className="flex flex-col items-center gap-1.5 text-xs text-[#D1D5DB]">
              {t('gotoModal.hours')}
              <input
                type="number"
                min="0"
                max="23"
                value={gotoHours}
                onChange={(e) => onHoursChange(parseInt(e.target.value) || 0)}
                className="w-16 h-11 px-2 rounded-[10px] border border-white/[0.14] bg-[#121214] text-white text-center text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
              />
            </label>
            <span aria-hidden="true" className="text-[#9CA3AF] text-lg pb-2.5">:</span>
            <label className="flex flex-col items-center gap-1.5 text-xs text-[#D1D5DB]">
              {t('gotoModal.minutes')}
              <input
                type="number"
                min="0"
                max="59"
                value={gotoMinutes}
                onChange={(e) => onMinutesChange(parseInt(e.target.value) || 0)}
                className="w-16 h-11 px-2 rounded-[10px] border border-white/[0.14] bg-[#121214] text-white text-center text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
              />
            </label>
            <span aria-hidden="true" className="text-[#9CA3AF] text-lg pb-2.5">:</span>
            <label className="flex flex-col items-center gap-1.5 text-xs text-[#D1D5DB]">
              {t('gotoModal.seconds')}
              <input
                type="number"
                min="0"
                max="59"
                value={gotoSeconds}
                onChange={(e) => onSecondsChange(parseInt(e.target.value) || 0)}
                className="w-16 h-11 px-2 rounded-[10px] border border-white/[0.14] bg-[#121214] text-white text-center text-sm tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
              />
            </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
            {t('gotoModal.cancel')}
          </button>
          <button type="button" onClick={onGoto} className="flex-1 h-11 px-4 rounded-[10px] bg-[#FF5100] text-white text-sm font-semibold hover:bg-[#FF6A26] transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
            {t('gotoModal.go')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default GotoModal;