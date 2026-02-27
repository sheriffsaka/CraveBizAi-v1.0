

import React, { useState } from 'react';
import Modal from './Modal';

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInviteUser: (name: string, email: string) => void; // Prop type updated
}

const InviteUserModal: React.FC<InviteUserModalProps> = ({ isOpen, onClose, onInviteUser }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim()) {
      setError('Please fill in both name and email.');
      return;
    }
    // Basic email validation
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    onInviteUser(name, email); // This now calls `inviteUserToActiveTenant` in App.tsx
    setName('');
    setEmail('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite New Team Member">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>}
        <div>
          <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700">Full Name</label>
          <input type="text" id="invite-name" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700">Email Address</label>
          <input type="email" id="invite-email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" required />
        </div>
        <div className="flex justify-end pt-4 space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Invite Member</button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteUserModal;
