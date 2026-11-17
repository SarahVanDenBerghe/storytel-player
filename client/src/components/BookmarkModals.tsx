import React from 'react';
import { useTranslation } from 'react-i18next';
import {formatTime} from "../utils/helpers";
import { Bookmark } from "../interfaces/bookmarks";
import Modal from './Modal';

interface BookmarkModalsProps {
  // Bookmarks Modal
  showBookmarksModal: boolean;
  bookmarks: Bookmark[];
  onCloseBookmarksModal: () => void;
  onShowCreateBookmarkModal: () => void;
  onGoToBookmark: (position: number) => void;
  onShowEditBookmarkModal: (bookmark: Bookmark) => void;
  onShowDeleteConfirmModal: (bookmark: Bookmark) => void;

  // Create Bookmark Modal
  showCreateBookmarkModal: boolean;
  newBookmarkNote: string;
  currentTime: number;
  playbackRate: number;
  onCloseCreateBookmarkModal: () => void;
  onNewBookmarkNoteChange: (note: string) => void;
  onCreateBookmark: () => void;

  // Edit Bookmark Modal
  showEditBookmarkModal: boolean;
  bookmarkToEdit: Bookmark | null;
  editBookmarkNote: string;
  onCloseEditBookmarkModal: () => void;
  onEditBookmarkNoteChange: (note: string) => void;
  onEditBookmark: () => void;

  // Delete Confirmation Modal
  showDeleteConfirmModal: boolean;
  bookmarkToDelete: Bookmark | null;
  onCloseDeleteConfirmModal: () => void;
  onDeleteBookmark: () => void;
}

