
import React, { useState } from 'react';
import { Service } from '../types';
import ServiceFormModal from './ServiceFormModal'; // Changed from AddServiceModal

interface ServiceListProps {
  companyId: string; // Added companyId
  services: Service[];
  onAddService: (service: Omit<Service, 'id'>) => void;
  onUpdateService: (service: Service) => void; // New prop for updating service
}

const ServiceList: React.FC<ServiceListProps> = ({ companyId, services, onAddService, onUpdateService }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null); // New state for editing

  const handleEditClick = (service: Service) => {
    setEditingService(service);
  };

  const handleCloseFormModal = () => {
    setIsAddModalOpen(false);
    setEditingService(null); // Clear editing service on close
  };

  const handleSaveService = (service: Service | Omit<Service, 'id'>) => {
    if ('id' in service && service.id) { // Check if it's an existing service (has an id)
      onUpdateService(service as Service);
    } else {
      onAddService(service as Omit<Service, 'id'>);
    }
    handleCloseFormModal();
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Services / Products</h2>
              <button onClick={() => setIsAddModalOpen(true)} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold shadow text-sm">
                  + Add Service
              </button>
          </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-500">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3">Service Name</th>
                <th scope="col" className="px-6 py-3">Category</th>
                <th scope="col" className="px-6 py-3">Price</th>
                <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className="bg-white border-b hover:bg-gray-50">
                  <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                    {service.name}
                  </th>
                  <td className="px-6 py-4">{service.category}</td>
                  <td className="px-6 py-4">₦{service.price.toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <a href="#" onClick={(e) => { e.preventDefault(); handleEditClick(service); }} className="font-medium text-primary-600 hover:underline">Edit</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ServiceFormModal
        isOpen={isAddModalOpen || !!editingService} // Open if adding or editing
        onClose={handleCloseFormModal}
        onSaveService={handleSaveService}
        service={editingService} // Pass the service if editing
        companyId={companyId} // Passed companyId
      />
    </>
  );
};

export default ServiceList;