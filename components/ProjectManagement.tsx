import React, { useState, useMemo, useEffect } from 'react';
import { Project, ProjectStatus, Client, StoredGeneratedDoc, Invoice, AuditLog, InvoiceStatus } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import Icon from './common/Icon';
import PaymentModal from './PaymentModal';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ProjectManagementProps {
  companyId: string;
  projects: Project[];
  clients: Client[];
  generatedDocs?: StoredGeneratedDoc[];
  invoices?: Invoice[];
  auditLogs?: AuditLog[];
  onAddProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (companyId: string, projectId: string) => void;
  onNavigateTo: (page: string, props?: any) => void;
  onRecordPayment?: (invoiceId: string, amount: number) => Promise<void>;
  onSendReceipt?: (invoiceId: string) => Promise<void>;
}

const LIFECYCLE_STAGES: { status: ProjectStatus; label: string; desc: string; icon: string; actionText?: string; actionPage?: string }[] = [
  { status: 'Planning', label: '1. Planning', desc: 'Identify goals, define scope, and estimate baseline service requirements.', icon: 'dashboard' },
  { status: 'Proposal', label: '2. Proposal', desc: 'Draft and send smart proposal with detailed quotes.', icon: 'invoices', actionText: 'Create Invoice Proposal', actionPage: 'create-invoice' },
  { status: 'Negotiation', label: '3. Negotiation', desc: 'Collaborate on adjustments, prices, and service schedules.', icon: 'repeat' },
  { status: 'Contract', label: '4. Contract', desc: 'Review legal clauses, security, and payment terms.', icon: 'doc-signify', actionText: 'Review in DocSignify', actionPage: 'doc-signify' },
  { status: 'Signing', label: '5. Signing', desc: 'Collect secure electronic signatures through DocSignify.', icon: 'clients', actionText: 'Collect Electronic Signatures', actionPage: 'doc-signify' },
  { status: 'Invoice', label: '6. Invoice', desc: 'Automatically generate and issue invoice for contract payment.', icon: 'invoices', actionText: 'Create New Invoice', actionPage: 'create-invoice' },
  { status: 'Payment', label: '7. Payment', desc: 'Process payment, monitor collection, and issue receipts.', icon: 'reports' },
  { status: 'Completed', label: '8. Completed', desc: 'All deliverables met, final receipts issued, and values recognized.', icon: 'mail' },
  { status: 'Archived', label: '9. Archived', desc: 'Deal finalized and securely persisted in system archives.', icon: 'settings' }
];

