import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { User } from '../types';
import { supabase, api } from '../lib/api';
import { getSubscriptionInfo } from '../services/subscriptionService';
import Icon from './common/Icon';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User; // Current user data
  onUpdateProfile: (updatedUser: Partial<User>) => void;
}

const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose, user, onUpdateProfile }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [error, setError] = useState<string | null>(null);

  // Live database metrics state
  const [invoicesCreated, setInvoicesCreated] = useState<number | null>(null);
  const [receiptsCreated, setReceiptsCreated] = useState<number | null>(null);
  const [remainingAiCredits, setRemainingAiCredits] = useState<number | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user, isOpen]); // Reset form when modal opens or user prop changes

  useEffect(() => {
    const fetchUserUsage = async () => {
      if (!isOpen || !user?.id) return;
      setIsLoadingUsage(true);
      try {
        const activeTenantId = localStorage.getItem('cravebiz_tenant') || '';

        // Fetch canonical AI credits directly from Supabase via backend API
        try {
          const headers = await api.getAuthHeaders(activeTenantId);
          const creditsRes = await fetch('/api/ai/credits', { headers });
          if (creditsRes.ok) {
            const creditsData = await creditsRes.json();
            if (typeof creditsData.remainingCredits === 'number') {
              setRemainingAiCredits(creditsData.remainingCredits);
            }
          }
        } catch (cErr) {
          console.warn("Could not fetch AI credits in UserProfileModal:", cErr);
        }

        // Fetch invoices and receipts count directly from Supabase invoices table as canonical truth
        if (activeTenantId) {
          const [{ count: invCount }, { count: recCount }] = await Promise.all([
            supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', activeTenantId),
            supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', activeTenantId).eq('is_receipt_sent', true)
          ]);
          setInvoicesCreated(invCount ?? 0);
          setReceiptsCreated(recCount ?? 0);
        } else {
          const sub = getSubscriptionInfo('');
          setInvoicesCreated(sub.invoiceCount || 0);
          setReceiptsCreated(sub.receiptCount || 0);
        }
      } catch (err) {
        console.error("Failed to load user usage from Supabase:", err);
      } finally {
        setIsLoadingUsage(false);
      }
    };

    fetchUserUsage();

    const handleSubChange = () => {
      const activeTenantId = localStorage.getItem('cravebiz_tenant') || '';
      if (activeTenantId) {
        const sub = getSubscriptionInfo(activeTenantId);
        setRemainingAiCredits(sub.aiUnits);
        setInvoicesCreated(sub.invoiceCount || 0);
        setReceiptsCreated(sub.receiptCount || 0);
      }
    };
    window.addEventListener('cravebiz_subscription_change', handleSubChange);
    return () => window.removeEventListener('cravebiz_subscription_change', handleSubChange);
  }, [user?.id, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('Name and Email cannot be empty.');
      return;
    }
    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    onUpdateProfile({ name, email });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Your Profile">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}
        
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Full Name</label>
            <input type="text" id="profile-name" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 font-bold focus:ring-2 focus:ring-primary-500 outline-none" required />
          </div>
          <div>
            <label htmlFor="profile-email" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Email Address</label>
            <input type="email" id="profile-email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-900 font-bold focus:ring-2 focus:ring-primary-500 outline-none" required />
          </div>
        </div>

        {/* Database User Usage Display Section */}
        <div className="border-t border-gray-100 pt-6">
          <h4 className="text-xs font-black text-gray-800 uppercase tracking-widest mb-4">Your Usage Summary</h4>
          
          {isLoadingUsage ? (
            <div className="flex justify-center py-4">
              <span className="text-xs font-black text-primary-600 uppercase tracking-widest animate-pulse">Fetching usage live from the system...</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-primary-50/40 border border-primary-50 p-4 rounded-2xl flex flex-col items-center text-center">
                <Icon name="file-text" className="w-5 h-5 text-primary-600 mb-1.5" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Invoices</span>
                <span className="text-lg font-black text-primary-700 mt-1">{invoicesCreated ?? 0}</span>
              </div>
              
              <div className="bg-emerald-50/40 border border-emerald-50 p-4 rounded-2xl flex flex-col items-center text-center">
                <Icon name="check-square" className="w-5 h-5 text-emerald-600 mb-1.5" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">Receipts</span>
                <span className="text-lg font-black text-emerald-700 mt-1">{receiptsCreated ?? 0}</span>
              </div>
              
              <div className="bg-indigo-50/40 border border-indigo-50 p-4 rounded-2xl flex flex-col items-center text-center">
                <Icon name="zap" className="w-5 h-5 text-indigo-600 mb-1.5" />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-wider">AI Credits</span>
                <span className="text-lg font-black text-indigo-700 mt-1">{remainingAiCredits ?? 0}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 space-x-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-xl shadow-lg transition-all">Save Changes</button>
        </div>
      </form>
    </Modal>
  );
};

export default UserProfileModal;
