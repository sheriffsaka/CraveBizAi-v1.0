
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Service } from '../types';

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveService: (service: Service | Omit<Service, 'id'>) => void;
  service?: Service | null; // Optional service prop for editing
  companyId: string; // Added companyId prop
}

const ServiceFormModal: React.FC<ServiceFormModalProps> = ({ isOpen, onClose, onSaveService, service, companyId }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState('');
    const [price, setPrice] = useState(0);
    const [description, setDescription] = useState('');

    // Populate form fields if a service is being edited
    useEffect(() => {
        if (service) {
            setName(service.name);
            setCategory(service.category);
            setPrice(service.price);
            setDescription(service.description);
        } else {
            // Clear form if adding a new service
            setName('');
            setCategory('');
            setPrice(0);
            setDescription('');
        }
    }, [service, isOpen]); // Reset when modal opens or service changes

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || price <= 0) return;
    
    if (service) {
        // Editing existing service
        onSaveService({ ...service, name, category, price, description });
    } else {
        // Adding new service, now correctly including companyId
        onSaveService({ companyId, name, category, price, description });
    }
    onClose(); // Close modal after saving
  };

  const title = service ? 'Edit Service' : 'Add New Service';
  const submitButtonText = service ? 'Save Changes' : 'Add Service';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="serviceName" className="block text-sm font-medium text-gray-700">Service Name</label>
          <input type="text" id="serviceName" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">Category</label>
          <input type="text" id="category" value={category} onChange={e => setCategory(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="price" className="block text-sm font-medium text-gray-700">Price (₦)</label>
          <input type="number" id="price" value={price === 0 ? '' : price} onChange={e => setPrice(Number(e.target.value))} placeholder="e.g., 50000" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900" required />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">Description</label>
          <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900"></textarea>
        </div>
        <div className="flex justify-end pt-4 space-x-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">{submitButtonText}</button>
        </div>
      </form>
    </Modal>
  );
};

export default ServiceFormModal;
