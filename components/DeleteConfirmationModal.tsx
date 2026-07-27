import React, { useState } from 'react';
import Modal from './Modal';
import Icon from './common/Icon';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  itemName: string;
  itemType: 'Service' | 'Client' | 'Receipt' | 'Record';
  warningText?: string;
  impactText?: string;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  itemName,
  itemType,
  warningText = "This action is permanent and cannot be undone.",
  impactText
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const requireTypedConfirmation = itemType === 'Client'; // Extra safety for client deletion if desired

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error("Delete action failed:", e);
    } finally {
      setIsDeleting(false);
      setConfirmInput('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-6">
        {/* Warning Banner */}
        <div className="p-4 bg-red-50 border-2 border-red-100 rounded-xl flex items-start gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0 text-red-600">
            <Icon name="reports" className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-red-900 tracking-tight">Permanent Deletion Warning</h4>
            <p className="text-xs text-red-700 font-medium mt-0.5 leading-relaxed">
              {warningText}
            </p>
          </div>
        </div>

        {/* Item Details Card */}
        <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">
            Target {itemType}
          </span>
          <p className="text-lg font-black text-gray-900 break-words">{itemName}</p>
          {impactText && (
            <p className="text-xs font-semibold text-gray-500 mt-2 pt-2 border-t border-gray-200/60">
              💡 {impactText}
            </p>
          )}
        </div>

        {requireTypedConfirmation && (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700">
              To confirm, type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-red-600 font-bold">DELETE</span> below:
            </label>
            <input
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm focus:bg-white focus:border-red-500 outline-none uppercase"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-5 py-2.5 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-700 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting || (requireTypedConfirmation && confirmInput.trim() !== 'DELETE')}
            className="px-6 py-3 bg-red-600 text-white rounded-lg font-black uppercase tracking-widest text-xs shadow-md shadow-red-200 hover:bg-red-700 transition transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting ? (
              <span>Deleting...</span>
            ) : (
              <>
                <span>Confirm Permanent Deletion</span>
                <span>🗑️</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteConfirmationModal;