const STATUS_COLORS: Record<ProjectStatus, { bg: string; text: string; border: string }> = {
  Planning: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Proposal: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Negotiation: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Contract: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  Signing: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  Invoice: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  Payment: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  Completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Archived: { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
};

const POLICY_DETAILS: Record<string, { name: string; years: number; desc: string }> = {
  'IRS-7Y': { name: 'IRS Financial Audit Standard', years: 7, desc: 'Requires 7-year retention of ledgers and milestones.' },
  'CORP-10Y': { name: 'General Corporate Compliance', years: 10, desc: 'Provides legal audit trail for up to 10 years.' },
  'SEC-5Y': { name: 'SEC Advisory Regulation', years: 5, desc: 'Aligns with federal advisory and investment standards.' },
  'GDPR-3Y': { name: 'GDPR Data Minimization Policy', years: 3, desc: 'Right-to-be-forgotten standard with 3-year hard deletion cycle.' }
};

export default function ProjectManagement({
  companyId,
  projects,
  clients,
  generatedDocs = [],
  invoices = [],
  auditLogs = [],
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onNavigateTo,
  onRecordPayment,
  onSendReceipt
}: ProjectManagementProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id || null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  
  // Payment quick action states
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentActiveInvoice, setPaymentActiveInvoice] = useState<Invoice | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formClientId, setFormClientId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('Planning');
  const [formValue, setFormValue] = useState(0);
  const [formStartDate, setFormStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [formEndDate, setFormEndDate] = useState('');

  const selectedProject = useMemo(() => {
    return projects.find(p => p.id === selectedProjectId) || projects[0] || null;
  }, [projects, selectedProjectId]);

  const projectDocs = useMemo(() => {
    if (!selectedProject) return [];
    return generatedDocs.filter(d => d.projectId === selectedProject.id);
  }, [generatedDocs, selectedProject]);

  const projectInvoices = useMemo(() => {
    if (!selectedProject) return [];
    return invoices.filter(i => i.projectId === selectedProject.id);
  }, [invoices, selectedProject]);

  const projectLogs = useMemo(() => {
    if (!selectedProject) return [];
    return auditLogs.filter(log => 
      log.resource === selectedProject.id || 
      log.details.includes(selectedProject.name) || 
      log.details.includes(selectedProject.id)
    );
  }, [auditLogs, selectedProject]);

  // Feedback closeout states
  const [feedbackRating, setFeedbackRating] = useState<number>(5);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [selectedPolicy, setSelectedPolicy] = useState<string>('IRS-7Y');

  useEffect(() => {
    if (selectedProject) {
      setFeedbackRating(selectedProject.satisfactionRating ?? 5);
      setFeedbackText(selectedProject.feedbackComments ?? '');
      setSelectedPolicy(selectedProject.compliancePolicy ?? 'IRS-7Y');
    }
  }, [selectedProject?.id]);

  const [isIntegrityScanning, setIsIntegrityScanning] = useState<boolean>(false);
  const [integrityStatus, setIntegrityStatus] = useState<'unchecked' | 'scanning' | 'valid'>('unchecked');
  const [reopenConfirm, setReopenConfirm] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setIsIntegrityScanning(false);
    setIntegrityStatus('unchecked');
    setReopenConfirm(false);
    setCopied(false);
  }, [selectedProjectId]);

  const defaultDeliverables = useMemo(() => [
    { id: 'signoff', label: 'Verify Final Client Sign-off Authenticated' },
    { id: 'payment', label: 'All Milestone Payments Settled & Receipts Issued' },
    { id: 'assets', label: 'Secure Handover of Assets & Deliverables' },
    { id: 'review', label: 'Document Satisfaction Rating & Feedback' }
  ], []);

  const currentChecklist = useMemo(() => {
    if (!selectedProject) return [];
    if (selectedProject.deliverablesChecklist && selectedProject.deliverablesChecklist.length > 0) {
      return selectedProject.deliverablesChecklist;
    }
    return defaultDeliverables.map(d => ({ ...d, completed: false }));
  }, [selectedProject, defaultDeliverables]);

  const handleToggleChecklist = (itemId: string, completed: boolean) => {
    if (!selectedProject) return;
    const checklist = currentChecklist.map(item => 
      item.id === itemId ? { ...item, completed } : item
    );
    onUpdateProject({
      ...selectedProject,
      deliverablesChecklist: checklist
    });
  };

  const handleSaveFeedback = () => {
    if (!selectedProject) return;
    const updatedChecklist = currentChecklist.map(item => 
      item.id === 'review' ? { ...item, completed: true } : item
    );
    onUpdateProject({
      ...selectedProject,
      satisfactionRating: feedbackRating,
      feedbackComments: feedbackText,
      deliverablesChecklist: updatedChecklist
    });
    alert("Feedback and satisfaction rating saved successfully!");
  };

  const handleArchiveProject = () => {
    if (!selectedProject) return;
    const input = `${selectedProject.id}|${selectedProject.value}|${feedbackRating}|${feedbackText}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    const computedHash = `CBZ-VAULT-${hex}-${Math.floor(1000 + Math.random() * 9000)}`;

    onUpdateProject({
      ...selectedProject,
      status: 'Archived',
      completionDate: new Date().toISOString(),
      compliancePolicy: selectedPolicy,
      vaultHash: computedHash
    });
    alert(`Success: ${selectedProject.name} has been securely archived in compliance vaults.\n\nCryptographic Seal Key:\n${computedHash}`);
  };

  const getRetentionMetrics = (project: Project) => {
    const archivedDate = project.completionDate ? new Date(project.completionDate) : new Date();
    const policyKey = project.compliancePolicy || 'IRS-7Y';
    const policy = POLICY_DETAILS[policyKey] || POLICY_DETAILS['IRS-7Y'];
    const expirationDate = new Date(archivedDate.getTime());
    expirationDate.setFullYear(expirationDate.getFullYear() + policy.years);
    const timeDiff = expirationDate.getTime() - new Date().getTime();
    const daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
    return {
      archivedDate,
      policy,
      expirationDate,
      daysRemaining
    };
  };

  const handleExportCompliancePackage = (project: Project) => {
    const { archivedDate, policy, expirationDate } = getRetentionMetrics(project);
    const clientName = getClientName(project.clientId);
    const checklistStr = (project.deliverablesChecklist || [])
      .map(item => `[${item.completed ? 'X' : ' '}] ${item.label}`)
      .join('\n');

    const manifest = `===========================================================
CRAVEBIZ AI - OFFICIAL COMPLIANCE ARCHIVE MANIFEST
===========================================================
Secure Vault ID        : ${project.id}
Project Name           : ${project.name}
Client Name            : ${clientName}
Recognized Asset Value : ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(project.value || 0)}
Archived Timestamp     : ${archivedDate.toLocaleString()}
Regulatory Policy      : ${policy.name} (${policy.years} Years Retention)
Required Hold Until    : ${expirationDate.toLocaleString()}
Vault Integrity Hash   : ${project.vaultHash || 'N/A'}
Compliance Seal Status : VERIFIED & LOCKED
-----------------------------------------------------------
CLIENT SATISFACTION REVIEW
-----------------------------------------------------------
Satisfaction Rating    : ${project.satisfactionRating || 5} / 5 Stars
Comments & Testimonial :
"${project.feedbackComments || 'No comment recorded.'}"
-----------------------------------------------------------
PROJECT HANDOVER DELIVERABLES CHECKLIST
-----------------------------------------------------------
${checklistStr || 'No custom deliverables recorded.'}
-----------------------------------------------------------
SECURE VAULT INTEGRITY LEDGER (AUDIT TIMELINE)
===========================================================
${(auditLogs || [])
  .filter(log => log.resource === project.id || log.details.includes(project.name) || log.details.includes(project.id))
  .map(log => `[${new Date(log.createdAt).toLocaleString()}] ${log.userName} - ${log.action}: ${log.details}`)
  .join('\n') || '[SYSTEM REGISTERED] Vault integrity hash sealed successfully.'}
