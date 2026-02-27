

import React, { useState } from 'react';
import Modal from './Modal';
import { User } from '../types';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[]; // Mock user data to check email existence
  onStartPasswordReset: (email: string, token: string) => void; // New: Callback to initiate password reset flow
}

const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose, users, onStartPasswordReset }) => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Helper to generate a simple reset token
  const generateResetToken = () => Math.random().toString(36).substring(2, 15) + Date.now();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    setIsLoading(true);

    if (!email.trim()) {
      setMessage('Please enter your email address.');
      setIsError(true);
      setIsLoading(false);
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        setMessage('Please enter a valid email address.');
        setIsError(true);
        setIsLoading(false);
        return;
    }

    // Simulate API call
    setTimeout(() => {
      const userIndex = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
      
      if (userIndex !== -1) {
        // Simulate sending a reset link with a token
        const resetToken = generateResetToken();
        // In a real app, you'd store this token in the user record in the backend
        // and then send an email. For this mock, we directly call onStartPasswordReset.
        console.log(`[MOCK EMAIL SENT] To: ${email}, Subject: Password Reset Request. Token: ${resetToken}`);
        
        // Directly trigger the reset password modal in App.tsx for this mock.
        onStartPasswordReset(email, resetToken);
        setMessage('If an account with that email exists, a password reset link has been sent to your email.');
        setIsError(false);
        setEmail(''); // Clear email input on success
        // Close this modal, the reset password modal will open instead
        onClose(); 

      } else {
        // For security, often say same message even if email doesn't exist
        setMessage('If an account with that email exists, a password reset link has been sent to your email.');
        setIsError(false);
      }
      setIsLoading(false);
    }, 1500); // Simulate network delay
  };

  const handleClose = () => {
    setEmail('');
    setMessage(null);
    setIsError(false);
    setIsLoading(false);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Forgot Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">
          Enter your email address below and we'll send you a link to reset your password.
        </p>
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-gray-700">Email Address</label>
          <input 
            type="email" 
            id="forgot-email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" 
            required 
            disabled={isLoading}
          />
        </div>
        {message && (
          <div className={`p-3 rounded-md text-sm ${isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`} role="status">
            {message}
          </div>
        )}
        <div className="flex justify-end pt-4 space-x-2">
            <button type="button" onClick={handleClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300" disabled={isLoading}>Cancel</button>
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
                    Sending...
                </div>
              ) : "Reset Password"}
            </button>
        </div>
      </form>
    </Modal>
  );
};

export default ForgotPasswordModal;