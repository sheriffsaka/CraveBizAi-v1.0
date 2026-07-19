
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { User } from '../types';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onUpdateUser: (userId: string, details: Partial<User>) => Promise<void>;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ isOpen, onClose, user, onUpdateUser }) => {
  const [formData, setFormData] = useState<Partial<User>>({
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    status: user.status,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFormData({
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      status: user.status,
    });
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value, type } = e.target;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData(prev => ({ ...prev, [id]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await onUpdateUser(user.id, formData);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update user.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Edit User: ${user.name}`}>
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Full Name</label>
            <input 
              type="text" 
              id="name" 
              value={formData.name} 
              onChange={handleChange} 
              className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-primary-500 outline-none font-medium" 
              required
            />
          </div>
          
          <div>
            <label htmlFor="email" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Email Address</label>
            <input 
              type="email" 
              id="email" 
              value={formData.email || ''} 
              onChange={handleChange} 
              className={`w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-primary-500 outline-none font-medium ${user.email ? 'bg-gray-50' : ''}`} 
              disabled={!!user.email}
            />
            {!user.email ? (
              <p className="mt-1 text-[10px] text-gray-400">Add an email address to this user profile for easy identification and super admin access.</p>
            ) : (
              <p className="mt-1 text-[10px] text-gray-400">Email cannot be changed for security reasons.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="status" className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-1">Status</label>
              <select 
                id="status" 
                value={formData.status} 
                onChange={handleChange}
                className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-primary-500 outline-none font-medium"
              >
                <option value="Pending">Pending</option>
                <option value="Active">Active</option>
                <option value="Declined">Declined</option>
              </select>
            </div>
            
            <div className="flex items-center pt-6">
              <label className="flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  id="isAdmin" 
                  checked={formData.isAdmin} 
                  onChange={handleChange}
                  className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="ml-2 text-sm font-bold text-gray-700">Super Admin Access</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <button type="button" onClick={onClose} className="text-gray-400 font-black uppercase tracking-widest text-[10px] hover:text-gray-600">Cancel</button>
          <button 
            type="submit" 
            disabled={isLoading}
            className="px-10 py-4 bg-primary-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl hover:bg-primary-700 transition-all transform active:scale-95 disabled:bg-gray-300"
          >
            {isLoading ? 'Updating...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default EditUserModal;