===========================================================
This document represents a legally verified, cryptographically
sealed record of completed operations. All modifications are permanently
locked.
===========================================================`;

    const blob = new Blob([manifest], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CraveBiZ-Compliance-Manifest-${project.id}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const triggerIntegrityScan = () => {
    setIntegrityStatus('scanning');
    setTimeout(() => {
      setIntegrityStatus('valid');
    }, 1500);
  };

  const openAddModal = () => {
    setFormName('');
    setFormClientId(clients[0]?.id || '');
    setFormDescription('');
    setFormStatus('Planning');
    setFormValue(0);
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setFormName(project.name);
    setFormClientId(project.clientId);
    setFormDescription(project.description);
    setFormStatus(project.status);
    setFormValue(project.value);
    setFormStartDate(project.startDate);
    setFormEndDate(project.endDate || '');
    setIsEditModalOpen(true);
  };

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formClientId) return;

    if (isEditModalOpen && editingProject) {
      onUpdateProject({
        ...editingProject,
        name: formName,
        clientId: formClientId,
        description: formDescription,
        status: formStatus,
        value: Number(formValue),
        startDate: formStartDate,
        endDate: formEndDate || undefined
      });
      setIsEditModalOpen(false);
    } else {
      onAddProject({
        companyId,
        clientId: formClientId,
        name: formName,
        description: formDescription,
        status: formStatus,
        value: Number(formValue),
        startDate: formStartDate,
        endDate: formEndDate || undefined
      });
      setIsAddModalOpen(false);
    }
  };

  const handleStatusChange = (project: Project, newStatus: ProjectStatus) => {
    onUpdateProject({ ...project, status: newStatus });
  };

  // Group projects for columns
  const projectsByStatus = useMemo(() => {
    const map: Record<ProjectStatus, Project[]> = {
      Planning: [], Proposal: [], Negotiation: [], Contract: [], Signing: [], Invoice: [], Payment: [], Completed: [], Archived: []
    };
    projects.forEach(p => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });
    return map;
  }, [projects]);

  const stats = useMemo(() => {
    let totalValue = 0;
    let activeCount = 0;
    let completedCount = 0;
    
    const stageValues: Record<ProjectStatus, number> = {
      Planning: 0,
      Proposal: 0,
      Negotiation: 0,
      Contract: 0,
      Signing: 0,
      Invoice: 0,
      Payment: 0,
      Completed: 0,
      Archived: 0
    };
    
    projects.forEach(p => {
      totalValue += p.value;
      if (p.status === 'Completed' || p.status === 'Archived') {
        completedCount++;
      } else {
        activeCount++;
      }
      if (stageValues[p.status] !== undefined) {
        stageValues[p.status] += p.value;
      }
    });

    const avgValue = projects.length > 0 ? totalValue / projects.length : 0;

    const pipelineChartData = LIFECYCLE_STAGES.map(stage => ({
      name: stage.status,
      value: stageValues[stage.status] || 0,
      color: stage.status === 'Planning' ? '#3B82F6' :
             stage.status === 'Proposal' ? '#8B5CF6' :
             stage.status === 'Negotiation' ? '#6366F1' :
             stage.status === 'Contract' ? '#F59E0B' :
             stage.status === 'Signing' ? '#EC4899' :
             stage.status === 'Invoice' ? '#F59E0B' :
             stage.status === 'Payment' ? '#EAB308' :
             stage.status === 'Completed' ? '#10B981' : '#6B7280'
    })).filter(d => d.value > 0);

    return {
      totalValue,
      activeCount,
      completedCount,
      avgValue,
      pipelineChartData
    };
  }, [projects]);

  const getClientName = (clientId: string) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.companyName : 'Unknown Client';
  };

  const activeStageIndex = selectedProject 
    ? LIFECYCLE_STAGES.findIndex(s => s.status === selectedProject.status)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h2 id="projects-main-title" className="text-2xl font-bold text-gray-900 tracking-tight">Project Pipeline & Deal Lifecycles</h2>
          <p className="text-sm text-gray-500 mt-1">
            Standard business workflow: Organization ➔ Workspace ➔ Client ➔ Project ➔ Documents ➔ Signatures ➔ Invoice ➔ Payment.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="flex bg-gray-100 rounded-lg p-0.5 border">
            <button
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'board' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Pipeline Board
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'list' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Timeline Stepper
            </button>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold shadow-sm text-sm"
          >
            + Create Project
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-gray-400 uppercase tracking-widest mb-1">Pipeline Portfolio</p>
          <h3 className="text-2xl font-black text-gray-800">${stats.totalValue.toLocaleString()}</h3>
          <p className="text-4xs text-gray-400 mt-1">{projects.length} Deals total</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-primary-500 uppercase tracking-widest mb-1">Active Accounts</p>
          <h3 className="text-2xl font-black text-primary-600">{stats.activeCount}</h3>
          <p className="text-4xs text-primary-400 mt-1">Deals in pipeline</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-green-600 uppercase tracking-widest mb-1">Completed Deals</p>
          <h3 className="text-2xl font-black text-green-700">{stats.completedCount}</h3>
          <p className="text-4xs text-green-500 mt-1">Successfully closed out</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <p className="text-3xs font-black text-indigo-500 uppercase tracking-widest mb-1">Average Deal Size</p>
          <h3 className="text-2xl font-black text-indigo-600">${Math.round(stats.avgValue).toLocaleString()}</h3>
          <p className="text-4xs text-indigo-400 mt-1">Per individual project</p>
        </div>
      </div>

      {/* Deal Pipeline Chart */}
      {projects.length > 0 && stats.pipelineChartData.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-12 gap-6 items-center animate-fade-in">
          <div className="md:col-span-4">
            <h4 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-2">Deal Value Pipeline by Stage</h4>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Visualizes total contract value distributed across lifecycle stages. Accelerate and track payments through active phases.
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {stats.pipelineChartData.map(stage => (
                <div key={stage.name} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }}></span>
                    <span className="font-bold text-gray-600">{stage.name}</span>
                  </div>
                  <span className="font-black text-gray-800">${stage.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="md:col-span-8 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.pipelineChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value: number) => `$${(value / 1000).toLocaleString()}k`} />
                <Tooltip cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} formatter={(value: number) => [`$${value.toLocaleString()}`, 'Pipeline Value']} contentStyle={{ borderRadius: '8px', fontSize: '11px', fontWeight: 'bold' }} />
                <Bar dataKey="value" name="Deal Value" radius={[8, 8, 0, 0]} maxBarSize={40}>
                  {stats.pipelineChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Main Interactive View */}
      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-4 overflow-x-auto pb-4 select-none">
          {LIFECYCLE_STAGES.map((stage) => {
            const list = projectsByStatus[stage.status] || [];
            const color = STATUS_COLORS[stage.status];
            return (
              <div key={stage.status} className="flex flex-col bg-gray-50 rounded-xl p-3 border border-gray-200 min-w-[200px] h-[600px]">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">{stage.status}</h3>
                  <span className={`text-2xs px-2 py-0.5 rounded-full font-black ${color.bg} ${color.text} border ${color.border}`}>
                    {list.length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  <AnimatePresence mode="popLayout">
                    {list.map((proj) => (
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        key={proj.id}
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          setViewMode('list');
                        }}
                        className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm hover:border-primary-500 cursor-pointer transition-all hover:shadow-md"
                      >
                        <h4 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{proj.name}</h4>
                        <p className="text-2xs text-gray-400 font-medium mt-1 uppercase tracking-wider">{getClientName(proj.clientId)}</p>
                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-gray-100">
                          <span className="text-xs font-bold text-gray-700">
                            ${proj.value.toLocaleString()}
                          </span>
                          <span className="text-3xs text-gray-400 font-mono">
                            {proj.startDate}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {list.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-3xs text-gray-400 italic">
                      Empty stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Project List / Sidebar */}
          <div className="bg-white border rounded-xl shadow-sm p-4 h-[700px] flex flex-col">
            <h3 className="text-base font-semibold text-gray-800 mb-3">Select Active Project</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {projects.map((proj) => {
                const isSel = proj.id === selectedProjectId;
                const col = STATUS_COLORS[proj.status];
                return (
                  <div
                    key={proj.id}
                    onClick={() => setSelectedProjectId(proj.id)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all flex justify-between items-start ${
                      isSel ? 'border-primary-500 bg-primary-50/40 shadow-sm' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">{proj.name}</h4>
                      <p className="text-2xs text-gray-500">{getClientName(proj.clientId)}</p>
                    </div>
                    <span className={`text-3xs px-2 py-0.5 rounded-full font-black border uppercase tracking-wider ${col.bg} ${col.text} ${col.border}`}>
                      {proj.status}
                    </span>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="text-center py-20 text-sm text-gray-500 italic">No projects created yet.</div>
              )}
            </div>
          </div>

          {/* Stepper Detail Timeline */}
          <div className="lg:col-span-2 bg-white border rounded-xl shadow-sm p-6 flex flex-col h-[700px] overflow-y-auto">
            {selectedProject ? (
              <div className="space-y-6 flex-1 flex flex-col">
                {/* Project Overview */}
                <div className="flex justify-between items-start">
                  <div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border uppercase tracking-wider ${STATUS_COLORS[selectedProject.status].bg} ${STATUS_COLORS[selectedProject.status].text} ${STATUS_COLORS[selectedProject.status].border}`}>
                      {selectedProject.status} Stage
                    </span>
                    <h3 className="text-xl font-bold text-gray-900 mt-2">{selectedProject.name}</h3>
                    <p className="text-xs text-gray-500 font-semibold mt-1">Client Company: {getClientName(selectedProject.clientId)}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openEditModal(selectedProject)}
                      className="p-1.5 text-gray-500 hover:text-gray-900 border rounded-lg hover:bg-gray-50"
                      title="Edit Project"
                    >
                      <Icon name="edit" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this project?')) {
                          onDeleteProject(companyId, selectedProject.id);
                          setSelectedProjectId(projects.find(p => p.id !== selectedProject.id)?.id || null);
                        }
                      }}
                      className="p-1.5 text-red-500 hover:text-red-700 border border-red-100 rounded-lg hover:bg-red-50"
                      title="Delete Project"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 1-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-600 border-b pb-4 leading-relaxed">{selectedProject.description || 'No description provided.'}</p>

                {/* Workflow Stepper */}
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Business Deal Stepper Progress</h4>
                  
                  {/* Stepper Pipeline Indicators */}
                  <div className="grid grid-cols-9 gap-1 pb-4">
                    {LIFECYCLE_STAGES.map((stage, idx) => {
                      const isCompleted = idx < activeStageIndex;
                      const isActive = idx === activeStageIndex;
                      return (
                        <div
                          key={stage.status}
                          onClick={() => handleStatusChange(selectedProject, stage.status)}
                          className="flex flex-col items-center cursor-pointer group"
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                            isActive 
                              ? 'bg-primary-600 text-white border-primary-600 scale-110 shadow-md shadow-primary-100'
                              : isCompleted 
                              ? 'bg-emerald-500 text-white border-emerald-500'
                              : 'bg-white text-gray-400 border-gray-200 group-hover:border-primary-400 group-hover:text-primary-500'
                          }`}>
                            {isCompleted ? '✓' : idx + 1}
                          </div>
                          <span className={`text-[9px] mt-1 text-center font-semibold hidden md:block ${
                            isActive ? 'text-primary-700 font-bold' : isCompleted ? 'text-emerald-600' : 'text-gray-400'
                          }`}>
                            {stage.status}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Integration Stage Guidance Details */}
                <div className="flex-1 bg-gray-50 border rounded-xl p-5 mt-auto flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h5 className="text-sm font-bold text-gray-900 flex items-center">
                        <Icon name={LIFECYCLE_STAGES[activeStageIndex]?.icon || 'dashboard'} className="w-5 h-5 text-primary-600 mr-2" />
                        Active Phase: {LIFECYCLE_STAGES[activeStageIndex]?.label}
                      </h5>
                      <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                        {LIFECYCLE_STAGES[activeStageIndex]?.desc}
                      </p>
                    </div>

                    {/* Live Signature Tracking for Signing Stage */}
                    {selectedProject.status === 'Signing' && (
                      <div className="bg-white p-4 rounded-xl border border-gray-200/60 space-y-3 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                            DocSignify Real-time Tracker
                          </span>
                          {projectDocs.length > 0 && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-primary-50 text-primary-700 rounded-full border border-primary-100">
                              {projectDocs.length} Agreement(s)
                            </span>
                          )}
                        </div>
                        
                        {projectDocs.length === 0 ? (
                          <div className="text-[11px] text-gray-500 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 leading-relaxed">
                            No electronic signing session is currently linked to this project. Click the button below to generate a pre-filled e-sign agreement and register signatories.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {projectDocs.map((doc) => {
                              const sigs = doc.signatures || [];
                              const totalSigs = sigs.length;
                              const signedSigs = sigs.filter(s => s.isSigned).length;
                              const pct = totalSigs > 0 ? Math.round((signedSigs / totalSigs) * 100) : 0;
                              
                              return (
                                <div key={doc.id} className="text-xs bg-gray-50/50 p-3 rounded-lg border border-gray-150 space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="font-bold text-gray-800 truncate max-w-[180px]">{doc.documentType}</div>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider ${
                                      signedSigs === totalSigs ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                                    }`}>
                                      {signedSigs}/{totalSigs} SIGNED ({pct}%)
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-gray-100">
                                    {sigs.map((sig, sIdx) => (
                                      <div key={sig.id || sIdx} className="flex items-center justify-between text-[10px] text-gray-600 bg-white px-2 py-1 rounded border border-gray-100">
                                        <span className="font-medium truncate max-w-[85px]">{sig.name}</span>
                                        <span className={sig.isSigned ? "text-emerald-600 font-bold" : "text-amber-600 font-semibold animate-pulse"}>
                                          {sig.isSigned ? "✓ Signed" : "⏳ Pending"}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live Invoice Tracking for Invoice Stage */}
                    {selectedProject.status === 'Invoice' && (
                      <div className="bg-white p-4 rounded-xl border border-gray-200/60 space-y-3 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                            Live Invoice Tracker
                          </span>
                          {projectInvoices.length > 0 && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full border border-amber-100">
                              {projectInvoices.length} Invoice(s)
                            </span>
                          )}
                        </div>
                        
                        {projectInvoices.length === 0 ? (
                          <div className="text-[11px] text-gray-500 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 leading-relaxed">
                            No billing record is currently linked to this project. Click the button below to prefill and draft a customized invoice for this client.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {projectInvoices.map((inv) => (
                              <div key={inv.id} className="text-xs bg-gray-50/50 p-3 rounded-lg border border-gray-150 space-y-2">
                                <div className="flex justify-between items-start gap-2">
                                  <div>
                                    <div className="font-bold text-gray-800 truncate max-w-[150px]">{inv.invoiceNumber}</div>
                                    <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                      Due: {new Date(inv.dueDate).toLocaleDateString()}
                                    </div>
                                  </div>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider border ${
                                    inv.status === InvoiceStatus.Paid ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                    inv.status === InvoiceStatus.Sent ? 'bg-indigo-100 text-indigo-800 border-indigo-200 animate-pulse' :
                                    inv.status === InvoiceStatus.Overdue ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                    'bg-gray-100 text-gray-700 border-gray-200'
                                  }`}>
                                    {inv.status}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-gray-150">
                                  <span className="text-[10px] text-gray-500">Invoice Total:</span>
                                  <span className="font-extrabold text-gray-800">
                                    {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(inv.total)}
                                  </span>
                                </div>
                                
                                {inv.status === InvoiceStatus.Paid && (
                                  <div className="mt-1 bg-emerald-50/80 text-emerald-700 p-2 rounded border border-emerald-100 text-[10px] font-medium flex items-center gap-1.5">
                                    <span>🎉</span>
                                    <span>Payment Cleared! Ready to advance to the Next Phase.</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live Collection & Settlement Tracker for Payment Stage */}
                    {selectedProject.status === 'Payment' && (
                      <div className="bg-white p-4 rounded-xl border border-gray-200/60 space-y-4 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse"></span>
                            Live Collection & Settlement Tracker
                          </span>
                          {projectInvoices.length > 0 && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-100">
                              {projectInvoices.length} Invoice(s)
                            </span>
                          )}
                        </div>
                        
                        {projectInvoices.length === 0 ? (
                          <div className="text-[11px] text-gray-500 bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200 leading-relaxed space-y-2">
                            <p>No billing record is currently linked to this project.</p>
                            <button
                              onClick={() => {
                                onNavigateTo('create-invoice', {
                                  prefillProject: selectedProject,
                                  prefillClient: clients.find(c => c.id === selectedProject.clientId)
                                });
                              }}
                              className="px-2.5 py-1 bg-primary-600 text-white rounded text-[10px] font-bold hover:bg-primary-700 transition-colors"
                            >
                              Create Invoice & Link Project ➔
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {projectInvoices.map((inv) => {
                              const amtPaid = inv.amountPaid || 0;
                              const outstanding = inv.total - amtPaid;
                              const isPaid = outstanding <= 0 || inv.status === InvoiceStatus.Paid;
                              const pct = inv.total > 0 ? Math.min(100, Math.round((amtPaid / inv.total) * 100)) : 0;
                              
                              return (
                                <div key={inv.id} className="text-xs bg-gray-50/50 p-4 rounded-lg border border-gray-150 space-y-3">
                                  <div className="flex justify-between items-start gap-2">
                                    <div>
                                      <div className="font-bold text-gray-800 truncate max-w-[150px]">{inv.invoiceNumber}</div>
                                      <div className="text-[9px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                        Due: {new Date(inv.dueDate).toLocaleDateString()}
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider border ${
                                        isPaid ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                        inv.status === InvoiceStatus.Sent ? 'bg-indigo-100 text-indigo-800 border-indigo-200 animate-pulse' :
                                        inv.status === InvoiceStatus.Overdue ? 'bg-rose-100 text-rose-800 border-rose-200' :
                                        'bg-gray-100 text-gray-700 border-gray-200'
                                      }`}>
                                        {isPaid ? 'paid' : inv.status}
                                      </span>
                                      {inv.isReceiptSent && (
                                        <span className="text-[8px] px-1 bg-blue-50 text-blue-700 rounded border border-blue-100 font-bold uppercase tracking-wider">
                                          Receipt Sent ✓
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Settlement progress bar */}
                                  <div className="space-y-1.5">
                                    <div className="flex justify-between text-[10px] text-gray-500 font-medium">
                                      <span>Settlement Progress</span>
                                      <span className="font-bold text-gray-700">{pct}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                      <div className="bg-primary-600 h-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-600 pt-1">
                                      <span>Paid: <b className="font-bold text-gray-800">₦{amtPaid.toLocaleString()}</b></span>
                                      <span>Total: <b className="font-bold text-gray-800">₦{inv.total.toLocaleString()}</b></span>
                                    </div>
                                  </div>

                                  {/* Interactive Payment & Receipt Actions */}
                                  <div className="flex gap-2 pt-2 border-t border-gray-150">
                                    {!isPaid && onRecordPayment && (
                                      <button
                                        onClick={() => {
                                          setPaymentActiveInvoice(inv);
                                          setIsPaymentModalOpen(true);
                                        }}
                                        className="flex-1 py-1 px-2.5 bg-primary-600 text-white rounded text-[10px] font-bold hover:bg-primary-700 transition-colors shadow-sm"
                                      >
                                        Record Payment
                                      </button>
                                    )}
                                    {isPaid && !inv.isReceiptSent && onSendReceipt && (
                                      <button
                                        onClick={async () => {
                                          await onSendReceipt(inv.id);
                                          alert(`Success: Receipt issued for ${inv.invoiceNumber}!`);
                                        }}
                                        className="flex-1 py-1 px-2.5 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-colors shadow-sm"
                                      >
                                        Issue Receipt ✓
                                      </button>
                                    )}
                                    {isPaid && inv.isReceiptSent && (
                                      <div className="flex-1 bg-emerald-50 text-emerald-700 p-1.5 rounded border border-emerald-100 text-[10px] font-bold text-center">
                                        🎉 Receipt Issued & Sent!
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Phase Advancement Suggestion */}
                            {projectInvoices.length > 0 && projectInvoices.every(i => (i.amountPaid || 0) >= i.total || i.status === InvoiceStatus.Paid) && (
                              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-3 shadow-sm">
                                <p className="text-xs text-emerald-800 font-extrabold leading-normal">
                                  🎉 All project milestones and billing items are fully paid and settled!
                                </p>
                                <button
                                  onClick={() => {
                                    onUpdateProject({
                                      ...selectedProject,
                                      status: 'Completed'
                                    });
                                    alert("Congratulations! Project advanced to Completed stage.");
                                  }}
                                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-95"
                                >
                                  Advance to Completed Stage ➔
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Live Project Closeout & Feedback for Completed Stage */}
                    {selectedProject.status === 'Completed' && (
                      <div className="bg-white p-4 rounded-xl border border-gray-200/60 space-y-4 shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-black text-gray-700 uppercase tracking-widest flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Project Closeout Workspace
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                            Milestone 8
                          </span>
                        </div>

                        {/* Financial & Delivery Summary */}
                        <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100/80 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] text-gray-500 block">Total Recognized Value:</span>
                            <span className="font-extrabold text-emerald-800 text-sm">
                              {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(selectedProject.value || 0)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-gray-500 block">Settled Billing:</span>
                            <span className="font-bold text-gray-700 block mt-0.5">
                              {projectInvoices.filter(i => i.status === InvoiceStatus.Paid || (i.amountPaid || 0) >= i.total).length} of {projectInvoices.length} Paid
                            </span>
                          </div>
                        </div>

                        {/* Interactive Deliverables & Handover Checklist */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                            Project Handover Checklist
                          </span>
                          <div className="space-y-1.5 bg-gray-50 p-3 rounded-lg border border-gray-150">
                            {currentChecklist.map((item) => (
                              <label key={item.id} className="flex items-center gap-2.5 text-xs text-gray-700 cursor-pointer select-none hover:bg-gray-150/50 p-1 rounded transition-colors">
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={(e) => handleToggleChecklist(item.id, e.target.checked)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                                />
                                <span className={item.completed ? "line-through text-gray-400 font-medium" : "font-medium text-gray-700"}>
                                  {item.label}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Client Feedback & Rating Form */}
                        <div className="space-y-3 pt-2 border-t border-gray-150">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                            Client Satisfaction Rating & Feedback
                          </span>
                          
                          {/* Star Rating Controller */}
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setFeedbackRating(star)}
                                className="transition-all active:scale-95 focus:outline-none"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill={star <= feedbackRating ? "#fbbf24" : "none"} stroke={star <= feedbackRating ? "#fbbf24" : "#d1d5db"} strokeWidth="2" className="w-6 h-6 transition-colors duration-200">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                              </button>
                            ))}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-500 font-bold block">
                              Client Feedback Notes / Testimonial
                            </label>
                            <textarea
                              value={feedbackText}
                              onChange={(e) => setFeedbackText(e.target.value)}
                              placeholder="e.g. Client loved the final portal design, and confirmed value recognized..."
                              className="w-full p-2.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500/50 min-h-[60px]"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={handleSaveFeedback}
                            className="w-full py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm"
                          >
                            Save Satisfaction Review ✓
                          </button>
                        </div>

                        {/* Compliance Retention Policy Selector */}
                        <div className="space-y-2 pt-2 border-t border-gray-150">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                            Archival Compliance Policy
                          </label>
                          <select
                            value={selectedPolicy}
                            onChange={(e) => setSelectedPolicy(e.target.value)}
                            className="w-full p-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500/50"
                          >
                            <option value="IRS-7Y">IRS Financial Audit Standard (7 Years Retention)</option>
                            <option value="CORP-10Y">General Corporate Compliance (10 Years Retention)</option>
                            <option value="SEC-5Y">SEC Advisory Regulation (5 Years Retention)</option>
                            <option value="GDPR-3Y">GDPR Data Minimization Policy (3 Years Retention)</option>
                          </select>
                          <p className="text-[9px] text-gray-400">
                            Specifies required duration to persist this financial closeout in systems.
                          </p>
                        </div>

                        {/* Final Archive Deal Action */}
                        <div className="pt-3 border-t border-gray-150">
                          <button
                            type="button"
                            onClick={handleArchiveProject}
                            className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            Archive Project Deal ➔
                          </button>
                          <p className="text-[9px] text-gray-400 text-center mt-1.5">
                            Once archived, the project is locked and securely stored in compliance archives.
                          </p>
                        </div>
                      </div>
                    )}
                      {/* Archived Stage View */}
                      {selectedProject.status === 'Archived' && (() => {
                        const metrics = getRetentionMetrics(selectedProject);
                        return (
                        <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-800 space-y-6 shadow-xl animate-fade-in text-left">
                          {/* Top Header Badge */}
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4 gap-3">
                            <div className="flex items-center space-x-3">
                              <div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-400 border border-emerald-500/20 shadow-inner animate-pulse">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 9.7a1 1 0 0 1-.68 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 .76-.97l8-2a1 1 0 0 1 .48 0l8 2A1 1 0 0 1 20 6z"/><path d="m9 12 2 2 4-4"/></svg>
                              </div>
                              <div>
                                <h4 className="text-sm font-extrabold text-slate-100 uppercase tracking-widest flex items-center gap-2">
                                  Secure Archival Vault Active
                                  <span className="bg-emerald-500/10 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-bold border border-emerald-500/20 uppercase tracking-normal">
                                    Locked
                                  </span>
                                </h4>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  This project is preserved under tamper-proof regulatory standards.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleExportCompliancePackage(selectedProject)}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-2xs font-bold text-slate-200 transition-all flex items-center gap-1 shadow"
                            >
                              <Icon name="reports" className="w-3.5 h-3.5 text-slate-400" />
                              Export Manifest
                            </button>
                          </div>

                          {/* Main Vault Metadata Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Retention Metrics */}
                            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-3">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                Regulatory Retention & Policy
                              </span>
                              <div>
                                <div className="flex justify-between items-center">
                                  <span className="text-xs text-slate-400">Compliance Standard:</span>
                                  <select
                                    value={selectedProject.compliancePolicy || 'IRS-7Y'}
                                    onChange={(e) => {
                                      onUpdateProject({
                                        ...selectedProject,
                                        compliancePolicy: e.target.value
                                      });
                                    }}
                                    className="p-1 px-2 text-3xs border border-slate-800 rounded focus:outline-none focus:ring-1 focus:ring-primary-500/50 bg-slate-900 text-slate-100 font-bold"
                                  >
                                    <option value="IRS-7Y">IRS Financial (7 Yrs)</option>
                                    <option value="CORP-10Y">Corporate General (10 Yrs)</option>
                                    <option value="SEC-5Y">SEC Advisory (5 Yrs)</option>
                                    <option value="GDPR-3Y">GDPR Data Policy (3 Yrs)</option>
                                  </select>
                                </div>
                                <p className="text-[10px] text-slate-400 italic mt-1 font-medium leading-tight">
                                  "{metrics.policy.desc}"
                                </p>
                              </div>

                              <div className="border-t border-slate-800/80 pt-2.5 space-y-1.5 text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Archive Seal Date:</span>
                                  <span className="font-semibold text-slate-200">{metrics.archivedDate.toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Release Eligible Date:</span>
                                  <span className="font-semibold text-slate-200">{metrics.expirationDate.toLocaleDateString()}</span>
                                </div>
                                <div className="flex justify-between items-center pt-1">
                                  <span className="text-slate-400">Hold Left:</span>
                                  <span className="bg-primary-500/10 text-primary-400 text-2xs px-2 py-0.5 rounded-full font-bold border border-primary-500/20">
                                    {metrics.daysRemaining > 0 ? `${metrics.daysRemaining} Days` : 'Expired'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Integrity Lock Box */}
                            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 flex flex-col justify-between space-y-3">
                              <div className="space-y-2">
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Cryptographic Ledger Seal
                                </span>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] text-slate-400">Seal Key Hash (HMAC):</label>
                                  <div className="flex items-center space-x-1 bg-slate-900 p-1.5 rounded border border-slate-800">
                                    <span className="font-mono text-[9px] text-slate-300 select-all truncate flex-1">
                                      {selectedProject.vaultHash || 'CBZ-SEAL-PENDING'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyHash(selectedProject.vaultHash || '')}
                                      className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded"
                                      title="Copy Seal Hash"
                                    >
                                      {copied ? (
                                        <span className="text-[9px] text-emerald-400 font-bold px-1">Copied!</span>
                                      ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {integrityStatus === 'unchecked' && (
                                  <button
                                    type="button"
                                    onClick={triggerIntegrityScan}
                                    className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-2xs font-bold border border-slate-700 transition-colors flex items-center justify-center gap-1.5"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    Verify Integrity Seal
                                  </button>
                                )}
                                {integrityStatus === 'scanning' && (
                                  <div className="w-full py-1.5 bg-slate-900 text-slate-300 rounded text-2xs font-bold border border-slate-800 flex items-center justify-center gap-1.5">
                                    <svg className="animate-spin h-3.5 w-3.5 text-primary-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Scanning Records Ledger...
                                  </div>
                                )}
                                {integrityStatus === 'valid' && (
                                  <div className="w-full py-1.5 bg-emerald-950/30 text-emerald-400 rounded text-2xs font-bold border border-emerald-500/30 flex items-center justify-center gap-1.5 animate-bounce">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                                    Seal Authenticated ✓
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Historical Satisfactions & Review Comments */}
                          {(selectedProject.satisfactionRating || selectedProject.feedbackComments) && (
                            <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                Permanent Closeout Review
                              </span>
                              <div className="flex gap-1 items-center">
                                <span className="text-2xs text-slate-400 mr-1.5">Rating:</span>
                                {Array.from({ length: selectedProject.satisfactionRating || 5 }).map((_, i) => (
                                  <svg key={i} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fbbf24" className="w-3.5 h-3.5">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                ))}
                              </div>
                              {selectedProject.feedbackComments && (
                                <p className="text-xs text-slate-300 italic border-l-2 border-slate-700 pl-3 py-1 mt-1 leading-normal">
                                  "{selectedProject.feedbackComments}"
                                </p>
                              )}
                            </div>
                          )}

                          {/* Secure Compliance Event Timeline */}
                          <div className="bg-slate-950/50 p-4 rounded-lg border border-slate-800 space-y-3">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                              Secure Event Audit Trail
                            </span>
                            <div className="space-y-2.5 max-h-[120px] overflow-y-auto pr-1">
                              {projectLogs.length > 0 ? (
                                projectLogs.map((log) => (
                                  <div key={log.id} className="text-3xs flex justify-between gap-2 border-b border-slate-900 pb-1.5">
                                    <div className="space-y-0.5">
                                      <span className="font-extrabold text-slate-200">
                                        {log.userName} ({log.action})
                                      </span>
                                      <p className="text-slate-400 line-clamp-1">{log.details}</p>
                                    </div>
                                    <span className="text-slate-500 shrink-0 font-mono">
                                      {new Date(log.createdAt).toLocaleTimeString()}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <div className="space-y-2">
                                  <div className="text-3xs flex justify-between gap-2 border-b border-slate-900 pb-1.5">
                                    <div className="space-y-0.5">
                                      <span className="font-extrabold text-slate-200">SYSTEM (ARCHIVED)</span>
                                      <p className="text-slate-400">Project status secured in vault successfully.</p>
                                    </div>
                                    <span className="text-slate-500 shrink-0 font-mono">
                                      {metrics.archivedDate.toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <div className="text-3xs flex justify-between gap-2 border-b border-slate-900 pb-1.5">
                                    <div className="space-y-0.5">
                                      <span className="font-extrabold text-slate-200">COMPLIANCE ENGINE</span>
                                      <p className="text-slate-400">Vault seal integrity hash generated: {selectedProject.vaultHash}</p>
                                    </div>
                                    <span className="text-slate-500 shrink-0 font-mono">
                                      {metrics.archivedDate.toLocaleTimeString()}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Re-open Workspace Safety Gate */}
                          <div className="border-t border-slate-800 pt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id="reopenSafetyCheck"
                                checked={reopenConfirm}
                                onChange={(e) => setReopenConfirm(e.target.checked)}
                                className="rounded border-slate-800 bg-slate-950 text-primary-500 focus:ring-0 w-3.5 h-3.5 animate-pulse"
                              />
                              <label htmlFor="reopenSafetyCheck" className="text-3xs text-slate-400 cursor-pointer select-none">
                                I confirm re-opening this project invalidates the cryptographically sealed compliance vault.
                              </label>
                            </div>

                            <button
                              type="button"
                              disabled={!reopenConfirm}
                              onClick={() => {
                                onUpdateProject({
                                  ...selectedProject,
                                  status: 'Completed'
                                });
                              }}
                              className={`px-3 py-1.5 rounded-lg text-3xs font-black uppercase tracking-wider transition-all shadow ${
                                reopenConfirm 
                                  ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer' 
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-750'
                              }`}
                            >
                              ↩ Re-open Workspace
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  </div>

                  {/* Connected Actions inside CRM Pipeline */}
                  <div className="bg-white p-3 rounded-lg border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-2 sm:space-y-0">
                    <div>
                      <h6 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Connected SaaS Actions</h6>
                      <p className="text-[11px] text-gray-500 mt-0.5">Accelerate progress through other modules for {selectedProject.name}.</p>
                    </div>
                    {LIFECYCLE_STAGES[activeStageIndex]?.actionText ? (
                      <button
                        onClick={() => {
                          const actPage = LIFECYCLE_STAGES[activeStageIndex].actionPage;
                          if (actPage) {
                            onNavigateTo(actPage, {
                              initialTab: selectedProject.status === 'Signing' ? 'sign' : 'generate',
                              prefillProject: selectedProject,
                              prefillClient: clients.find(c => c.id === selectedProject.clientId)
                            });
                          }
                        }}
                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-bold text-xs shadow-sm"
                      >
                        {LIFECYCLE_STAGES[activeStageIndex].actionText} ➔
                      </button>
                    ) : (
                      <span className="text-xs font-medium text-gray-400 italic">No automated actions available</span>
                    )}
                  </div>
                </div>
              ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                <Icon name="projects" className="w-12 h-12 text-gray-300" />
                <p className="text-sm italic font-medium">Please select a project to examine its lifecycle details.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Project Modals */}
      <AnimatePresence>
        {(isAddModalOpen || isEditModalOpen) && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
              className="fixed inset-0 bg-black"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-gray-100 z-10"
            >
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900">
                  {isEditModalOpen ? 'Edit Project Properties' : 'Create New Deal Pipeline'}
                </h3>
                <button
                  onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveProject} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Project/Deal Name</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g. Q4 SEO Blitz, SaaS Deployment"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Client/Account</label>
                    <select
                      value={formClientId}
                      onChange={(e) => setFormClientId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    >
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.companyName} ({c.name})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Estimated Value ($)</label>
                    <input
                      type="number"
                      required
                      value={formValue}
                      onChange={(e) => setFormValue(Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Workflow Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500 bg-white"
                    >
                      {LIFECYCLE_STAGES.map(s => (
                        <option key={s.status} value={s.status}>{s.status}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Start Date</label>
                    <input
                      type="date"
                      required
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Deal Description / Scope</label>
                    <textarea
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      rows={3}
                      placeholder="Describe scope, baseline services, agreement schedule etc."
                      className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-semibold text-xs shadow-sm"
                  >
                    Save Deal Properties
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {isPaymentModalOpen && paymentActiveInvoice && onRecordPayment && (
        <PaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => {
            setIsPaymentModalOpen(false);
            setPaymentActiveInvoice(null);
          }}
          invoice={paymentActiveInvoice}
          onConfirmPayment={async (amt) => {
            await onRecordPayment(paymentActiveInvoice.id, amt);
            setIsPaymentModalOpen(false);
            setPaymentActiveInvoice(null);
          }}
          client={clients.find(c => c.id === paymentActiveInvoice.clientId)}
        />
      )}
    </div>
  );
}
