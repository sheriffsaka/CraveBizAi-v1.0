
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Client } from '../types';

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveClient: (client: Client | Omit<Client, 'id'>) => void;
  client?: Client | null; // Optional client prop for editing
  companyId: string; // Added companyId prop
}

const ClientFormModal: React.FC<ClientFormModalProps> = ({ isOpen, onClose, onSaveClient, client, companyId }) => {
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // Populate form fields if a client is being edited
  useEffect(() => {
    if (client) {
      setCompanyName(client.companyName || '');
      setName(client.name || '');
      setEmail(client.email || '');
    } else {
      // Clear form if adding a new client
      setCompanyName('');
      setName('');
      setEmail('');
    }
  }, [client, isOpen]); // Reset when modal opens or client changes

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Explicit validation before processing
    if (!companyName.trim() || !name.trim() || !email.trim()) {
        console.warn("ClientForm: Submission blocked due to empty required fields.");
        return;
    }

    const payload = {
        companyId,
        companyName: companyName.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase()
    };

    if (client) {
      // Editing existing client
      onSaveClient({ ...client, ...payload });
    } else {
      // Adding new client
      onSaveClient(payload);
    }
    onClose(); // Close modal after saving
  };

  const title = client ? 'Edit Client' : 'Add New Client';
  const submitButtonText = client ? 'Save Changes' : 'Add Client';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Company Name</label>
          <input 
            type="text" 
            id="companyName" 
            value={companyName} 
            onChange={e => setCompanyName(e.target.value)} 
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900 font-medium" 
            placeholder="e.g. Acme Corp"
            required 
          />
        </div>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">Contact Person</label>
          <input 
            type="text" 
            id="name" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900" 
            placeholder="e.g. Jane Doe"
            required 
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email Address</label>
          <input 
            type="email" 
            id="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-900" 
            placeholder="jane@company.com"
            required 
          />
        </div>
        <div className="flex justify-end pt-4 space-x-2">
            <button type="button" onClick={onClose} className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 font-bold transition-all">Cancel</button>
            <button type="submit" className="px-5 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 font-bold shadow-lg shadow-primary-200 transition-all transform hover:-translate-y-0.5">{submitButtonText}</button>
        </div>
      </form>
    </Modal>
  );
};

export default ClientFormModal;
