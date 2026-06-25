
export enum InvoiceStatus {
  Paid = 'Paid',
  Overdue = 'Overdue',
  Draft = 'Draft',
  Sent = 'Sent'
}

export type InvoiceFrequency = 'one-time' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually';
export type BillingCycle = 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  verificationCode?: string;
  tenantIds: string[];
  isAdmin: boolean;
  status: 'Pending' | 'Active' | 'Declined';
  avatarUrl?: string;
}

export interface BankAccount {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface Company {
  id: string;
  ownerId?: string; 
  name: string;
  address: string;
  email: string;
  phone?: string;
  logoUrl?: string;
  website?: string; // Added for transformer
  bankAccounts?: BankAccount[];
}

export interface Client {
  id: string;
  companyId: string;
  name: string;
  email: string;
  companyName: string;
}

export interface Service {
  id: string;
  companyId: string;
  name: string;
  category: string;
  description: string;
  price: number;
}

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  serviceId: string;
  description: string;
  quantity: number;
  price: number;
  discount?: number;
  billingCycle?: BillingCycle;
  periodStartDate?: string;
  periodEndDate?: string;
  durationInMonths?: number;
  autoRenew?: boolean;
  renewalReminderDaysBefore?: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  total: number;
  discount?: number;
  amountPaid?: number; // Added for partial payments
  status: InvoiceStatus;
  selectedBankAccountId?: string;
  // Manual bank details if no account is selected
  manualBankName?: string;
  manualAccountName?: string;
  manualAccountNumber?: string;
  paymentTerms: string;
  frequency: InvoiceFrequency;
  nextRecurrenceDate?: string;
  isRecurringTemplate?: boolean;
  parentInvoiceId?: string;
  lastSentDate?: string;
  isReceiptSent?: boolean;
}

export interface TenantData {
    clients: Client[];
    services: Service[];
    invoices: Invoice[];
    generatedDocs: StoredGeneratedDoc[];
}

export interface AllTenantsData {
    [tenantId: string]: TenantData;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

// Types for Document Transformer
export type DocumentBlockType = 'header' | 'metadata' | 'title' | 'paragraph' | 'table' | 'summary' | 'footer';

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  content: any;
}

export interface HeaderBlock {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl?: string;
}

export interface MetadataBlock {
  documentTitle: string;
  clientName: string;
  preparedBy: string;
  date: string;
  reference: string;
}

export interface TableBlock {
  headers: string[];
  rows: (string[])[];
}

export interface SummaryBlock {
  subtotal?: number;
  tax?: number;
  total: number;
  currency: string;
  notes?: string;
}

export interface SignatureInfo {
  id: string;
  type: 'draw' | 'type' | 'upload';
  value: string;
  name: string;
  title: string;
  date: string;
  signatoryType: 'Main' | 'Witness';
  email?: string;
  isSigned: boolean;
  isRequested?: boolean;
}

export interface GeneratedDocument {
  documentType: string;
  blocks: DocumentBlock[];
  signatures?: SignatureInfo[];
  originalFileBase64?: string;
  originalFileType?: string;
  originalFileName?: string;
}

export interface StoredGeneratedDoc extends GeneratedDocument {
  id: string;
  companyId: string;
  createdAt: string;
}

export interface DocumentReviewResult {
  score: number;
  summary: string;
  risks: string[];
  suggestions: string[];
  keyClauses: { name: string; content: string }[];
}