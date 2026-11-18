import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

const SNOOZE_HOURS = [1, 2, 4, 8];

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';

interface SpeakerPromptModalProps {
  isOpen: boolean;
  /** The output's name, e.g. "MacBook Pro Speakers"; null when unknown. */
  device: string | null;
  /** Play out loud; with hours, don't ask again for that long. */
  onPlay: (snoozeHours: number | null) => void;
  onCancel: () => void;
}

/** Asks before the book plays out loud (see the speaker guard in AudioContext). */
function SpeakerPromptModal({ isOpen, device, onPlay, onCancel }: SpeakerPromptModalProps) {
  const { t } = useTranslation();
  const [snoozeHours, setSnoozeHours] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) setSnoozeHours(null);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t('speaker.title')} maxWidth="max-w-sm" zIndex={60}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[#D1D5DB]">
          {device ? t('speaker.body', { device }) : t('speaker.bodyUnknown')}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#9CA3AF] mr-auto">{t('speaker.snooze')}</span>
          {SNOOZE_HOURS.map((hours) => (
            <button
              key={hours}
              type="button"
              aria-pressed={snoozeHours === hours}
              onClick={() => setSnoozeHours(snoozeHours === hours ? null : hours)}
              className={`h-8 min-w-[40px] px-2 rounded-[8px] text-xs font-semibold tabular-nums transition-colors ${focusRing} ${
                snoozeHours === hours ? 'bg-[#FF5100] text-white' : 'bg-white/[0.06] text-[#D1D5DB] hover:bg-white/10 hover:text-white'
              }`}
            >
              {t('speaker.hours', { count: hours })}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className={`flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors ${focusRing}`}>
            {t('speaker.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => onPlay(snoozeHours)}
            className={`flex-1 h-11 px-4 rounded-[10px] border border-[#FF7A3D]/40 bg-transparent text-[#FF7A3D] text-sm font-semibold hover:bg-[#FF6A26]/10 transition-colors ${focusRing}`}
          >
            {t('speaker.play')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default SpeakerPromptModal;
