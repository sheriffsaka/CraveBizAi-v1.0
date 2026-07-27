import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Invoice, Client, InvoiceStatus } from '../types';

export interface PaymentDetails {
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  reference?: string;
  autoGenerateReceipt?: boolean;
}

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onConfirmPayment: (newTotalPaid: number, details: PaymentDetails) => void;
  client?: Client;
}

const PAYMENT_METHODS = [
  'Bank Transfer',
  'Cash',
  'POS',
  'Mobile Money',
  'Cheque',
  'Other'
];

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  invoice,
  onConfirmPayment,
  client
}) => {
  const previouslyPaid = invoice.amountPaid || 0;
  const outstandingBalance = Math.max(0, invoice.total - previouslyPaid);

  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState<string>(() => (outstandingBalance > 0 ? outstandingBalance.toString() : '0'));
  const [paymentMethod, setPaymentMethod] = useState<string>('Bank Transfer');
  const [reference, setReference] = useState<string>('');
  const [autoGenerateReceipt, setAutoGenerateReceipt] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync modal state whenever invoice changes
  useEffect(() => {
    const currOutstanding = Math.max(0, invoice.total - (invoice.amountPaid || 0));
    setPaymentAmount(currOutstanding > 0 ? currOutstanding.toString() : '0');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setErrorMsg(null);
  }, [invoice]);

  const numericAmount = parseFloat(paymentAmount) || 0;
  const remainingAfterPayment = Math.max(0, outstandingBalance - numericAmount);
  const newCumulativePaid = previouslyPaid + numericAmount;
  const settlementPercentage = invoice.total > 0 ? Math.min(100, (newCumulativePaid / invoice.total) * 100) : 0;
  const isFullSettlement = remainingAfterPayment <= 0.001;

  const validate = (val: number): boolean => {
    if (isNaN(val) || val <= 0) {
      setErrorMsg('Payment amount must be greater than ₦0.00');
      return false;
    }
    if (val > outstandingBalance + 0.001) {
      setErrorMsg(`Payment amount cannot exceed the outstanding balance of ₦${outstandingBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}.`);
      return false;
    }
    setErrorMsg(null);
    return true;
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setPaymentAmount(rawVal);
    const val = parseFloat(rawVal);
    if (!isNaN(val)) {
      validate(val);
    } else {
      setErrorMsg('Please enter a valid monetary amount');
    }
  };

  const handleQuickFill = (amount: number) => {
    const clamped = Math.min(outstandingBalance, Math.max(0, Number(amount.toFixed(2))));
    setPaymentAmount(clamped.toString());
    validate(clamped);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate(numericAmount)) return;

    const details: PaymentDetails = {
      paymentDate: paymentDate || new Date().toISOString().split('T')[0],
      amount: numericAmount,
      paymentMethod,
      reference: reference.trim(),
      autoGenerateReceipt
    };

    onConfirmPayment(Number(newCumulativePaid.toFixed(2)), details);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Manual Payment Entry">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Invoice Summary Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-5 rounded-2xl text-white shadow-md">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary-400">Invoice Reference</p>
              <h3 className="text-xl font-black text-white tracking-tight">#{invoice.invoiceNumber}</h3>
              <p className="text-xs text-gray-300 font-medium mt-0.5">{client?.companyName || client?.name || 'Client Document'}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Total Invoice Value</span>
              <span className="text-lg font-black text-white">₦{invoice.total.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-700/60 text-xs">
            <div>
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Previously Paid</span>
              <span className="text-emerald-400 font-black text-sm">₦{previouslyPaid.toLocaleString()}</span>
            </div>
            <div className="text-right">
              <span className="text-gray-400 text-[10px] font-bold uppercase tracking-wider block">Current Outstanding Balance</span>
              <span className="text-amber-400 font-black text-sm">₦{outstandingBalance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Input Fields Grid */}
        <div className="space-y-4">
          {/* Payment Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:bg-white focus:border-primary-500 outline-none font-bold text-sm text-gray-800 transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:bg-white focus:border-primary-500 outline-none font-bold text-sm text-gray-800 transition cursor-pointer"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount Paid Input & Quick Action Chips */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">
                Amount Paid (₦) <span className="text-red-500">*</span>
              </label>
              <span className="text-2xs font-bold text-gray-400">
                Max: ₦{outstandingBalance.toLocaleString()}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400 text-xl">₦</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={outstandingBalance}
                value={paymentAmount}
                onChange={handleAmountChange}
                placeholder="0.00"
                className={`w-full pl-10 pr-4 py-3.5 border-2 rounded-2xl outline-none font-black text-2xl transition ${
                  errorMsg
                    ? 'border-red-300 bg-red-50/30 text-red-900 focus:border-red-500'
                    : 'border-gray-100 bg-gray-50 focus:bg-white focus:border-primary-500 text-gray-900'
                }`}
              />
            </div>

            {/* Quick Fill Buttons */}
            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => handleQuickFill(outstandingBalance)}
                className="px-3 py-1 bg-primary-50 text-primary-700 hover:bg-primary-100 border border-primary-200 rounded-lg text-xs font-bold transition"
              >
                Pay Full Balance (₦{outstandingBalance.toLocaleString()})
              </button>
              {outstandingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => handleQuickFill(outstandingBalance / 2)}
                  className="px-3 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 rounded-lg text-xs font-bold transition"
                >
                  50% Balance
                </button>
              )}
            </div>

            {/* Validation Error Message */}
            {errorMsg && (
              <div className="flex items-center gap-2 mt-2 text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                <span>⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Payment Reference / Note */}
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">
              Reference / Transaction Note <span className="text-gray-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Bank Ref #123456, Cheque #004, Transfer Memo"
              className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:bg-white focus:border-primary-500 outline-none font-medium text-sm text-gray-800 transition"
            />
          </div>

          {/* Auto Receipt Generation Checkbox */}
          <div className="p-4 bg-primary-50/50 rounded-xl border border-primary-100 flex items-center justify-between cursor-pointer" onClick={() => setAutoGenerateReceipt(!autoGenerateReceipt)}>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoReceipt"
                checked={autoGenerateReceipt}
                onChange={(e) => setAutoGenerateReceipt(e.target.checked)}
                className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500 cursor-pointer"
              />
              <label htmlFor="autoReceipt" className="text-xs font-bold text-gray-800 cursor-pointer">
                Automatically generate payment receipt after recording
              </label>
            </div>
            <span className="text-sm">🧾</span>
          </div>
        </div>

        {/* Live Calculation & Status Preview Box */}
        <div className={`p-5 rounded-2xl border transition ${isFullSettlement ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50/70 border-amber-200'}`}>
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest block mb-0.5 ${isFullSettlement ? 'text-emerald-700' : 'text-amber-700'}`}>
                {isFullSettlement ? 'Status After Payment: Fully Settled' : 'Status After Payment: Partially Settled'}
              </span>
              <p className={`text-2xl font-black tracking-tight ${isFullSettlement ? 'text-emerald-900' : 'text-amber-900'}`}>
                ₦{remainingAfterPayment.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xs font-medium text-gray-500">Remaining</span>
              </p>
            </div>
            <div className="text-right">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isFullSettlement ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'}`}>
                {isFullSettlement ? InvoiceStatus.Paid : InvoiceStatus.PartiallyPaid}
              </span>
            </div>
          </div>

          {/* Settlement Progress Bar */}
          <div className="w-full bg-gray-200/80 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${isFullSettlement ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${settlementPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] font-bold text-gray-500 mt-1">
            <span>Settlement: {settlementPercentage.toFixed(1)}%</span>
            <span>New Paid Total: ₦{newCumulativePaid.toLocaleString()}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-700 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!errorMsg || numericAmount <= 0}
            className="px-8 py-3.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary-200 hover:bg-primary-700 transition transform active:scale-95 disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span>Confirm & Record Payment</span>
            <span>✓</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PaymentModal;