function BookmarkModals({
  // Bookmarks Modal
  showBookmarksModal,
  bookmarks,
  onCloseBookmarksModal,
  onShowCreateBookmarkModal,
  onGoToBookmark,
  onShowEditBookmarkModal,
  onShowDeleteConfirmModal,

  // Create Bookmark Modal
  showCreateBookmarkModal,
  newBookmarkNote,
  currentTime,
  playbackRate,
  onCloseCreateBookmarkModal,
  onNewBookmarkNoteChange,
  onCreateBookmark,

  // Edit Bookmark Modal
  showEditBookmarkModal,
  bookmarkToEdit,
  editBookmarkNote,
  onCloseEditBookmarkModal,
  onEditBookmarkNoteChange,
  onEditBookmark,

  // Delete Confirmation Modal
  showDeleteConfirmModal,
  bookmarkToDelete,
  onCloseDeleteConfirmModal,
  onDeleteBookmark
}: BookmarkModalsProps) {
  const { t } = useTranslation();

  const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5100] focus-visible:outline-offset-2';
  const primaryButton = `flex-1 h-11 px-4 rounded-[10px] bg-[#FF5100] text-white text-sm font-semibold hover:bg-[#FF6A26] transition-colors ${focusRing}`;
  const secondaryButton = `flex-1 h-11 px-4 rounded-[10px] bg-white/[0.06] text-[#D1D5DB] text-sm font-medium hover:bg-white/10 transition-colors ${focusRing}`;
  const destructiveButton = `flex-1 h-11 px-4 rounded-[10px] border border-[#FF7A3D]/40 bg-transparent text-[#FF7A3D] text-sm font-semibold hover:bg-[#FF7A3D]/10 transition-colors ${focusRing}`;
  const textareaClass = `w-full px-3 py-2.5 rounded-[10px] border border-white/[0.14] bg-[#121214] text-white text-sm resize-none placeholder-[#9CA3AF] ${focusRing}`;
  const iconButton = `w-9 h-9 flex items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-white/[0.06] transition-colors ${focusRing} focus-visible:outline-offset-[-2px]`;

  return (
    <>
      {/* Bookmarks Modal */}
      <Modal isOpen={showBookmarksModal} onClose={onCloseBookmarksModal} title={t('bookmarks.title')}>
        <div className="flex flex-col gap-4">
          {bookmarks && bookmarks.length > 0 ? (
            <ul className="flex flex-col gap-0.5 max-h-[50vh] overflow-y-auto custom-scrollbar -mx-1 px-1">
              {bookmarks.map((bookmark) => (
                <li
                  key={bookmark.id}
                  className="flex items-center gap-1 rounded-[10px] hover:bg-white/[0.04] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onGoToBookmark(bookmark.position)}
                    className={`flex-1 min-w-0 min-h-[44px] px-3 py-2 text-left rounded-[10px] ${focusRing} focus-visible:outline-offset-[-2px]`}
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium text-[#FFB38F] font-mono tabular-nums">
                        {formatTime(bookmark.position)}
                      </span>
                      <span className="text-xs text-[#9CA3AF]">
                        {new Date(bookmark.insertTime).toLocaleDateString()}
                      </span>
                    </span>
                    {bookmark.note && (
                      <span className="block mt-0.5 text-[13px] text-[#D1D5DB] truncate">
                        {bookmark.note}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onShowEditBookmarkModal(bookmark)}
                    className={`${iconButton} hover:text-white`}
                    title={t('bookmarks.tooltipEdit')}
                    aria-label={t('bookmarks.tooltipEdit')}
                  >
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onShowDeleteConfirmModal(bookmark)}
                    className={`${iconButton} hover:text-[#FF7A3D] mr-1`}
                    title={t('bookmarks.tooltipDelete')}
                    aria-label={t('bookmarks.tooltipDelete')}
                  >
                    <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-sm text-[#9CA3AF] py-8">{t('bookmarks.noBookmarks')}</p>
          )}

          <div className="flex">
            <button type="button" onClick={onShowCreateBookmarkModal} className={primaryButton}>
              {t('bookmarks.createNew')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Bookmark Modal */}
      <Modal isOpen={showCreateBookmarkModal} onClose={onCloseCreateBookmarkModal} title={t('bookmarks.createTitle')}>
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-[#9CA3AF]">
            {t('bookmarks.currentPosition')}{' '}
            <span className="font-mono tabular-nums text-[#FFB38F]">{formatTime(currentTime / playbackRate)}</span>
          </p>
          <label className="flex flex-col gap-1.5 text-xs text-[#D1D5DB]">
            {t('bookmarks.noteOptional')}
            <textarea
              value={newBookmarkNote}
              onChange={(e) => onNewBookmarkNoteChange(e.target.value)}
              className={textareaClass}
              rows={3}
              placeholder={t('bookmarks.notePlaceholderCreate')}
            />
          </label>
          <div className="flex gap-3">
            <button type="button" onClick={onCloseCreateBookmarkModal} className={secondaryButton}>
              {t('common.cancel')}
            </button>
            <button type="button" onClick={onCreateBookmark} className={primaryButton}>
              {t('bookmarks.save')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Bookmark Modal */}
      <Modal
        isOpen={showEditBookmarkModal && !!bookmarkToEdit}
        onClose={onCloseEditBookmarkModal}
        title={t('bookmarks.editTitle')}
      >
        {bookmarkToEdit && (
          <div className="flex flex-col gap-4">
            <p className="text-[13px] text-[#9CA3AF]">
              {t('bookmarks.position')}{' '}
              <span className="font-mono tabular-nums text-[#FFB38F]">{formatTime(bookmarkToEdit.position)}</span>
            </p>
            <label className="flex flex-col gap-1.5 text-xs text-[#D1D5DB]">
              {t('bookmarks.note')}
              <textarea
                value={editBookmarkNote}
                onChange={(e) => onEditBookmarkNoteChange(e.target.value)}
                className={textareaClass}
                rows={3}
                placeholder={t('bookmarks.notePlaceholderEdit')}
              />
            </label>
            <div className="flex gap-3">
              <button type="button" onClick={onCloseEditBookmarkModal} className={secondaryButton}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={onEditBookmark} className={primaryButton}>
                {t('bookmarks.saveChanges')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteConfirmModal && !!bookmarkToDelete}
        onClose={onCloseDeleteConfirmModal}
        title={t('bookmarks.deleteTitle')}
        maxWidth="max-w-sm"
      >
        {bookmarkToDelete && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[#D1D5DB]">{t('bookmarks.deleteConfirm')}</p>
            <div className="rounded-[10px] bg-white/[0.04] px-3.5 py-3">
              <div className="text-[13px] font-medium text-[#FFB38F] font-mono tabular-nums">
                {formatTime(bookmarkToDelete.position)}
              </div>
              {bookmarkToDelete.note && (
                <div className="text-[13px] text-[#D1D5DB] mt-1">"{bookmarkToDelete.note}"</div>
              )}
            </div>
            <p className="text-xs text-[#9CA3AF]">{t('bookmarks.deleteWarning')}</p>
            <div className="flex gap-3">
              <button type="button" onClick={onCloseDeleteConfirmModal} className={secondaryButton}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={onDeleteBookmark} className={destructiveButton}>
                {t('common.delete')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default BookmarkModals;
