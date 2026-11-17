import React from 'react';
import { Chapter } from '../interfaces/chapters';
import { useTranslation } from 'react-i18next';
import { formatTime } from '../utils/helpers';
import Modal from './Modal';

interface ChaptersModalProps {
  isOpen: boolean;
  chapters: Chapter[];
  currentTime: number;
  playbackRate: number;
  onClose: () => void;
  onChapterClick: (chapterStartTime: number) => void;
}

function ChaptersModal({
  isOpen,
  chapters,
  currentTime,
  playbackRate,
  onClose,
  onChapterClick,
}: ChaptersModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('chapters.title', 'Chapters')}>
      {chapters && chapters.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {chapters.map((chapter, index) => {
            const chapterStartTime = typeof chapter.start === 'number' && !isNaN(chapter.start)
              ? chapter.start
              : chapters.slice(0, index).reduce((total, ch) => total + (ch.durationInSeconds || 0), 0);
            const chapterDuration = chapter.durationInSeconds || 0;
            const chapterEndTime = typeof chapter.end === 'number' && !isNaN(chapter.end)
              ? chapter.end
              : chapterStartTime + chapterDuration;

            const isCurrentChapter = currentTime >= chapterStartTime && currentTime < chapterEndTime;
            const chapterProgress = isCurrentChapter && chapterDuration > 0
              ? ((currentTime - chapterStartTime) / chapterDuration) * 100
              : 0;

            return (
              <li key={chapter.number || index}>
                <button
                  type="button"
                  aria-current={isCurrentChapter ? 'true' : undefined}
                  onClick={() => {
                    onChapterClick(chapterStartTime);
                    onClose();
                  }}
                  className={`relative w-full min-h-[44px] flex items-center gap-3 px-3 py-2 rounded-[10px] text-left overflow-hidden transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-[-2px] ${
                    isCurrentChapter ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="flex-1 min-w-0">
                    <span className={`block text-[13px] truncate ${isCurrentChapter ? 'text-[#FF5100] font-medium' : 'text-[#E5E7EB]'}`}>
                      {chapter.title || `${t('chapters.chapter')} ${chapter.number || index + 1}`}
                    </span>
                    {isCurrentChapter ? (
                      <span className="flex justify-between items-center mt-0.5 text-xs font-mono tabular-nums">
                        <span className="text-[#FFB38F]">
                          {formatTime((currentTime - chapterStartTime) / playbackRate)}
                        </span>
                        <span className="text-[#9CA3AF]">
                          -{formatTime(Math.max(0, chapterDuration - (currentTime - chapterStartTime)) / playbackRate)}
                        </span>
                      </span>
                    ) : (
                      <span className="block mt-0.5 text-xs text-[#9CA3AF] font-mono tabular-nums">
                        {formatTime(chapterStartTime / playbackRate)} • {formatTime(chapterDuration / playbackRate)}
                      </span>
                    )}
                  </span>
                  {isCurrentChapter && (
                    <svg aria-hidden="true" className="w-4 h-4 shrink-0 text-[#FF5100]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 6.8v10.4a1 1 0 001.5.86l8.3-5.2a1 1 0 000-1.72l-8.3-5.2A1 1 0 009 6.8z" />
                    </svg>
                  )}
                  {/* Chapter progress */}
                  {isCurrentChapter && (
                    <span aria-hidden="true" className="absolute left-0 right-0 bottom-0 h-0.5 bg-white/10">
                      <span
                        className="absolute top-0 left-0 h-full bg-[#FF5100] transition-all duration-300"
                        style={{ width: `${Math.min(Math.max(chapterProgress, 0), 100)}%` }}
                      />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-center text-sm text-[#9CA3AF] py-10">
          {t('chapters.noChapters', 'No chapters available')}
        </p>
      )}
    </Modal>
  );
}

export default ChaptersModal;
