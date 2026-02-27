
import React from 'react';
import { Client, Service, Invoice, InvoiceStatus, Company } from '../types';
import InvoiceForm from './InvoiceForm'; // Import the new InvoiceForm component

interface EditInvoiceProps {
  invoice: Invoice; // The invoice to be edited
  clients: Client[];
  services: Service[];
  company: Company;
  onUpdateInvoice: (invoice: Invoice, status: InvoiceStatus) => void;
  onCancel: () => void;
}

const EditInvoice: React.FC<EditInvoiceProps> = ({ invoice, clients, services, company, onUpdateInvoice, onCancel }) => {
  const handleSave = (invoiceData: Invoice | Omit<Invoice, 'id' | 'invoiceNumber'>, status: InvoiceStatus) => {
    // Since initialInvoice is provided, invoiceData will be of type Invoice
    onUpdateInvoice(invoiceData as Invoice, status);
  };

  return (
    <InvoiceForm 
      initialInvoice={invoice}
      clients={clients}
      services={services}
      company={company}
      onSave={handleSave}
      onCancel={onCancel}
    />
  );
};

export default EditInvoice;