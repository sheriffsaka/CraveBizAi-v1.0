
import React, { useState, useEffect, useRef } from 'react';
import { Company, BankAccount, User } from '../types';
import ImageCropperModal from './ImageCropperModal';
import Icon from './common/Icon';

interface SettingsProps {
  company: Company | null;
  onSaveChanges: (companyId: string, updatedDetails: Partial<Omit<Company, 'id'>>) => void;
  onInviteUser: () => void; 
  users: User[];
  activeTenantId: string;
  onUpdateUserStatus: (userId: string, status: 'Active' | 'Declined') => void;
  onResendInvite: (userId: string) => void;
}

interface BankAccountsManagerProps {
  companyId: string;
  bankAccounts: BankAccount[];
  onUpdateBankAccounts: (updatedAccounts: BankAccount[]) => void;
}

const BankAccountsManager: React.FC<BankAccountsManagerProps> = ({ companyId, bankAccounts, onUpdateBankAccounts }) => {
  const [newBankName, setNewBankName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBankName.trim() || !newAccountName.trim() || !newAccountNumber.trim()) {
      alert('Incomplete Routing Data: All bank fields are mandatory.');
      return;
    }
    const newAccount: BankAccount = {
      id: `bank-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      companyId: companyId,
      bankName: newBankName.trim(),
      accountName: newAccountName.trim(),
      accountNumber: newAccountNumber.trim(),
    };
    onUpdateBankAccounts([...bankAccounts, newAccount]);
    setNewBankName('');
    setNewAccountName('');
    setNewAccountNumber('');
  };

  const handleRemoveAccount = (id: string) => {
    if (confirm("Remove this settlement route? This will affect future invoice generation defaults.")) {
        onUpdateBankAccounts(bankAccounts.filter(account => account.id !== id));
    }
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-2xl border border-gray-100">
      <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Settlement Routes</h3>
      
      {bankAccounts && bankAccounts.length > 0 ? (
        <ul className="space-y-4 mb-8">
          {bankAccounts.map(account => (
            <li key={account.id} className="flex justify-between items-center p-5 bg-gray-50 rounded-2xl border border-gray-100 group">
              <div>
                <p className="font-black text-gray-900 uppercase text-xs tracking-wider">{account.bankName}</p>
                <p className="text-sm font-medium text-gray-600 mt-1">{account.accountName}</p>
                <p className="text-xs font-black text-primary-600 mt-1 tracking-widest">{account.accountNumber}</p>
              </div>
              <button
                onClick={() => handleRemoveAccount(account.id)}
                className="p-3 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-10 px-6 border-2 border-dashed border-gray-100 rounded-3xl text-center mb-8">
            <p className="text-sm font-bold text-gray-400">No settlement routes configured. Add your bank details below.</p>
        </div>
      )}

      <form onSubmit={handleAddAccount} className="space-y-6 bg-primary-50/30 p-6 rounded-3xl border border-primary-50">
        <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-widest">Provision New Account</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="bankName" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Bank Name</label>
              <input type="text" id="bankName" value={newBankName} onChange={e => setNewBankName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="e.g. Zenith Bank" />
            </div>
            <div>
              <label htmlFor="accountName" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Account Name</label>
              <input type="text" id="accountName" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="Beneficiary Name" />
            </div>
            <div>
              <label htmlFor="accountNumber" className="block text-[10px] font-black text-gray-500 uppercase mb-1">Account No.</label>
              <input type="text" id="accountNumber" value={newAccountNumber} onChange={e => setNewAccountNumber(e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-white text-sm font-bold" placeholder="10 Digits" />
            </div>
        </div>
        <div className="flex justify-end">
          <button type="submit" className="px-8 py-3 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg hover:bg-primary-700 transition-all">Add To Registry</button>
        </div>
      </form>
    </div>
  );
};

const Settings: React.FC<SettingsProps> = ({ company, onSaveChanges, onInviteUser, users, activeTenantId, onUpdateUserStatus, onResendInvite }) => {
  const [formData, setFormData] = useState<Company>(company || { id: '', name: '', address: '', email: '', bankAccounts: [] });
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCropperModalOpen, setIsCropperModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (company) setFormData(company);
  }, [company]);

  if (!company) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleUpdateBankAccounts = (updatedAccounts: BankAccount[]) => {
    setFormData(prev => ({ ...prev, bankAccounts: updatedAccounts }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageToCrop(event.target.result as string);
          setIsCropperModalOpen(true);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCroppedImage = (base64Image: string) => {
    setFormData(prev => ({ ...prev, logoUrl: base64Image }));
    setIsCropperModalOpen(false);
    setImageToCrop(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveLogo = () => setFormData(prev => ({ ...prev, logoUrl: undefined }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
        await onSaveChanges(company.id, formData);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
        alert("Failed to synchronize settings.");
    } finally {
        setIsSaving(false);
    }
  };

  const tenantUsers = users.filter(user => user.tenantIds.includes(activeTenantId));
  const currentTeamMembers = tenantUsers.filter(user => user.status === 'Active');
  const pendingInvites = tenantUsers.filter(user => user.status === 'Pending');

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div className="flex justify-between items-end">
        <div>
            <h1 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Workspace Config</h1>
            <p className="text-gray-500 mt-1 font-medium">Manage company identity and financial routing.</p>
        </div>
        <button 
            onClick={handleSubmit} 
            disabled={isSaving}
            className="px-8 py-3 bg-gray-900 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-black transition-all transform hover:-translate-y-1 active:scale-95 disabled:bg-gray-400"
        >
            {isSaving ? 'Syncing...' : 'Sync Settings'}
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Identity Profile</h3>
        <form className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label htmlFor="name" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Trading Name</label>
                    <input type="text" id="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold" />
                </div>
                 <div>
                    <label htmlFor="email" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Financial Email</label>
                    <input type="email" id="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold" />
                </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div>
                    <label htmlFor="phone" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Contact Phone</label>
                    <input type="tel" id="phone" value={formData.phone || ''} onChange={handleChange} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-bold" />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Corporate Assets</label>
                    <div className="flex items-center space-x-4">
                        {formData.logoUrl ? (
                            <div className="relative w-16 h-16 border rounded-2xl overflow-hidden flex-shrink-0 bg-white p-2">
                                <img src={formData.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                                <button type="button" onClick={handleRemoveLogo} className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full text-[8px]">&times;</button>
                            </div>
                        ) : (
                            <div className="w-16 h-16 border border-dashed border-gray-300 rounded-2xl flex items-center justify-center text-[8px] font-black text-gray-400 uppercase tracking-widest text-center px-2">No Logo</div>
                        )}
                        <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileInputRef} className="text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer" />
                    </div>
                </div>
            </div>
            <div>
                <label htmlFor="address" className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Physical Address</label>
                <textarea id="address" rows={3} className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50 text-sm font-medium" value={formData.address} onChange={handleChange}></textarea>
            </div>
        </form>
      </div>

      <BankAccountsManager
        companyId={company.id}
        bankAccounts={formData.bankAccounts || []}
        onUpdateBankAccounts={handleUpdateBankAccounts}
      />

      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border border-gray-100">
        <h3 className="text-xl font-black text-gray-800 border-b pb-4 mb-6 uppercase tracking-tighter">Permissions Registry</h3>
        <div className="flex justify-end mb-6">
            <button onClick={onInviteUser} className="px-6 py-2.5 bg-primary-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-primary-700">Grant Access</button>
        </div>
        
        <div className="space-y-4">
            {currentTeamMembers.map(user => (
                <div key={user.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div>
                        <p className="font-black text-gray-900 text-xs uppercase tracking-tight">{user.name} {user.isAdmin && <span className="text-primary-600 ml-2 font-black">(SYS_ADMIN)</span>}</p>
                        <p className="text-xs text-gray-400 font-bold">{user.email}</p>
                    </div>
                    <span className="text-[10px] font-black text-green-600 uppercase tracking-widest bg-green-50 px-3 py-1 rounded-full border border-green-100">Active</span>
                </div>
            ))}
        </div>
      </div>

      {isCropperModalOpen && imageToCrop && (
        <ImageCropperModal isOpen={isCropperModalOpen} onClose={() => setIsCropperModalOpen(false)} imageSrc={imageToCrop} onCrop={handleCroppedImage} />
      )}
    </div>
  );
};

export default Settings;
