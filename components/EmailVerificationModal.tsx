
import React, { useState, useEffect } from 'react';
import Modal from './Modal';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string | null;
  onVerify: (email: string, code: string) => Promise<'success' | 'invalid_code' | 'already_active' | 'not_found'> | 'success' | 'invalid_code' | 'already_active' | 'not_found';
  onResend: (email: string) => Promise<'success' | 'not_found' | 'already_active'> | 'success' | 'not_found' | 'already_active';
  onDemoBypass?: () => void;
}

const EmailVerificationModal: React.FC<EmailVerificationModalProps> = ({ isOpen, onClose, email, onVerify, onResend, onDemoBypass }) => {
  const [code, setCode] = useState('');
  const [currentEmail, setCurrentEmail] = useState(email || '');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (email !== null) {
      setCurrentEmail(email);
    } else {
      setCurrentEmail('');
    }
    setMessage(null);
    setIsError(false);
    setResendCooldown(0);
  }, [email, isOpen]);

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    setIsLoading(true);

    if (!currentEmail.trim() || !code.trim()) {
      setMessage('Please enter both email and verification code.');
      setIsError(true);
      setIsLoading(false);
      return;
    }

    try {
      const result = await onVerify(currentEmail, code);
      if (result === 'success') {
        setMessage('Email verified successfully!');
        setIsError(false);
      } else {
        setMessage('Invalid code. For testing, use the code 123456.');
        setIsError(true);
      }
    } catch (error) {
        setMessage('Verification error. Use magic code 123456.');
        setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    setMessage(null);
    setIsError(false);
    setIsLoading(true);
    try {
      const result = await onResend(currentEmail);
      if (result === 'success') {
        setMessage('A new code was requested. Check your inbox.');
        setIsError(false);
        setResendCooldown(60);
      } else {
        setMessage('Could not resend. Try the magic code 123456.');
        setIsError(true);
      }
    } catch (error) {
        setIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
      if (onDemoBypass) {
          onDemoBypass();
      } else {
          onClose();
      }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Verify Your Email">
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
           <p className="text-sm text-blue-800 font-medium">
             Testing? Use the magic code <span className="font-bold underline">123456</span> to verify instantly.
           </p>
        </div>

        <p className="text-sm text-gray-600">
          A verification code was sent to <span className="font-semibold">{currentEmail || 'your email'}</span>. 
          Please enter it below to activate your account.
        </p>
        
        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <div>
            <label htmlFor="verification-code" className="block text-sm font-medium text-gray-700">Verification Code</label>
            <input 
              type="text" 
              id="verification-code" 
              value={code} 
              onChange={e => setCode(e.target.value)} 
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" 
              placeholder="123456"
              required 
              maxLength={6}
              disabled={isLoading}
            />
          </div>

          {message && (
            <div className={`p-3 rounded-md text-sm ${isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {message}
            </div>
          )}

          <div className="flex flex-col space-y-3 pt-2">
              <button 
                type="submit" 
                className="w-full py-3 bg-primary-600 text-white rounded-lg font-bold hover:bg-primary-700 shadow-lg disabled:bg-gray-400" 
                disabled={isLoading}
              >
                {isLoading ? "Verifying..." : "Verify Account"}
              </button>
              
              <div className="flex justify-between items-center text-xs">
                  <button 
                    type="button" 
                    onClick={handleResendCode} 
                    className="text-gray-500 hover:text-primary-600 underline disabled:opacity-50" 
                    disabled={isLoading || resendCooldown > 0}
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Email'}
                  </button>
                  <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-dashed border-gray-200 text-center">
          <p className="text-xs text-gray-400 mb-3 uppercase tracking-widest font-bold">Alternative Access</p>
          <button 
            onClick={handleSkip}
            className="w-full py-3 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-bold hover:bg-amber-100 transition-colors shadow-sm"
          >
            Skip Verification & Proceed
          </button>
          <p className="mt-2 text-[10px] text-gray-400">Note: Some features may be limited until verified.</p>
        </div>
      </div>
    </Modal>
  );
};

export default EmailVerificationModal;
