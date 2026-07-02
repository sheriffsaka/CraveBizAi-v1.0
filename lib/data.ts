
import { Company, AllTenantsData, InvoiceStatus, User } from '../types';

export const mockCompanies: Company[] = [
    { 
        id: 'cravebiz-inc', 
        name: 'CraveBiZ Inc.', 
        address: '123 Innovation Drive, Lagos, Nigeria', 
        email: 'contact@cravebiz.com',
        phone: '+234 800 123 4567',
        logoUrl: 'https://i.imgur.com/L4a2h4g.png', // A simple placeholder logo
        bankAccounts: [
            { id: 'bank-cravebiz-001', companyId: 'cravebiz-inc', bankName: 'First Bank of Nigeria', accountName: 'CraveBiZ Solutions Ltd.', accountNumber: '0123456789' },
            { id: 'bank-cravebiz-002', companyId: 'cravebiz-inc', bankName: 'Zenith Bank PLC', accountName: 'CraveBiZ Operations', accountNumber: '9876543210' },
        ]
    },
    { 
        id: 'innovate-tech', 
        name: 'InnovateTech', 
        address: '456 Future Road, Abuja, Nigeria', 
        email: 'hello@innovatetech.io',
        phone: '+234 900 987 6543',
        logoUrl: 'https://i.imgur.com/sC7I0A4.png', // A different placeholder logo
        bankAccounts: [
            { id: 'bank-innovate-001', companyId: 'innovate-tech', bankName: 'GTBank', accountName: 'InnovateTech Ventures', accountNumber: '1122334455' },
        ]
    },
];

export const mockUsers: User[] = [
    { id: 'user1', name: 'Admin User', email: 'admin@cravebiz.com', password: 'password123', tenantIds: ['cravebiz-inc'], isAdmin: false, status: 'Active' },
    { id: 'user2', name: 'Tunde Adebayo', email: 'tunde@innovatetech.io', password: 'password123', tenantIds: ['innovate-tech'], isAdmin: false, status: 'Active' },
    { id: 'user3', name: 'Super Admin', email: 'super@admin.com', password: 'super', tenantIds: ['cravebiz-inc', 'innovate-tech'], isAdmin: true, status: 'Active' },
    { id: 'user4', name: 'Pending User', email: 'pending@cravebiz.com', password: 'password123', tenantIds: ['cravebiz-inc'], isAdmin: false, status: 'Pending', verificationCode: '123456' }, // New pending user
];

