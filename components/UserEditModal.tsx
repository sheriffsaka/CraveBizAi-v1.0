
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { User, Company } from '../types';

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User; // The user to be edited
  companies: Company[]; // All companies for tenant selection
  onUpdateUser: (updatedUser: User) => void;
  onDeleteUser: (userId: string) => void;
  onResendVerificationCode: (email: string) => 'success' | 'not_found' | 'already_active';
}

const UserEditModal: React.FC<UserEditModalProps> = ({
  isOpen,
  onClose,
  user,
  companies,
  onUpdateUser,
  onDeleteUser,
  onResendVerificationCode,
}) => {
  const [formData, setFormData] = useState<User>({ ...user, tenantIds: user.tenantIds || [] });
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);

  useEffect(() => {
    setFormData({ ...user, tenantIds: user.tenantIds || [] });
    setMessage(null);
    setIsError(false);
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { id, value, type, checked } = e.target as HTMLInputElement;
    setFormData((prev) => ({
      ...prev,
      [id]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleTenantIdsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // FIX: Explicitly type the 'option' parameter to HTMLOptionElement to resolve TypeScript error.
    const selectedOptions = Array.from(e.target.selectedOptions).map((option: HTMLOptionElement) => option.value);
    setFormData(prev => ({ ...prev, tenantIds: selectedOptions }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || formData.tenantIds.length === 0) {
      setMessage('Name, email, and at least one company affiliation are required.');
      setIsError(true);
      return;
    }
    onUpdateUser(formData);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete user "${user.name}"? This action cannot be undone.`)) {
      onDeleteUser(user.id);
    }
  };

  const handleResend = () => {
    setIsLoadingResend(true);
    setMessage(null);
    setIsError(false);
    setTimeout(() => { // Simulate API call
        const result = onResendVerificationCode(user.email);
        if (result === 'success') {
            setMessage('Verification code resent successfully!');
            setIsError(false);
        } else {
            setMessage(`Failed to resend code: ${result === 'already_active' ? 'Account is already active.' : 'User not found or other error.'}`);
            setIsError(true);
        }
        setIsLoadingResend(false);
    }, 1000);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${user.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {message && (
          <div className={`p-3 rounded-md text-sm ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`} role="status">
            {message}
          </div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Full Name</label>
          <input type="text" id="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
          <input type="email" id="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700">Status</label>
          <select id="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md border bg-white text-gray-900">
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Declined">Declined</option>
          </select>
        </div>
        {formData.status === 'Pending' && (
            <div className="flex justify-end">
                <button 
                    type="button" 
                    onClick={handleResend} 
                    className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm disabled:opacity-50"
                    disabled={isLoadingResend}
                >
                    {isLoadingResend ? 'Sending...' : 'Resend Verification Code'}
                </button>
            </div>
        )}
        <div className="flex items-center">
          <input type="checkbox" id="isAdmin" checked={formData.isAdmin} onChange={handleChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
          <label htmlFor="isAdmin" className="ml-2 block text-sm text-gray-900">Is Admin</label>
        </div>
        <div>
          <label htmlFor="tenantIds" className="block text-sm font-medium text-gray-700">Companies (Multi-select)</label>
          <select
            id="tenantIds"
            multiple
            value={formData.tenantIds}
            onChange={handleTenantIdsChange}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900 h-32"
          >
            {companies.map(company => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">Hold Ctrl (Windows) or Cmd (Mac) to select multiple companies.</p>
        </div>
        <div className="flex justify-between items-center pt-4 border-t">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow"
          >
            Delete User
          </button>
          <div className="flex space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save Changes</button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

export default UserEditModal;
