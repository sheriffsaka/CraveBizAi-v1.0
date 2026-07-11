import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Invoice, Client } from '../types';
import { safeFlutterwaveCheckout } from '../services/subscriptionService';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onConfirmPayment: (totalAmountPaid: number) => void;
  client?: Client;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoice, onConfirmPayment, client }) => {
  const [activeTab, setActiveTab] = useState<'flutterwave' | 'manual'>('flutterwave');
  
  // Manual Settlement Form States
  const [totalPaid, setTotalPaid] = useState<number>(invoice.amountPaid || 0);
  const [percentage, setPercentage] = useState<number>(0);

  // Flutterwave Checkout States
  const outstanding = Math.max(0, invoice.total - (invoice.amountPaid || 0));
  const [checkoutAmount, setCheckoutAmount] = useState<number>(outstanding || invoice.total);

  // Sync state on invoice change
  useEffect(() => {
    if (invoice.total > 0) {
        const initialPerc = ((invoice.amountPaid || 0) / invoice.total) * 100;
        setPercentage(Number(initialPerc.toFixed(2)));
    }
    setTotalPaid(invoice.amountPaid || 0);
    const currOutstanding = Math.max(0, invoice.total - (invoice.amountPaid || 0));
    setCheckoutAmount(currOutstanding || invoice.total);
  }, [invoice]);

  const handleAmountChange = (val: number) => {
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

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmPayment(totalPaid);
    onClose();
  };

  const handleFlutterwavePayment = () => {
    if (checkoutAmount <= 0) {
      alert("Please enter a valid amount to pay.");
      return;
    }

    const flutterwaveKey = (import.meta as any).env?.VITE_FLUTTERWAVE_PUBLIC_KEY || "FLWPUBK_TEST-e5e54eb86bc8c9bc88a8d11d7c3ee7c0-X";

    safeFlutterwaveCheckout({
      public_key: flutterwaveKey,
      tx_ref: `cravebiz-tx-${Date.now()}-${invoice.id}`,
      amount: checkoutAmount,
      currency: "NGN",
      payment_options: "card, banktransfer, ussd",
      customer: {
        email: client?.email || "customer@cravebiz.ai",
        name: client?.name || "CraveBiZ Client",
      },
      customizations: {
        title: "CraveBiZ Multi-Tenant Settlement Vault",
        description: `Settlement for Invoice #${invoice.invoiceNumber}`,
        logo: "https://checkout.flutterwave.com/assets/img/flutterwave-logo.svg",
      },
      callback: function (data: any) {
        console.log("Flutterwave Success response:", data);
        if (data.status === "successful" || data.status === "completed") {
          // Calculate the new cumulative amount paid
          const newlyPaid = (invoice.amountPaid || 0) + checkoutAmount;
          onConfirmPayment(newlyPaid);
          alert(`Payment of ₦${checkoutAmount.toLocaleString()} successfully processed and verified!`);
          onClose();
        } else {
          alert(`Payment transaction response: ${data.status}. If this is an error, please try again.`);
        }
      },
      onclose: function() {
        console.log("Flutterwave payment modal dismissed");
      }
    });
  };

  const remainingBalance = invoice.total - totalPaid;
  const isSettled = remainingBalance <= 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Settlement Registry">
      {/* Tab Selectors */}
      <div className="flex border-b border-gray-100 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('flutterwave')}
          className={`flex-1 pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'flutterwave'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          ⚡ Flutterwave Checkout
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex-1 pb-4 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
            activeTab === 'manual'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          📝 Manual Registry Entry
        </button>
      </div>

      {activeTab === 'flutterwave' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Invoice Value</p>
              <p className="text-sm font-black text-gray-900">₦{invoice.total.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
              <p className="text-sm font-black text-amber-600">₦{outstanding.toLocaleString()}</p>
            </div>
          </div>

          <div className="p-5 bg-blue-50/50 border border-blue-100/70 rounded-2xl space-y-2">
            <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest">Client & Payer Info</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400 block font-bold">Company:</span>
                <span className="text-gray-800 font-bold">{client?.companyName || "N/A"}</span>
              </div>
              <div>
                <span className="text-gray-400 block font-bold">Payer Name:</span>
                <span className="text-gray-800 font-bold">{client?.name || "N/A"}</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400 block font-bold">Payer Email:</span>
                <span className="text-gray-800 font-mono font-bold break-all">{client?.email || "customer@cravebiz.ai"}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest">Payment Amount (₦)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-gray-400">₦</span>
              <input
                type="number"
                step="0.01"
                value={checkoutAmount}
                onChange={e => setCheckoutAmount(Math.max(0, Number(e.target.value)))}
                className="w-full pl-10 pr-4 py-4 border-2 border-gray-100 rounded-2xl focus:border-primary-500 outline-none font-black text-2xl transition-all"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Test Card Instructions */}
          <div className="bg-amber-50/70 border border-amber-150 p-4 rounded-2xl text-2xs text-amber-900 space-y-2">
            <p className="font-black text-[10px] uppercase tracking-wider text-amber-800">🧪 Testing Sandbox Card Credentials:</p>
            <p>Use the following details in the Flutterwave payment dialog to complete a secure test transaction:</p>
            <div className="grid grid-cols-2 gap-2 bg-white/70 p-3 rounded-xl border border-amber-100 font-mono text-3xs">
              <div>
                <span className="text-gray-400 block text-[9px] uppercase font-bold">Card Number</span>
                <span className="font-bold text-gray-800">4000 0000 0000 0012</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[9px] uppercase font-bold">Expiry / CVV</span>
                <span className="font-bold text-gray-800">12/30 &nbsp;|&nbsp; 123</span>
              </div>
              <div className="col-span-2">
                <span className="text-gray-400 block text-[9px] uppercase font-bold">Card PIN / OTP</span>
                <span className="font-bold text-gray-800">1234 &nbsp;&amp;&nbsp; 12345</span>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <button
              type="button"
              onClick={handleFlutterwavePayment}
              className="w-full py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-yellow-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl hover:opacity-95 transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <span>Pay ₦{checkoutAmount.toLocaleString()} via Flutterwave</span>
              <span className="text-sm">⚡</span>
            </button>
            <button type="button" onClick={onClose} className="w-full text-center text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-600 py-1">
              Discard Changes
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-6">
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
      )}
    </Modal>
  );
};

export default PaymentModal;
