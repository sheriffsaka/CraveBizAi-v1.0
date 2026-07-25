import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import PriceCalculatorModal from './PriceCalculatorModal';
import { Service } from '../types';
import { generateTextResponse } from '../services/aiGenerationService';
import { Calculator, Sparkles, Loader2 } from 'lucide-react';

interface ServiceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveService: (service: Service | Omit<Service, 'id'>) => void;
  service?: Service | null; // Optional service prop for editing
  companyId: string; // Added companyId prop
}

const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  isOpen,
  onClose,
  onSaveService,
  service,
  companyId
}) => {
  const [name, setName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState('');
  
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false);

  // Persistence logic for drafts
  useEffect(() => {
    if (!service && isOpen) {
      const savedDraft = localStorage.getItem('cravebiz_service_draft');
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft);
          if (draft.name) setName(draft.name);
          if (draft.packageName) setPackageName(draft.packageName);
          if (draft.category) setCategory(draft.category);
          if (draft.price) setPrice(draft.price);
          if (draft.description) setDescription(draft.description);
        } catch (e) {
          console.error("Service draft recovery failed", e);
        }
      }
    }
  }, [service, isOpen]);

  useEffect(() => {
    if (!service && isOpen) {
      const draft = { name, packageName, category, price, description };
      localStorage.setItem('cravebiz_service_draft', JSON.stringify(draft));
    }
  }, [name, packageName, category, price, description, service, isOpen]);

  const clearDraft = () => localStorage.removeItem('cravebiz_service_draft');

  // Populate form fields if a service is being edited
  useEffect(() => {
    if (service) {
      setName(service.name || '');
      setPackageName(service.packageName || '');
      setCategory(service.category || '');
      setPrice(service.price || 0);
      setDescription(service.description || '');
    } else {
      // Clear form if adding a new service
      setName('');
      setPackageName('');
      setCategory('');
      setPrice(0);
      setDescription('');
    }
  }, [service, isOpen]); // Reset when modal opens or service changes

  const handleGenerateDescription = async () => {
    if (!name.trim()) {
      alert("Please enter a Service Name first before generating a description.");
      return;
    }
    setIsGeneratingDescription(true);
    try {
      const prompt = `Generate a concise, highly professional, and compelling service description (2 to 3 sentences) for a service offer with the following details:
- Service Name: ${name}
- Package Name: ${packageName || 'Standard Package'}
- Category: ${category || 'General Services'}

Ensure the description clearly outlines the core deliverables, client benefits, and value proposition. Return ONLY plain text suitable for invoices and service catalogs without quotes or markdown headers.`;

      const systemInstruction = "You are an expert commercial copywriter creating professional, clean service descriptions for business invoices and catalog proposals.";

      const generated = await generateTextResponse(prompt, "gemini-2.5-flash", systemInstruction);
      if (generated && !generated.includes("Sorry, I encountered an error")) {
        setDescription(generated.trim());
      } else {
        alert("Unable to generate description automatically. Please check your AI credit balance or enter description manually.");
      }
    } catch (err: any) {
      console.error("Failed to generate service description:", err);
      alert("Failed to generate service description: " + (err.message || 'Unknown error'));
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !category || price < 0) return;

    if (service) {
      // Editing existing service
      onSaveService({
        ...service,
        name,
        packageName,
        category,
        price,
        description
      });
    } else {
      // Adding new service, including companyId
      onSaveService({
        companyId,
        name,
        packageName,
        category,
        price,
        description
      });
    }
    clearDraft();
    onClose(); // Close modal after saving
  };

  const title = service ? 'Edit Service' : 'Smart Create Service';
  const submitButtonText = service ? 'Save Changes' : 'Add Service';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Service Name */}
          <div>
            <label htmlFor="serviceName" className="block text-sm font-medium text-gray-700">
              Service Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="serviceName"
              placeholder="e.g. Web Development, SEO Audit, Consultation"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900"
              required
            />
          </div>

          {/* Package Name (New Field) */}
          <div>
            <label htmlFor="packageName" className="block text-sm font-medium text-gray-700">
              Package Name
            </label>
            <input
              type="text"
              id="packageName"
              placeholder="e.g. Basic Tier, Gold Package, Enterprise Retainer"
              value={packageName}
              onChange={e => setPackageName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900"
            />
            <p className="mt-1 text-3xs text-gray-500">
              Optional tier or package label (e.g., Starter, Standard, Premium).
            </p>
          </div>

          {/* Category */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700">
              Category <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="category"
              placeholder="e.g. IT Services, Design, Marketing, Legal"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900"
              required
            />
          </div>

          {/* Price & Price Calculator */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="price" className="block text-sm font-medium text-gray-700">
                Price (₦) <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsCalculatorOpen(true)}
                className="inline-flex items-center space-x-1.5 text-xs font-bold text-primary-700 hover:text-primary-900 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-md border border-primary-200 transition-colors shadow-2xs"
              >
                <Calculator className="w-3.5 h-3.5 text-primary-600" />
                <span>Price Calculator</span>
              </button>
            </div>
            <input
              type="number"
              id="price"
              value={price === 0 ? '' : price}
              onChange={e => setPrice(Number(e.target.value))}
              placeholder="e.g. 50000"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900 font-bold"
              required
            />
          </div>

          {/* Description & Generate Description AI button */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <button
                type="button"
                onClick={handleGenerateDescription}
                disabled={isGeneratingDescription}
                className="inline-flex items-center space-x-1.5 text-xs font-bold text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 transition-colors disabled:opacity-50 shadow-2xs"
              >
                {isGeneratingDescription ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                    <span>Generating AI Description...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                    <span>Generate Description</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              id="description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detailed description of deliverables, scope, and service terms..."
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white text-gray-900"
            />
          </div>

          {/* Submit and Cancel Buttons */}
          <div className="flex justify-end pt-4 space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold text-sm shadow-md transition-colors"
            >
              {submitButtonText}
            </button>
          </div>
        </form>
      </Modal>

      {/* Price Calculator Modal */}
      <PriceCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        onApplyPrice={(calculatedPrice) => {
          setPrice(calculatedPrice);
        }}
        initialPrice={price}
      />
    </>
  );
};

export default ServiceFormModal;
