
export type NotificationCategory = 
  | 'user_registration' 
  | 'email_verification' 
  | 'password_reset' 
  | 'invitation' 
  | 'document' 
  | 'invoice' 
  | 'receipt' 
  | 'ai' 
  | 'subscription' 
  | 'payment' 
  | 'project' 
  | 'team' 
  | 'approval' 
  | 'announcement' 
  | 'admin' 
  | 'system';

export interface InAppNotification {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  userId?: string;
  user_id?: string;
  recipientEmail?: string;
  recipient_email?: string;
  recipientUserId?: string;
  recipient_user_id?: string;
  title: string;
  message: string;
  category: NotificationCategory;
  type?: 'info' | 'success' | 'warning' | 'error';
  notificationType?: string;
  notification_type?: string;
  relatedEntityId?: string;
  related_entity_id?: string;
  actionUrl?: string;
  action_url?: string;
  read: boolean;
  isRead?: boolean;
  is_read?: boolean;
  createdAt: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  expiresAt?: string;
  expires_at?: string;
  metadata?: Record<string, any>;
}

export enum InvoiceStatus {
  Paid = 'Paid',
  PartiallyPaid = 'Partially Paid',
  Overdue = 'Overdue',
  Draft = 'Draft',
  Sent = 'Sent'
}

export type InvoiceFrequency = 'one-time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually' | 'yearly';
export type BillingCycle = 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  verificationCode?: string;
  tenantIds: string[];
  isAdmin: boolean;
  status: 'Pending' | 'Active' | 'Declined' | 'Archived' | 'Deleted';
  avatarUrl?: string;
  user_metadata?: any;
  invoicesCreated?: number;
  receiptsCreated?: number;
  remainingAiCredits?: number;
  is_archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  deleted_at?: string;
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
  organizationId?: string; // Links Workspace to Organization
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
  status?: 'Active' | 'Archived' | 'Deleted';
  is_archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  deleted_at?: string;
}

export interface Service {
  id: string;
  companyId: string;
  name: string;
  packageName?: string;
  category: string;
  description: string;
  price: number;
  directCost?: number;
  indirectCost?: number;
}

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  serviceId: string;
  description: string;
  quantity: number;
  price: number;
  directCost?: number;
  indirectCost?: number;
  discount?: number;
  billingCycle?: BillingCycle;
  periodStartDate?: string;
  periodEndDate?: string;
  durationInMonths?: number;
  autoRenew?: boolean;
  renewalReminderDaysBefore?: number;
}

export type RecurringStatus = 'active' | 'paused' | 'completed' | 'cancelled' | 'archived';

export interface Invoice {
  id: string;
  companyId: string;
  invoiceNumber: string;
  clientId: string;
  projectId?: string; // Links Invoice to Project
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
  nextDueDate?: string;
  lastGeneratedDate?: string;
  startDate?: string;
  endDate?: string;
  recurringStatus?: RecurringStatus;
  autoGenerate?: boolean;
  autoSend?: boolean;
  invoiceSchedule?: string;
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
    projects: Project[]; // Holds Workspace Projects
}

export interface AllTenantsData {
    [tenantId: string]: TenantData;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
}

// Types for Document Transformer
export type DocumentBlockType = 'cover_page' | 'header' | 'metadata' | 'title' | 'paragraph' | 'table' | 'summary' | 'footer';

export interface DocumentBlock {
  id: string;
  type: DocumentBlockType;
  content: any;
}

export interface CoverPageBlock {
  title: string;
  subtitle?: string;
  companyName?: string;
  date?: string;
  preparedFor?: string;
  preparedBy?: string;
  logoUrl?: string;
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
  page_number?: number;
  x_position?: number;
  y_position?: number;
  width?: number;
  height?: number;
}

export interface GeneratedDocument {
  documentType: string;
  blocks: DocumentBlock[];
  signatures?: SignatureInfo[];
  originalFileBase64?: string;
  originalFileType?: string;
  originalFileName?: string;
  originalFileUrl?: string;
  projectId?: string; // Links Generated Document to Project
  ownerId?: string;
}

export interface StoredGeneratedDoc extends GeneratedDocument {
  id: string;
  companyId: string;
  createdAt: string;
  ownerId?: string;
}

export interface DocumentReviewResult {
  score: number;
  summary: string;
  risks: string[];
  suggestions: string[];
  keyClauses: { name: string; content: string }[];
}

export interface DbDocument {
  id: string;
  title: string;
  original_file_url: string;
  signed_file_url: string | null;
  owner_id: string;
  status: 'draft' | 'pending' | 'viewed' | 'awaiting_owner' | 'awaiting_signer' | 'partially_signed' | 'completed' | 'declined' | 'expired';
  created_at: string;
  file_type?: string; // e.g. pdf, docx, png, jpg, jpeg
  file_name?: string;
  // Fallback field to hold local data if needed
  content_json?: any;
}

export interface DbDocumentSignatory {
  id: string;
  document_id: string;
  name: string;
  email: string;
  role: 'owner' | 'main_signatory' | 'witness' | 'additional_signatory';
  token: string;
  status: 'pending' | 'viewed' | 'signed' | 'declined';
  signed_at: string | null;
}

export interface DbDocumentSignature {
  id: string;
  document_id: string;
  signatory_id: string;
  page_number: number;
  x_position: number;
  y_position: number;
  width?: number;
  height?: number;
  signature_type: 'draw' | 'type' | 'upload';
  signature_image_url: string; // signature image base64 or storage url
  created_at: string;
}

export type ProjectStatus = 'Planning' | 'Proposal' | 'Negotiation' | 'Contract' | 'Signing' | 'Invoice' | 'Payment' | 'Completed' | 'Archived';

export interface Project {
  id: string;
  companyId: string; // Represents the Workspace ID (Company)
  clientId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  value: number;
  startDate: string;
  endDate?: string;
  createdAt: string;
  deliverablesChecklist?: { id: string; label: string; completed: boolean }[];
  satisfactionRating?: number;
  feedbackComments?: string;
  completionDate?: string;
  compliancePolicy?: string;
  vaultHash?: string;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export type WorkspaceRole = 'Owner' | 'Admin' | 'Manager' | 'Member';

export interface AuditLog {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  details: string;
  createdAt: string;
}

