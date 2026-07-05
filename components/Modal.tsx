
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/55 z-50 flex justify-center items-start overflow-y-auto p-4 sm:p-6 md:p-10" 
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div 
        className="bg-white rounded-[2rem] shadow-2xl p-6 md:p-8 w-full max-w-lg my-auto transform transition-all border border-gray-100 flex flex-col max-h-full sm:max-h-[90vh]" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-100 shrink-0">
          <h3 className="text-base md:text-lg font-black text-gray-900 uppercase tracking-tighter">{title}</h3>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-600 text-3xl font-normal leading-none p-1 transition-colors"
            aria-label="Close modal"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto pr-1 flex-1 min-h-0 scrollbar-thin">{children}</div>
      </div>
    </div>
  );
};

export default Modal;