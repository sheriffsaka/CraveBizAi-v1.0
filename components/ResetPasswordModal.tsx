

import React, { useState } from 'react';
import Modal from './Modal';
import Icon from './common/Icon';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  token: string; // The simulated reset token
  onResetPassword: (email: string, newPassword: string, token: string) => boolean;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ isOpen, onClose, email, token, onResetPassword }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    setIsLoading(true);

    if (!newPassword || !confirmPassword) {
      setMessage('Please fill in both password fields.');
      setIsError(true);
      setIsLoading(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      setIsError(true);
      setIsLoading(false);
      return;
    }
    if (newPassword.length < 6) {
        setMessage('Password must be at least 6 characters long.');
        setIsError(true);
        setIsLoading(false);
        return;
    }

    setTimeout(() => { // Simulate API call
      const success = onResetPassword(email, newPassword, token);
      if (success) {
        setMessage('Your password has been reset successfully!');
        setIsError(false);
        setNewPassword('');
        setConfirmPassword('');
        onClose(); // Close modal on success
      } else {
        setMessage('Failed to reset password. The reset link might be invalid or expired.');
        setIsError(true);
      }
      setIsLoading(false);
    }, 1500);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reset Your Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Enter your new password for <span className="font-semibold">{email}</span>.
        </p>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">New Password</label>
          <div className="relative mt-1">
            <input 
                id="new-password" 
                type={showNewPassword ? 'text' : 'password'} 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 pr-10"
                required 
                disabled={isLoading}
            />
            <button 
                type="button" 
                onClick={() => setShowNewPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
            >
                <Icon name={showNewPassword ? 'eye-off' : 'eye'} className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
          <div className="relative mt-1">
            <input 
                id="confirm-password" 
                type={showConfirmPassword ? 'text' : 'password'} 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 pr-10"
                required 
                disabled={isLoading}
            />
            <button 
                type="button" 
                onClick={() => setShowConfirmPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
            >
                <Icon name={showConfirmPassword ? 'eye-off' : 'eye'} className="w-5 h-5" />
            </button>
          </div>
        </div>
        {message && (
          <div className={`p-3 rounded-md text-sm ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`} role="status">
            {message}
          </div>
        )}
        <div className="flex justify-end pt-4 space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300" disabled={isLoading}>Cancel</button>
            <button 
              type="submit" 
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold disabled:bg-gray-400" 
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                    <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Resetting...
                </div>
              ) : "Reset Password"}
            </button>
        </div>
      </form>
    </Modal>
  );
};

export default ResetPasswordModal;