
import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { Company, User } from '../types';
import ImageCropperModal from './ImageCropperModal';

interface CompanyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  users: User[]; // Users associated with this company
  onUpdateCompanyDetails: (companyId: string, updatedDetails: Partial<Company>) => void;
  onDeleteCompany: (companyId: string) => void;
}

const CompanyDetailModal: React.FC<CompanyDetailModalProps> = ({
  isOpen,
  onClose,
  company,
  users,
  onUpdateCompanyDetails,
  onDeleteCompany,
}) => {
  const [formData, setFormData] = useState<Company>(company);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isCropperModalOpen, setIsCropperModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  useEffect(() => {
    setFormData(company);
  }, [company]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
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
    setFormData((prev) => ({ ...prev, logoUrl: base64Image }));
    setIsCropperModalOpen(false);
    setImageToCrop(null);
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({ ...prev, logoUrl: undefined }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateCompanyDetails(company.id, formData);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete company "${company.name}"? This action cannot be undone.`)) {
      onDeleteCompany(company.id);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Company Details: ${company.name}`}>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">Company Name</label>
              <input type="text" id="name" value={formData.name} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Company Email</label>
              <input type="email" id="email" value={formData.email} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Phone Number</label>
              <input type="tel" id="phone" value={formData.phone || ''} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" />
            </div>
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700">Address</label>
              <textarea id="address" rows={3} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 bg-white text-gray-900" value={formData.address} onChange={handleChange}></textarea>
            </div>
          </div>

          <div className="border-t pt-4 mt-4">
            <h4 className="text-md font-semibold text-gray-700 mb-2">Company Logo</h4>
            <div className="flex items-center space-x-4">
              {formData.logoUrl ? (
                <div className="relative w-24 h-24 border rounded-lg overflow-hidden flex-shrink-0">
                  <img src={formData.logoUrl} alt="Company Logo" className="w-full h-full object-contain" />
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="absolute top-0 right-0 p-1 bg-red-500 text-white rounded-full text-xs"
                    aria-label="Remove logo"
                  >&times;</button>
                </div>
              ) : (
                <div className="w-24 h-24 border border-gray-300 rounded-lg flex items-center justify-center text-gray-400 flex-shrink-0">
                  No Logo
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                />
                <p className="mt-1 text-xs text-gray-500">Upload a square image for best results.</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-md font-semibold text-gray-700 mb-2">Bank Accounts</h4>
            {formData.bankAccounts && formData.bankAccounts.length > 0 ? (
              <ul className="space-y-2">
                {formData.bankAccounts.map((account) => (
                  <li key={account.id} className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md">
                    <span className="font-semibold">{account.bankName}:</span> {account.accountName} - {account.accountNumber}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No bank accounts configured.</p>
            )}
            <p className="text-sm text-gray-500 mt-2">Manage bank accounts in company settings.</p>
          </div>

          <div className="border-t pt-4">
            <h4 className="text-md font-semibold text-gray-700 mb-2">Associated Users ({users.length})</h4>
            {users.length > 0 ? (
              <ul className="space-y-2">
                {users.map((user) => (
                  <li key={user.id} className="text-sm text-gray-700 bg-gray-50 p-2 rounded-md flex justify-between items-center">
                    <div>
                      <span className="font-semibold">{user.name}</span> ({user.email})
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.status === 'Active' ? 'bg-green-100 text-green-800' : user.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                      {user.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No users associated with this company.</p>
            )}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow"
            >
              Delete Company
            </button>
            <div className="flex space-x-2">
              {showSuccess && <span className="text-sm text-green-600 font-medium self-center">Changes saved!</span>}
              <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Save Changes</button>
            </div>
          </div>
        </form>
      </Modal>
      {isCropperModalOpen && imageToCrop && (
        <ImageCropperModal
          isOpen={isCropperModalOpen}
          onClose={() => setIsCropperModalOpen(false)}
          imageSrc={imageToCrop}
          onCrop={handleCroppedImage}
        />
      )}
    </>
  );
};

export default CompanyDetailModal;
