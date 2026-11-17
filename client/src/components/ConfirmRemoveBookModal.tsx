import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';

interface ConfirmRemoveBookModalProps {
    isOpen: boolean;
    /** Title of the book about to be removed, shown in the message. */
    bookTitle: string;
    isRemoving?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Confirmation for taking a book off the Storytel bookshelf. */
function ConfirmRemoveBookModal({
    isOpen,
    bookTitle,
    isRemoving = false,
    onConfirm,
    onCancel,
}: ConfirmRemoveBookModalProps) {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onCancel} title={t('bookshelf.removeTitle')} zIndex={60} maxWidth="max-w-sm">
            <div className="flex flex-col gap-4">
                <p className="text-sm text-[#D1D5DB]">
                    {t('bookshelf.removeMessage', { title: bookTitle })}
                </p>
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isRemoving}
                        className="flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isRemoving}
                        className="flex-1 h-11 px-4 rounded-[10px] border border-[#FF7A3D]/40 bg-transparent text-[#FF7A3D] text-sm font-semibold hover:bg-[#FF7A3D]/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2"
                    >
                        {t('bookshelf.removeConfirm')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export default ConfirmRemoveBookModal;
