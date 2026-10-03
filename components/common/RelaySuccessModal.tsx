import React, { useEffect } from 'react';
import { CheckCircle2, ArrowRight, X, Send } from 'lucide-react';

interface RelaySuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceNumber: string;
  clientName?: string;
  isUpdate?: boolean;
  onViewInvoice?: () => void;
}

export const RelaySuccessModal: React.FC<RelaySuccessModalProps> = ({
  isOpen,
  onClose,
  invoiceNumber,
  clientName,
  isUpdate = false,
  onViewInvoice
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      onClose();
    }, 7000);
    return () => clearTimeout(timer);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-emerald-100 max-w-md w-full p-6 sm:p-8 relative animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="relay-modal-title"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
          title="Close notification"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          {/* Animated Success Badge */}
          <div className="w-16 h-16 rounded-full bg-emerald-100 border-4 border-emerald-50 flex items-center justify-center mb-5 shadow-inner">
            <CheckCircle2 className="w-9 h-9 text-emerald-600 animate-in zoom-in-50 duration-300" />
          </div>

          {/* Title */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black uppercase tracking-wider mb-2">
            <Send className="w-3.5 h-3.5" />
            <span>Relay Confirmation</span>
          </div>

          <h2 id="relay-modal-title" className="text-2xl font-black text-gray-900 tracking-tight mb-2">
            {isUpdate ? 'Invoice Updated & Relayed!' : 'Invoice Saved & Relayed!'}
          </h2>

          <p className="text-sm text-gray-600 font-medium leading-relaxed max-w-sm mb-6">
            Invoice <span className="font-black text-gray-900 font-mono">#{invoiceNumber}</span> has been officially recorded in your vault and successfully relayed{clientName ? <> to <span className="font-bold text-gray-900">{clientName}</span></> : ''}.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            {onViewInvoice && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewInvoice();
                }}
                className="flex-1 py-3 px-5 bg-primary-600 hover:bg-primary-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-primary-500/20 transition-all flex items-center justify-center gap-2"
              >
                <span>View Invoice</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelaySuccessModal;
