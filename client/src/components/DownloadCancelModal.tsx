import React from 'react';
import {useTranslation} from 'react-i18next';
import Modal from './Modal';

interface DownloadCancelModalProps {
    isOpen: boolean;
    isDownloading: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const DownloadCancelModal: React.FC<DownloadCancelModalProps> = ({isOpen, isDownloading, onConfirm, onCancel}) => {
    const {t} = useTranslation();

    if (!isOpen) return null;

    const title = isDownloading ? t('download.cancelTitle') : t('download.deleteTitle');
    const message = isDownloading ? t('download.cancelMessage') : t('download.deleteMessage');
    const warning = isDownloading ? t('download.cancelWarning') : t('download.deleteWarning');
    const confirmButton = isDownloading ? t('download.cancelButton') : t('download.deleteButton');
    const cancelButton = isDownloading ? t('download.continueButton') : t('download.keepButton');

    return (
        <Modal isOpen={isOpen} onClose={onCancel} title={title}>
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <p className="text-sm text-[#D1D5DB]">{message}</p>
                    <p className="text-xs text-[#9CA3AF]">{warning}</p>
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={onCancel} className="flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
                        {cancelButton}
                    </button>
                    <button type="button" onClick={onConfirm} className="flex-1 h-11 px-4 rounded-[10px] border border-[#FF7A3D]/40 bg-transparent text-[#FF7A3D] text-sm font-semibold hover:bg-[#FF7A3D]/10 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2">
                        {confirmButton}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default DownloadCancelModal;