
import React from 'react';
import { Client, Service, Invoice, InvoiceStatus, Company } from '../types';
import InvoiceForm from './InvoiceForm'; // Import the new InvoiceForm component

interface CreateInvoiceProps {
  clients: Client[];
  services: Service[];
  onAddInvoice: (invoice: Omit<Invoice, 'id' | 'invoiceNumber'>) => void;
  company: Company;
  onCancel: () => void; // Added for consistency with InvoiceForm
  initialDraft?: Partial<Invoice> | null;
}

const CreateInvoice: React.FC<CreateInvoiceProps> = ({ clients, services, onAddInvoice, company, onCancel, initialDraft }) => {
  const handleSave = (invoiceData: Omit<Invoice, 'id' | 'invoiceNumber'>, status: InvoiceStatus) => {
    // onAddInvoice already expects Omit<Invoice, 'id' | 'invoiceNumber'>
    onAddInvoice({ ...invoiceData, status });
  };

  return (
    <InvoiceForm 
      clients={clients}
      services={services}
      company={company}
      initialInvoice={initialDraft as Invoice}
      onSave={handleSave as (invoice: Invoice | Omit<Invoice, 'id' | 'invoiceNumber'>, status: InvoiceStatus) => void} // Cast to satisfy InvoiceFormProps
      onCancel={onCancel}
    />
  );
};

export default CreateInvoice;