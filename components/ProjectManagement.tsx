import React, { useState, useMemo } from 'react';
import { Project, ProjectStatus, Client, StoredGeneratedDoc } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import Icon from './common/Icon';

interface ProjectManagementProps {
  companyId: string;
  projects: Project[];
  clients: Client[];
  generatedDocs?: StoredGeneratedDoc[];
  onAddProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
  onUpdateProject: (project: Project) => void;
  onDeleteProject: (companyId: string, projectId: string) => void;
  onNavigateTo: (page: string, props?: any) => void;
}

const LIFECYCLE_STAGES: { status: ProjectStatus; label: string; desc: string; icon: string; actionText?: string; actionPage?: string }[] = [
  { status: 'Planning', label: '1. Planning', desc: 'Identify goals, define scope, and estimate baseline service requirements.', icon: 'dashboard' },
  { status: 'Proposal', label: '2. Proposal', desc: 'Draft and send smart document proposal with detailed quotes.', icon: 'edit', actionText: 'Create Proposal Document', actionPage: 'document-transformer' },
  { status: 'Negotiation', label: '3. Negotiation', desc: 'Collaborate on adjustments, prices, and service schedules.', icon: 'repeat' },
  { status: 'Contract', label: '4. Contract', desc: 'Review legal clauses, security, and payment terms.', icon: 'edit', actionText: 'Generate Agreement Contract', actionPage: 'document-transformer' },
  { status: 'Signing', label: '5. Signing', desc: 'Collect secure electronic signatures through DocSignify.', icon: 'clients', actionText: 'Collect Electronic Signatures', actionPage: 'document-transformer' },
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

export default function ProjectManagement({
  companyId,
  projects,
  clients,
  generatedDocs = [],
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  onNavigateTo
}: ProjectManagementProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(projects[0]?.id || null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

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
    </div>
  );
}
