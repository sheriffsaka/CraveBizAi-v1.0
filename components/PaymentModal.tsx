
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Invoice } from '../types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onConfirmPayment: (totalAmountPaid: number) => void;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoice, onConfirmPayment }) => {
  // We treat the input as the NEW TOTAL PAID amount.
  const [totalPaid, setTotalPaid] = useState<number>(invoice.amountPaid || 0);
  const [percentage, setPercentage] = useState<number>(0);

  // Initialize percentage on mount
  useEffect(() => {
    if (invoice.total > 0) {
        const initialPerc = ((invoice.amountPaid || 0) / invoice.total) * 100;
        setPercentage(Number(initialPerc.toFixed(2)));
    }
  }, [invoice]);

  const handleAmountChange = (val: number) => {
    // Clamp to not exceed total (optional, but requested logic implies we want accuracy)
    const clamped = Math.max(0, val);
    setTotalPaid(clamped);
    if (invoice.total > 0) {
      setPercentage(Number(((clamped / invoice.total) * 100).toFixed(2)));
    }
  };

  const handlePercentageChange = (val: number) => {
    const clampedPerc = Math.min(100, Math.max(0, val));
    setPercentage(clampedPerc);
    const newAmount = (invoice.total * clampedPerc) / 100;
    setTotalPaid(Number(newAmount.toFixed(2)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmPayment(totalPaid);
    onClose();
  };

  const remainingBalance = invoice.total - totalPaid;
  const isSettled = remainingBalance <= 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Settlement Registry">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Invoice Value</p>
                <p className="text-sm font-black text-gray-900">₦{invoice.total.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Previous Paid</p>
                <p className="text-sm font-black text-green-600">₦{(invoice.amountPaid || 0).toLocaleString()}</p>
            </div>
        </div>

        <div className="space-y-4">
            <div>
                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Cumulative Amount Paid (₦)</label>
                <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">₦</span>
                    <input 
                        type="number" 
                        step="0.01"
                        value={totalPaid} 
                        onChange={e => handleAmountChange(Number(e.target.value))}
                        className="w-full pl-10 pr-4 py-4 border-2 border-gray-100 rounded-2xl focus:border-primary-500 outline-none font-black text-2xl transition-all"
                        placeholder="0.00"
                    />
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-600 transition-all duration-500" style={{ width: `${Math.min(100, percentage)}%` }}></div>
                </div>
                <div className="w-32 relative">
                    <input 
                        type="number" 
                        step="0.1"
                        value={percentage} 
                        onChange={e => handlePercentageChange(Number(e.target.value))}
                        className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-primary-500 outline-none font-black text-right"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                </div>
            </div>
        </div>

        <div className={`p-6 rounded-3xl border transition-all duration-300 ${isSettled ? 'bg-green-50 border-green-100' : 'bg-primary-50 border-primary-100'}`}>
            <div className="flex justify-between items-center">
                <div>
                    <h4 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isSettled ? 'text-green-600' : 'text-primary-600'}`}>
                        {isSettled ? 'Document Fully Settled' : 'Outstanding Balance'}
                    </h4>
                    <p className={`text-3xl font-black tracking-tighter ${isSettled ? 'text-green-900' : 'text-primary-900'}`}>
                        ₦{Math.max(0, remainingBalance).toLocaleString()}
                    </p>
                </div>
                {isSettled && (
                    <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg animate-bounce">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                    </div>
                )}
            </div>
        </div>

        <div className="flex justify-between items-center pt-4">
            <button type="button" onClick={onClose} className="text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-600">Discard Changes</button>
            <button type="submit" className="px-10 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-primary-700 transition-all transform active:scale-95">
                Update Records
            </button>
        </div>
      </form>
    </Modal>
  );
};

export default PaymentModal;
