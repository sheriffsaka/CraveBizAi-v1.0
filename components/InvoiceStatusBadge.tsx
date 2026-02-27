
import React from 'react';
import { InvoiceStatus } from '../types';

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
}

const statusStyles: { [key in InvoiceStatus]: string } = {
  [InvoiceStatus.Paid]: 'bg-green-100 text-green-800',
  [InvoiceStatus.Overdue]: 'bg-red-100 text-red-800',
  [InvoiceStatus.Sent]: 'bg-blue-100 text-blue-800',
  [InvoiceStatus.Draft]: 'bg-gray-200 text-gray-700',
};

const InvoiceStatusBadge: React.FC<InvoiceStatusBadgeProps> = ({ status }) => {
  return (
    <span
      className={`px-3 py-1 text-xs font-semibold rounded-full inline-block ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
};

export default InvoiceStatusBadge;