export const mockTenantData: AllTenantsData = {
    'cravebiz-inc': {
        clients: [
          { id: 'c1-cravebiz-inc', companyId: 'cravebiz-inc', name: 'John Doe', email: 'john.doe@technova.com', companyName: 'TechNova Solutions' },
          { id: 'c2-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Jane Smith', email: 'jane.smith@digitalwave.net', companyName: 'DigitalWave Inc.' },
          { id: 'c3-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Peter Jones', email: 'peter.j@alphacreative.io', companyName: 'AlphaCreative' },
          { id: 'c4-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Sarah Lee', email: 'sarah.lee@growthpartners.com', companyName: 'Growth Partners' },
        ],
        services: [
          { id: 's1-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Web Hosting', category: 'Hosting', description: 'Premium web hosting services.', price: 50000 },
          { id: 's2-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Branding Package', category: 'Branding', description: 'Complete branding solution.', price: 250000 },
          { id: 's3-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Cloud Migration', category: 'Cloud Services', description: 'Migrate infrastructure to the cloud.', price: 500000 },
          { id: 's4-cravebiz-inc', companyId: 'cravebiz-inc', name: 'Monthly SEO Service', category: 'Digital Marketing', description: 'Ongoing search engine optimization.', price: 75000 },
        ],
        invoices: [
          {
            id: 'inv1-cravebiz-inc', companyId: 'cravebiz-inc', invoiceNumber: 'INV-202310-001', clientId: 'c1-cravebiz-inc', issueDate: '2023-10-15', dueDate: '2023-10-30',
            items: [{ serviceId: 's1-cravebiz-inc', description: 'Web Hosting - Annual', quantity: 1, price: 50000 }], total: 53750, status: InvoiceStatus.Paid,
            selectedBankAccountId: 'bank-cravebiz-001',
            paymentTerms: ` 50% upfront payment.
 30% After frontend completion
 20% After project completion`,
            frequency: 'one-time',
            isReceiptSent: true, // Mock a sent receipt
          },
          {
            id: 'inv2-cravebiz-inc', companyId: 'cravebiz-inc', invoiceNumber: 'INV-202310-002', clientId: 'c2-cravebiz-inc', issueDate: '2023-10-10', dueDate: '2023-10-25',
            items: [{ serviceId: 's2-cravebiz-inc', description: 'Branding Package', quantity: 1, price: 250000 }], total: 268750, status: InvoiceStatus.Sent,
            selectedBankAccountId: 'bank-cravebiz-002',
            paymentTerms: `Payment due within 15 days of invoice date.`,
            frequency: 'one-time',
            lastSentDate: '2023-10-10', // Mock last sent date
          },
          {
            id: 'inv3-cravebiz-inc', companyId: 'cravebiz-inc', invoiceNumber: 'INV-202309-005', clientId: 'c3-cravebiz-inc', issueDate: '2023-09-20', dueDate: '2023-10-05',
            items: [{ serviceId: 's1-cravebiz-inc', description: 'Web Hosting for AlphaCreative', quantity: 2, price: 50000 }], total: 107500, status: InvoiceStatus.Overdue,
            selectedBankAccountId: 'bank-cravebiz-001',
            paymentTerms: `Immediate payment required.`,
            frequency: 'one-time',
            lastSentDate: '2023-10-01', // Mock last sent date
          },
          { // Recurring Invoice Template
            id: 'rec-inv-cravebiz-001', companyId: 'cravebiz-inc', invoiceNumber: 'REC-202311-001', clientId: 'c4-cravebiz-inc', issueDate: '2023-11-01', dueDate: '2023-11-15',
            items: [{ serviceId: 's4-cravebiz-inc', description: 'Monthly SEO Optimization for Growth Partners', quantity: 1, price: 75000 }], total: 80625, status: InvoiceStatus.Draft, // Draft status for template
            selectedBankAccountId: 'bank-cravebiz-001',
            paymentTerms: `Monthly recurring payment due within 14 days.`,
            frequency: 'monthly',
            nextRecurrenceDate: '2023-12-01', // Next generation date
            isRecurringTemplate: true,
          },
          { // Generated instance of recurring invoice (mock historical)
            id: 'rec-inv-gen-cravebiz-001-oct', companyId: 'cravebiz-inc', invoiceNumber: 'REC-202310-001', clientId: 'c4-cravebiz-inc', issueDate: '2023-10-01', dueDate: '2023-10-15',
            items: [{ serviceId: 's4-cravebiz-inc', description: 'Monthly SEO Optimization for Growth Partners (Oct)', quantity: 1, price: 75000 }], total: 80625, status: InvoiceStatus.Paid,
            selectedBankAccountId: 'bank-cravebiz-001',
            paymentTerms: `Monthly recurring payment due within 14 days.`,
            frequency: 'one-time', // Generated instances are one-time
            parentInvoiceId: 'rec-inv-cravebiz-001', // Link to template
            isReceiptSent: true,
          },
          { // Generated instance of recurring invoice (mock historical)
            id: 'rec-inv-gen-cravebiz-001-nov', companyId: 'cravebiz-inc', invoiceNumber: 'REC-202311-001', clientId: 'c4-cravebiz-inc', issueDate: '2023-11-01', dueDate: '2023-11-15',
            items: [{ serviceId: 's4-cravebiz-inc', description: 'Monthly SEO Optimization for Growth Partners (Nov)', quantity: 1, price: 75000 }], total: 80625, status: InvoiceStatus.Sent,
            selectedBankAccountId: 'bank-cravebiz-001',
            paymentTerms: `Monthly recurring payment due within 14 days.`,
            frequency: 'one-time', // Generated instances are one-time
            parentInvoiceId: 'rec-inv-cravebiz-001', // Link to template
            lastSentDate: '2023-11-01',
          },
        ],
        // FIX: The TenantData type requires a `generatedDocs` property.
        generatedDocs: [],
        projects: [
          {
            id: 'proj1-cravebiz-inc',
            companyId: 'cravebiz-inc',
            clientId: 'c1-cravebiz-inc',
            name: 'Enterprise Cloud Portal',
            description: 'Phase 1 development of their modern web application, cloud infrastructure setup, and customer portal integration.',
            status: 'Signing',
            value: 750000,
            startDate: '2023-10-01',
            createdAt: '2023-10-01'
          },
          {
            id: 'proj2-cravebiz-inc',
            companyId: 'cravebiz-inc',
            clientId: 'c2-cravebiz-inc',
            name: 'Brand Identity Overhaul',
            description: 'Redesigning color systems, logo, typography standards, and brand style guides for DigitalWave Inc.',
            status: 'Proposal',
            value: 250000,
            startDate: '2023-11-05',
            createdAt: '2023-11-01'
          }
        ],
    },
    'innovate-tech': {
        clients: [
            { id: 'c1-innovate-tech', companyId: 'innovate-tech', name: 'Susan Lee', email: 'susan.lee@quantumleap.co', companyName: 'QuantumLeap Corp.' },
            { id: 'c2-innovate-tech', companyId: 'innovate-tech', name: 'Mike Brown', email: 'mike.b@synergy.com', companyName: 'Synergy Partners' },
        ],
        services: [
            { id: 's1-innovate-tech', companyId: 'innovate-tech', name: 'SEO Optimization', category: 'Marketing', description: 'Improve search engine ranking.', price: 150000 },
            { id: 's2-innovate-tech', companyId: 'innovate-tech', name: 'Social Media Management', category: 'Marketing', description: 'Monthly social media handling.', price: 120000 },
        ],
        invoices: [
            {
                id: 'inv1-innovate-tech', companyId: 'innovate-tech', invoiceNumber: 'IT-202311-001', clientId: 'c1-innovate-tech', issueDate: '2023-11-01', dueDate: '2023-11-15',
                items: [{ serviceId: 's1-innovate-tech', description: 'Q4 SEO Campaign', quantity: 1, price: 150000 }], total: 161250, status: InvoiceStatus.Draft,
                selectedBankAccountId: 'bank-innovate-001',
                paymentTerms: `Net 30 days from invoice date.`,
                frequency: 'one-time',
            },
            {
                id: 'inv2-innovate-tech', companyId: 'innovate-tech', invoiceNumber: 'IT-202310-025', clientId: 'c2-innovate-tech', issueDate: '2023-10-20', dueDate: '2023-11-04',
                items: [
                    { serviceId: 's1-innovate-tech', description: 'SEO Consulting', quantity: 1, price: 150000 },
                    { serviceId: 's2-innovate-tech', description: 'Social Media Management (Oct)', quantity: 1, price: 120000 },
                ], total: 290250, status: InvoiceStatus.Paid,
                selectedBankAccountId: 'bank-innovate-001',
                paymentTerms: `Payment processed upon service completion.`,
                frequency: 'one-time',
                isReceiptSent: false, // Mock not sent yet
            },
        ],
        // FIX: The TenantData type requires a `generatedDocs` property.
        generatedDocs: [],
        projects: [
          {
            id: 'proj1-innovate-tech',
            companyId: 'innovate-tech',
            clientId: 'c1-innovate-tech',
            name: 'Quantum SEO Blitz',
            description: 'High-impact SEO positioning and indexing boost for local and international markets.',
            status: 'Planning',
            value: 150000,
            startDate: '2023-11-10',
            createdAt: '2023-11-01'
          }
        ],
    }
};

export const revenueData = [
    { name: 'Jul', revenue: 400000 },
    { name: 'Aug', revenue: 650000 },
    { name: 'Sep', revenue: 520000 },
    { name: 'Oct', revenue: 850000 },
    { name: 'Nov', revenue: 780000 },
    { name: 'Dec', revenue: 1250500 },
];

// New mock data for Client Acquisition Trend
export const mockClientAcquisitionData = [
  { name: 'Jan', newClients: 2 },
  { name: 'Feb', newClients: 3 },
  { name: 'Mar', newClients: 1 },
  { name: 'Apr', newClients: 4 },
  { name: 'May', newClients: 2 },
  { name: 'Jun', newClients: 5 },
  { name: 'Jul', newClients: 3 },
  { name: 'Aug', newClients: 6 },
  { name: 'Sep', newClients: 4 },
  { name: 'Oct', newClients: 2 },
  { name: 'Nov', newClients: 3 },
  { name: 'Dec', newClients: 7 },
];
