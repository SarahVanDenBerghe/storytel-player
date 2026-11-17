import React, { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';

export interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  title?: string | React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-4xl'
  zIndex?: number;
}

const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  headerActions,
  maxWidth = 'max-w-md',
  zIndex = 50
}) => {
  // Called before the early return so the hook order stays stable.
  const { t } = useTranslation();
  const titleId = useId();

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasHeader = Boolean(title || onClose || headerActions);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center p-4"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`bg-[#17171A] text-white rounded-[14px] w-full ${maxWidth} border border-white/10 max-h-[90vh] flex flex-col shadow-[0_24px_60px_rgba(0,0,0,0.7)] overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        {hasHeader && (
          <div className="flex items-center gap-2 py-2 pr-2 pl-5 shrink-0">
            {title ? (
              <h2 id={titleId} className="text-[15px] font-semibold text-white flex-1 min-w-0">
                {title}
              </h2>
            ) : (
              <div className="flex-1" />
            )}
            {headerActions}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t('common.close', 'Close')}
                title={t('common.close', 'Close')}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[10px] text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
              >
                <svg aria-hidden="true" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-5 ${hasHeader ? '' : 'pt-5'}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
