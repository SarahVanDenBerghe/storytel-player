import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface ConfirmLogoutModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmLogoutModal({ isOpen, onConfirm, onCancel }: ConfirmLogoutModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={t('logout.confirmTitle')} maxWidth="max-w-sm">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[#D1D5DB]">
          {t('logout.confirmMessage')}
        </p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
            {t('logout.cancelButton')}
          </button>
          <button type="button" onClick={onConfirm} className="flex-1 h-11 px-4 rounded-[10px] border border-[#FF7A3D]/40 bg-transparent text-[#FF7A3D] text-sm font-semibold hover:bg-[#FF6A26]/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
            {t('logout.confirmButton')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ConfirmLogoutModal;
