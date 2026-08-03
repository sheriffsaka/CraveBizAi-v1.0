import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Mail, Check, Trash2, UserCheck, ArrowRight, Sparkles, PenTool, 
  FileText, Download, Eye, Link as LinkIcon, Copy, RefreshCw, ShieldCheck, 
  Clock, Plus, Search, AlertCircle, Calendar, Type, CheckSquare, X, ChevronRight,
  Send, ExternalLink, FileCheck, Layers, FileCode
} from 'lucide-react';
import { api } from '../lib/api';
import { SigningWorkflowTester } from './SigningWorkflowTester';
import { DocumentSignifyViewer, PreparedField } from './DocumentSignifyViewer';
import { overlaySignaturesOnPdf, downloadPdfBytes } from '../lib/pdfOverlay';
import { Company, User, GeneratedDocument, DbDocument, DbDocumentSignatory, SignatureInfo } from '../types';

interface DocSignifyProps {
  company: Company | null;
  user: User | null;
  prefillProject?: any;
  prefillClient?: any;
  initialFile?: GeneratedDocument | null;
  onBackToDashboard?: () => void;
}

interface DashboardDocItem {
  document: DbDocument;
  signatories: DbDocumentSignatory[];
  signaturesCount: number;
}

export default function DocSignify({ company, user, prefillProject, prefillClient, initialFile, onBackToDashboard }: DocSignifyProps) {
  // Main view navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'wizard' | 'tester'>(initialFile ? 'wizard' : 'dashboard');
  const [wizardStep, setWizardStep] = useState<'upload' | 'prepare' | 'complete'>('upload');
  const [signingOrder, setSigningOrder] = useState<'owner_first' | 'owner_last'>('owner_first');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Dashboard state
  const [documentsList, setDocumentsList] = useState<DashboardDocItem[]>([]);
  const [dashboardFilter, setDashboardFilter] = useState<'all' | 'draft' | 'pending' | 'viewed' | 'completed' | 'expired'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);

  // Audit / Review Modal state
  const [reviewDocItem, setReviewDocItem] = useState<DashboardDocItem | null>(null);
  const [verificationDetails, setVerificationDetails] = useState<any>(null);
  const [isLoadingVerification, setIsLoadingVerification] = useState(false);

  // Document State for Wizard
  const [documentFile, setDocumentFile] = useState<GeneratedDocument | null>(initialFile || null);
  const [fileName, setFileName] = useState<string>('');
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileType, setFileType] = useState<string>('pdf');
  const [fileUrl, setFileUrl] = useState<string>('');

  // Signers State
  const [signers, setSigners] = useState<SignatureInfo[]>([]);
  const [newSignerName, setNewSignerName] = useState('');
  const [newSignerEmail, setNewSignerEmail] = useState('');
  const [newSignerRole, setNewSignerRole] = useState<'Main' | 'Witness'>('Main');
  const [emailValidationError, setEmailValidationError] = useState<string | null>(null);

  // Custom Fields (Designer)
  const [fields, setFields] = useState<PreparedField[]>([]);
  const [activeSignerId, setActiveSignerId] = useState<string>('');
  const [selectedFieldType, setSelectedFieldType] = useState<PreparedField['type']>('signature');
  const [inviteLinks, setInviteLinks] = useState<{ name: string; email: string; url: string }[]>([]);

  // Email customization
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');

  // Zoom and Canvas Page controls
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Load dashboard documents list
  const loadDashboardDocuments = async () => {
    setIsLoadingDashboard(true);
    try {
      const items = await api.getAllDocSignifyDocuments(company?.id);
      setDocumentsList(items || []);
    } catch (err) {
      console.error("Failed loading DocSignify documents:", err);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  useEffect(() => {
    loadDashboardDocuments();
  }, [company?.id]);

  useEffect(() => {
    if (initialFile) {
      setDocumentFile(initialFile);
      setFileName(initialFile.originalFileName || 'document.pdf');
      setFileBase64(initialFile.originalFileBase64 || '');
      setFileType(initialFile.originalFileType || 'pdf');
      setFileUrl(initialFile.originalFileUrl || '');
      setEmailSubject(`Signature Request: ${initialFile.documentType || 'Agreement Document'}`);
      setWizardStep('upload');
      setActiveTab('wizard');
    }
  }, [initialFile]);

  // Auto-add current user as default signer
  useEffect(() => {
    if (user && signers.length === 0) {
      const myself: SignatureInfo = {
        id: 'myself',
        name: user.name || 'Myself',
        email: user.email || '',
        title: 'Authorized Signatory',
        date: '',
        signatoryType: 'Main',
        isSigned: false,
        type: 'type',
        value: ''
      };
      setSigners([myself]);
      setActiveSignerId('myself');
    }
  }, [user]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  // Handle file selection / upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64Data = (reader.result as string).split(',')[1];
        let mimeType = 'pdf';
        if (file.name.endsWith('.docx') || file.type.includes('word')) {
          mimeType = 'docx-html';
        } else if (/\.(png|jpe?g|webp)$/i.test(file.name) || file.type.includes('image')) {
          mimeType = file.type.split('/')[1] || 'png';
        }

        setFileName(file.name);
        setFileBase64(base64Data);
        setFileType(mimeType);

        // Upload to server storage
        const cloudUrl = await api.uploadDocSignifyFile(file.name, base64Data, mimeType, company?.id);
        const resolvedUrl = cloudUrl || "/uploads/placeholder_document.pdf";
        
        // Use base64 data URI for instant local PDF rendering if PDF
        if (mimeType === 'pdf' || mimeType.includes('pdf')) {
          setFileUrl(`data:application/pdf;base64,${base64Data}`);
        } else {
          setFileUrl(resolvedUrl);
        }

        const newDoc: GeneratedDocument = {
          documentType: file.name.replace(/\.[^/.]+$/, "") || "Uploaded Document",
          blocks: [{ id: 'block_0', type: 'paragraph', content: { text: `Uploaded Document: ${file.name}` } }],
          originalFileBase64: base64Data,
          originalFileType: mimeType,
          originalFileName: file.name,
          originalFileUrl: resolvedUrl
        };
        setDocumentFile(newDoc);
        if (!emailSubject) {
          setEmailSubject(`Signature Request: ${file.name.replace(/\.[^/.]+$/, "")}`);
        }
        showToast("📄 Document uploaded & rendered successfully!");
      } catch (err: any) {
        console.error("DocSignify file upload error:", err);
        setError(err.message || "Failed to parse file.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Signer management
  const handleAddSigner = () => {
    setEmailValidationError(null);
    if (!newSignerName.trim()) {
      showToast("⚠️ Please enter the signer's full name.");
      return;
    }
    if (!newSignerEmail.trim() || !validateEmail(newSignerEmail)) {
      setEmailValidationError("Please provide a valid email address (e.g. name@company.com)");
      return;
    }

    const newSigner: SignatureInfo = {
      id: 'signer_' + Date.now(),
      name: newSignerName.trim(),
      email: newSignerEmail.trim(),
      title: newSignerRole === 'Main' ? 'Authorized Counterparty' : 'Witness',
      date: '',
      signatoryType: newSignerRole,
      isSigned: false,
      type: 'type',
      value: ''
    };

    setSigners(prev => [...prev, newSigner]);
    if (!activeSignerId) {
      setActiveSignerId(newSigner.id);
    }
    setNewSignerName('');
    setNewSignerEmail('');
    showToast(`👤 Added ${newSigner.name} to the recipient list.`);
  };

  const handleRemoveSigner = (id: string) => {
    setSigners(prev => prev.filter(s => s.id !== id));
    setFields(prev => prev.filter(f => f.assigned_signer_id !== id));
    if (activeSignerId === id) {
      const remaining = signers.filter(s => s.id !== id);
      setActiveSignerId(remaining[0]?.id || '');
    }
    showToast("Removed signer and associated fields.");
  };

  // Add field to canvas
  const handlePlaceField = (pageNum: number, x: number, y: number, overrideType?: PreparedField['type']) => {
    if (!activeSignerId) {
      showToast("⚠️ Please select an active signer from the left menu first.");
      return;
    }

    const activeSigner = signers.find(s => s.id === activeSignerId);
    const signerName = activeSigner ? activeSigner.name : "Signer";
    const fieldType = overrideType || selectedFieldType || 'signature';

    // Standard width/height defaults based on simplified field types
    let width = 140;
    let height = 55;
    if (fieldType === 'date') {
      width = 130;
      height = 36;
    }

    const newField: PreparedField = {
      id: 'field_' + Math.floor(Math.random() * 899999 + 100000),
      type: fieldType,
      page_number: pageNum,
      x_position: x,
      y_position: y,
      width,
      height,
      assigned_signer_id: activeSignerId,
      required: true
    };

    setFields(prev => [...prev, newField]);
    showToast(`Placed ${fieldType === 'signature' ? 'Signature' : 'Date'} field for ${signerName} on Page ${pageNum}`);
  };

  const handleFieldMove = (id: string, pageNum: number, x: number, y: number) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, page_number: pageNum, x_position: x, y_position: y } : f));
  };

  const handleFieldResize = (id: string, w: number, h: number) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, width: w, height: h } : f));
  };

  const handleFieldDelete = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    showToast("Field removed from canvas.");
  };

  const handleDownloadSignedPdf = async (item: DashboardDocItem) => {
    try {
      setIsLoading(true);
      showToast("Preparing signed PDF document...");
      const doc = item.document;
      const fields = doc.content_json?.fields || [];
      const sourcePdf = doc.original_file_url || doc.signed_file_url;
      if (!sourcePdf) {
        showToast("PDF source file not found.");
        return;
      }
      const pdfBytes = await overlaySignaturesOnPdf(sourcePdf, fields);
      downloadPdfBytes(pdfBytes, `${doc.title || 'signed_document'}.pdf`);
      showToast("Downloaded signed PDF!");
    } catch (err: any) {
      console.error("Error generating signed PDF overlay:", err);
      if (item.document.signed_file_url || item.document.original_file_url) {
        window.open(item.document.signed_file_url || item.document.original_file_url, '_blank');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Proceed to Step 2
  const handleProceedToPrepare = () => {
    if (!documentFile || !fileUrl) {
      showToast("⚠️ Please upload a document first.");
      return;
    }
    if (signers.length === 0) {
      showToast("⚠️ Please configure at least one signer.");
      return;
    }
    setWizardStep('prepare');
  };

  // Finalize and Dispatch
  const handleFinalizeAndSend = async () => {
    if (fields.length === 0) {
      showToast("⚠️ Please place at least one field on the document.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const docId = 'doc_' + Math.floor(Math.random() * 899999 + 100000);
      const resolvedFileName = fileName || 'secured_agreement.pdf';
      const resolvedFileType = fileType || 'pdf';

      const idMapping: { [key: string]: string } = {
        'myself': user?.id || 'myself_owner'
      };

      const mappedSigs = signers.map(s => {
        const isMyself = s.id === 'myself' || (user?.email && s.email?.toLowerCase() === user.email.toLowerCase());
        const dbId = isMyself ? (user?.id || 'owner_id') : ('signer_' + Math.floor(Math.random() * 899999 + 100000));
        idMapping[s.id] = dbId;
        return {
          id: dbId,
          name: s.name,
          email: s.email || `${s.name.toLowerCase().replace(/\s/g, '')}@cravebiz.com`,
          role: (isMyself ? 'owner' : (s.signatoryType === 'Main' ? 'main_signatory' : 'witness')) as DbDocumentSignatory['role']
        };
      });

      const mappedFields = fields.map(f => ({
        ...f,
        assigned_signer_id: idMapping[f.assigned_signer_id] || f.assigned_signer_id,
        value: f.value || null
      }));

      const contentJson = {
        fields: mappedFields,
        brandColor: "#4f46e5",
        subject: emailSubject,
        message: emailMessage,
        signing_order: signingOrder
      };

      const response = await api.createDocSignifyDocument(
        docId,
        documentFile?.documentType || "Secured Agreement",
        fileUrl || "/uploads/placeholder_document.pdf",
        user?.id || 'admin',
        resolvedFileType,
        resolvedFileName,
        mappedSigs,
        contentJson,
        company?.id
      );

      if (response && response.document) {
        // Dispatch invitation emails
        try {
          await fetch("/api/signify/send-emails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              docId,
              title: documentFile?.documentType || "Secured Agreement",
              signatories: response.signatories
            })
          });
        } catch (emailErr) {
          console.warn("Backend email dispatch warning:", emailErr);
        }

        const links = response.signatories.map(sig => ({
          name: sig.name,
          email: sig.email,
          url: `${window.location.origin}/?token=${sig.token}`
        }));
        setInviteLinks(links);

        setWizardStep('complete');
        loadDashboardDocuments();
        showToast("🎉 Document envelope created & dispatches sent!");
      } else {
        throw new Error("Failed to register document envelope.");
      }
    } catch (err: any) {
      console.error("DocSignify Send Error:", err);
      setError("Failed to create e-sign session: " + (err.message || err));
    } finally {
      setIsLoading(false);
    }
  };

  // Delete document item from dashboard
  const handleDeleteDoc = async (docId: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"? This action cannot be undone.`)) {
      const success = await api.deleteDocSignifyDocument(docId, company?.id);
      if (success) {
        showToast("Document deleted successfully.");
        loadDashboardDocuments();
      } else {
        showToast("Failed to delete document.");
      }
    }
  };

  // Open Document Audit & Review Modal
  const handleOpenReview = async (item: DashboardDocItem) => {
    setReviewDocItem(item);
    setIsLoadingVerification(true);
    setVerificationDetails(null);
    try {
      const res = await api.verifyDocSignifyDocument(item.document.id);
      setVerificationDetails(res);
    } catch (err) {
      console.warn("Verification fetch failed:", err);
    } finally {
      setIsLoadingVerification(false);
    }
  };

  // Resend invitation email
  const handleResendEmail = async (docId: string, title: string, signatories: DbDocumentSignatory[]) => {
    try {
      showToast(`✉️ Resending invitation emails for ${title}...`);
      await fetch("/api/signify/send-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, title, signatories })
      });
      showToast("🎉 Invitation emails resent successfully!");
    } catch (err) {
      showToast("Failed to resend invitations.");
    }
  };

  // Dashboard filtering & KPI calculations
  const filteredDocs = documentsList.filter(item => {
    const doc = item.document;
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.signatories.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || s.email.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (dashboardFilter === 'all') return true;
    return doc.status === dashboardFilter;
  });

  const kpiTotal = documentsList.length;
  const kpiPending = documentsList.filter(d => d.document.status === 'pending' || d.document.status === 'partially_signed' || d.document.status === 'viewed').length;
  const kpiCompleted = documentsList.filter(d => d.document.status === 'completed').length;
  const kpiDrafts = documentsList.filter(d => d.document.status === 'draft').length;

  const getStatusBadge = (status: DbDocument['status']) => {
    switch (status) {
      case 'completed':
        return <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-extrabold uppercase border border-emerald-200/60 flex items-center gap-1"><FileCheck className="w-3 h-3" /> Completed</span>;
      case 'partially_signed':
        return <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-extrabold uppercase border border-indigo-200/60 flex items-center gap-1"><Clock className="w-3 h-3" /> In Progress</span>;
      case 'viewed':
        return <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[10px] font-extrabold uppercase border border-amber-200/60 flex items-center gap-1"><Eye className="w-3 h-3" /> Viewed</span>;
      case 'pending':
        return <span className="px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 text-[10px] font-extrabold uppercase border border-sky-200/60 flex items-center gap-1"><Send className="w-3 h-3" /> Sent</span>;
      case 'declined':
        return <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-extrabold uppercase border border-red-200/60 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Declined</span>;
      default:
        return <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold uppercase border border-slate-200 flex items-center gap-1"><FileText className="w-3 h-3" /> Draft</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-800 text-xs font-extrabold animate-in fade-in slide-in-from-bottom-4 flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main App Bar Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200/80 pb-5 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-200">
              <PenTool className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                DocSignify
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-100">
                  E-Signature Suite
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Enterprise document signing, real-time tracking, and automated audit compliance.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Document Tracker ({documentsList.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('wizard');
                setWizardStep('upload');
              }}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'wizard'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              New Document
            </button>
            <button
              onClick={() => setActiveTab('tester')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'tester'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Workflow Tester
            </button>
          </div>

          {onBackToDashboard && (
            <button
              onClick={onBackToDashboard}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
            >
              Back
            </button>
          )}
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700">✕</button>
        </div>
      )}

      {/* TAB 1: DASHBOARD & TRACKER */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* KPI Metrics Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Envelopes</p>
              <p className="text-2xl font-black text-slate-900">{kpiTotal}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Registered in system</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <p className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Awaiting Signatures</p>
              <p className="text-2xl font-black text-amber-600">{kpiPending}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Sent & pending actions</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <p className="text-[10px] font-black uppercase text-emerald-600 tracking-wider">Completed & Certified</p>
              <p className="text-2xl font-black text-emerald-600">{kpiCompleted}</p>
              <p className="text-[10px] text-slate-400 font-semibold">Fully executed documents</p>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-1">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Draft Envelopes</p>
              <p className="text-2xl font-black text-slate-700">{kpiDrafts}</p>
              <p className="text-[10px] text-slate-400 font-semibold">In preparation</p>
            </div>
          </div>

          {/* Search Bar & Status Filter Pills */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search documents by title or recipient name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'all', label: 'All' },
                { id: 'pending', label: 'Pending / Sent' },
                { id: 'viewed', label: 'Viewed' },
                { id: 'completed', label: 'Completed' },
                { id: 'draft', label: 'Drafts' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDashboardFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    dashboardFilter === tab.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              <button
                onClick={loadDashboardDocuments}
                className="p-2 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors ml-2"
                title="Refresh List"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDashboard ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Documents Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {isLoadingDashboard ? (
              <div className="p-12 text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mx-auto"></div>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading documents library...</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="p-3 bg-slate-50 text-slate-400 rounded-full inline-block">
                  <FileText className="w-8 h-8 mx-auto" />
                </div>
                <p className="text-sm font-bold text-slate-800">No documents found</p>
                <p className="text-xs text-slate-400 font-semibold max-w-sm mx-auto">
                  {searchQuery ? "No agreements match your search keywords." : "Upload a new agreement or contract to initiate an e-sign workflow."}
                </p>
                <button
                  onClick={() => {
                    setActiveTab('wizard');
                    setWizardStep('upload');
                  }}
                  className="mt-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Create New Document
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200/80 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-4">Document / Title</th>
                      <th className="py-3 px-4">Signers Progress</th>
                      <th className="py-3 px-4">Date Created</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                    {filteredDocs.map((item) => {
                      const doc = item.document;
                      const sigs = item.signatories;
                      const signedCount = sigs.filter(s => s.status === 'signed').length;
                      const totalSigs = sigs.length;

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 shrink-0">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div className="truncate max-w-xs">
                                <p className="font-extrabold text-slate-900 truncate">{doc.title}</p>
                                <p className="text-[10px] text-slate-400 font-mono truncate">{doc.file_name || doc.id}</p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-800">
                                <span>{signedCount} of {totalSigs} Signed</span>
                                <span className="text-[10px] text-slate-400 font-mono">({Math.round((signedCount / (totalSigs || 1)) * 100)}%)</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {sigs.map((s, idx) => (
                                  <span
                                    key={s.id || idx}
                                    title={`${s.name} (${s.email}): ${s.status}`}
                                    className={`w-2.5 h-2.5 rounded-full border ${
                                      s.status === 'signed'
                                        ? 'bg-emerald-500 border-emerald-600'
                                        : s.status === 'viewed'
                                        ? 'bg-amber-400 border-amber-500'
                                        : 'bg-slate-200 border-slate-300'
                                    }`}
                                  />
                                ))}
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                            {new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </td>

                          <td className="py-3.5 px-4">
                            {getStatusBadge(doc.status)}
                          </td>

                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Audit & Review Modal */}
                              <button
                                onClick={() => handleOpenReview(item)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Review Audit & Document"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Download Signed Document */}
                              <button
                                onClick={() => handleDownloadSignedPdf(item)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Download Signed PDF Document"
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {/* Resend email invitations */}
                              <button
                                onClick={() => handleResendEmail(doc.id, doc.title, sigs)}
                                className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                title="Resend Invitation Emails"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </button>

                              {/* Delete document */}
                              <button
                                onClick={() => handleDeleteDoc(doc.id, doc.title)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete Document"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: WIZARD */}
      {activeTab === 'wizard' && (
        <div className="space-y-6">
          {/* Step Progress Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-xs font-extrabold text-slate-400 max-w-2xl mx-auto">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-black ${
                  wizardStep === 'upload' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-emerald-500 border-emerald-500 text-white'
                }`}>
                  {documentFile ? '✓' : '1'}
                </div>
                <span className={wizardStep === 'upload' ? 'text-indigo-600 font-extrabold' : 'text-slate-700'}>
                  1. Upload & Signers
                </span>
              </div>

              <div className="flex-1 h-0.5 bg-slate-100 mx-4">
                <div className={`h-full bg-indigo-600 transition-all ${wizardStep !== 'upload' ? 'w-full' : 'w-0'}`}></div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-black ${
                  wizardStep === 'prepare' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' : wizardStep === 'complete' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}>
                  {wizardStep === 'complete' ? '✓' : '2'}
                </div>
                <span className={wizardStep === 'prepare' ? 'text-indigo-600 font-extrabold' : 'text-slate-500'}>
                  2. Place Fields & Sign
                </span>
              </div>

              <div className="flex-1 h-0.5 bg-slate-100 mx-4">
                <div className={`h-full bg-indigo-600 transition-all ${wizardStep === 'complete' ? 'w-full' : 'w-0'}`}></div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs font-black ${
                  wizardStep === 'complete' ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}>
                  3
                </div>
                <span className={wizardStep === 'complete' ? 'text-indigo-600 font-extrabold' : 'text-slate-500'}>
                  3. Send & Dispatches
                </span>
              </div>
            </div>
          </div>

          {/* STEP 1: UPLOAD & SIGNERS */}
          {wizardStep === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* File Upload Zone */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  Step 1: Upload Document File
                </h2>

                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  Upload standard PDF or Word (.docx) documents. The file will be displayed in crisp high fidelity.
                </p>

                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 hover:border-indigo-500/50 hover:bg-indigo-50/20 transition-all text-center cursor-pointer relative group">
                  <input
                    type="file"
                    accept=".pdf,.docx,image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isLoading}
                  />
                  <div className="space-y-3">
                    <div className="p-3 bg-indigo-50 rounded-full inline-block text-indigo-600 group-hover:scale-110 transition-transform">
                      <Upload className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-xs font-extrabold text-slate-800">
                        {fileName ? `Loaded: ${fileName}` : "Click to select or drag document file here"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                        Supports PDF, DOCX, PNG, JPEG up to 25MB
                      </p>
                    </div>
                  </div>
                </div>

                {documentFile && (
                  <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200/80 flex items-center gap-2.5 text-emerald-800 text-xs font-extrabold">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate">Ready for field placement: {fileName}</span>
                  </div>
                )}
              </div>

              {/* Configure Signers */}
              <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-5">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  Step 2: Add Document Signers
                </h2>

                {/* New Signer Input */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Add Recipient Signer</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="Full Name"
                        value={newSignerName}
                        onChange={(e) => setNewSignerName(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={newSignerEmail}
                        onChange={(e) => {
                          setNewSignerEmail(e.target.value);
                          setEmailValidationError(null);
                        }}
                        className={`w-full p-2.5 border rounded-xl text-xs font-bold bg-white text-slate-800 focus:outline-none ${
                          emailValidationError ? 'border-red-400 bg-red-50/20' : 'border-slate-200 focus:border-indigo-500'
                        }`}
                      />
                      {emailValidationError && (
                        <p className="text-[10px] text-red-500 font-bold mt-1">{emailValidationError}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={newSignerRole === 'Main'}
                          onChange={() => setNewSignerRole('Main')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Main Signer
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          checked={newSignerRole === 'Witness'}
                          onChange={() => setNewSignerRole('Witness')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        Witness
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddSigner}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm"
                    >
                      Add Signer
                    </button>
                  </div>
                </div>

                {/* Active Signers List */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Configured Recipients ({signers.length})</p>
                  <div className="divide-y divide-slate-100">
                    {signers.map((s, index) => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-black flex items-center justify-center text-xs border border-indigo-100">
                            {index + 1}
                          </div>
                          <div>
                            <p className="text-xs font-extrabold text-slate-900">
                              {s.name} {s.id === 'myself' && <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-bold ml-1">Myself</span>}
                            </p>
                            <p className="text-[10px] text-slate-400 font-semibold">{s.email} • {s.signatoryType}</p>
                          </div>
                        </div>

                        {s.id !== 'myself' && (
                          <button
                            onClick={() => handleRemoveSigner(s.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signing Order Selection */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Configurable Signing Order</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div
                      onClick={() => setSigningOrder('owner_first')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        signingOrder === 'owner_first'
                          ? 'bg-indigo-50/60 border-indigo-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="signingOrder"
                          checked={signingOrder === 'owner_first'}
                          onChange={() => setSigningOrder('owner_first')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-extrabold text-slate-900">Option A: Owner Signs First</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 pl-5 leading-relaxed font-medium">
                        Workspace Owner signs first, then the document is automatically sent to the invited recipients.
                      </p>
                    </div>

                    <div
                      onClick={() => setSigningOrder('owner_last')}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        signingOrder === 'owner_last'
                          ? 'bg-indigo-50/60 border-indigo-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="signingOrder"
                          checked={signingOrder === 'owner_last'}
                          onChange={() => setSigningOrder('owner_last')}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-extrabold text-slate-900">Option B: Owner Signs Last</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 pl-5 leading-relaxed font-medium">
                        Invited recipients receive document first. After all signers complete, Owner is notified to sign last.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Proceed Button */}
                <button
                  onClick={handleProceedToPrepare}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <span>Prepare Fields & Sign Document</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Immediate Document Preview Section (Renders immediately upon upload) */}
              {fileUrl && (
                <div className="lg:col-span-12 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                    <div>
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Immediate Document Preview ({fileName || 'Uploaded PDF'})
                      </h3>
                      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                        Every page of your uploaded document is rendered live below. Click "Prepare Fields & Sign Document" to place signatures.
                      </p>
                    </div>

                    <button
                      onClick={handleProceedToPrepare}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md inline-flex items-center gap-1.5"
                    >
                      <span>Prepare Fields & Place Signatures</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 min-h-[550px] flex justify-center overflow-auto">
                    <DocumentSignifyViewer
                      fileUrl={fileUrl}
                      fileType={fileType}
                      fields={fields}
                      signatories={signers.map(s => ({
                        id: s.id,
                        document_id: 'doc_temp',
                        name: s.name,
                        email: s.email,
                        role: s.signatoryType === 'Main' ? 'main_signatory' : 'witness',
                        token: 'token_' + s.id,
                        status: 'pending',
                        signed_at: null
                      }))}
                      isDesignerMode={false}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREPARE & INTERACTIVE DESIGNER */}
          {wizardStep === 'prepare' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Toolbar & Signer Selector */}
              <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
                <div>
                  <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2">
                    Signature & Date Fields Palette
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold mt-1">
                    Select a recipient, pick a field, then drag or click on the document page on the right to drop it.
                  </p>
                </div>

                {/* Active Signer Palette Selector */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Select Active Recipient:
                  </label>
                  <div className="space-y-2">
                    {signers.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setActiveSignerId(s.id)}
                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                          activeSignerId === s.id
                            ? 'border-indigo-600 bg-indigo-50/40 shadow-sm ring-1 ring-indigo-500'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">{s.name}</p>
                          <p className="text-[10px] text-slate-400 font-semibold">{s.email}</p>
                        </div>
                        {activeSignerId === s.id && (
                          <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Field Presets (Restricted to Signature and Date Fields) */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Available Fields (Drag or Click):
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { type: 'signature', label: '✍️ Signature', desc: 'Signature box' },
                      { type: 'date', label: '📅 Date Signed', desc: 'Date box' }
                    ].map(f => (
                      <button
                        key={f.type}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('field-type', f.type);
                        }}
                        onClick={() => setSelectedFieldType(f.type as any)}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-left cursor-grab active:cursor-grabbing ${
                          selectedFieldType === f.type
                            ? 'border-indigo-600 bg-indigo-600 text-white shadow-md'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <p className="font-extrabold text-xs">{f.label}</p>
                        <p className={`text-[10px] mt-0.5 ${selectedFieldType === f.type ? 'text-indigo-100' : 'text-slate-400'}`}>{f.desc}</p>
                        <span className={`text-[9px] block mt-1 font-mono uppercase ${selectedFieldType === f.type ? 'text-indigo-200' : 'text-indigo-600 font-bold'}`}>✋ Drag onto page</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Placed Fields Summary */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider border-b border-slate-100 pb-1">
                    Placed Fields ({fields.length})
                  </p>

                  {fields.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">No signature fields placed yet. Click on the document page on the right to add fields.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                      {fields.map(f => {
                        const signer = signers.find(s => s.id === f.assigned_signer_id);
                        return (
                          <div key={f.id} className="p-2 bg-slate-50 rounded-lg border border-slate-200/70 flex items-center justify-between text-xs font-semibold text-slate-700">
                            <div className="truncate">
                              <span className="font-extrabold text-slate-900">{signer?.name || 'Signer'}</span>
                              <span className="text-[10px] text-slate-400 block font-mono uppercase">{f.type} • Page {f.page_number}</span>
                            </div>
                            <button
                              onClick={() => handleFieldDelete(f.id)}
                              className="p-1 text-slate-400 hover:text-red-500 rounded"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <button
                  onClick={handleFinalizeAndSend}
                  disabled={isLoading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  {isLoading ? "Generating session..." : "🚀 Finalize & Send Invitations"}
                </button>
              </div>

              {/* Right Document Canvas & Controls */}
              <div className="lg:col-span-8 bg-slate-100 p-4 rounded-2xl border border-slate-200/80 flex flex-col items-center justify-start min-h-[65vh] relative">
                {/* Document Controls Top Bar */}
                <div className="w-full bg-slate-900 text-white p-3 rounded-xl flex items-center justify-between gap-3 mb-4 shadow-sm">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>Interactive Canvas</span>
                  </div>

                  {/* Zoom Controls */}
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <button
                      onClick={() => setZoomScale(s => Math.max(0.6, s - 0.2))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                    >
                      -
                    </button>
                    <span className="text-[11px] font-mono">{Math.round(zoomScale * 100)}%</span>
                    <button
                      onClick={() => setZoomScale(s => Math.min(2.0, s + 0.2))}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                    >
                      +
                    </button>
                    <button
                      onClick={() => setZoomScale(1.0)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300 font-extrabold uppercase"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Canvas Render */}
                <div
                  className="w-full overflow-y-auto max-h-[80vh] transition-all"
                  style={{ transform: `scale(${zoomScale})`, transformOrigin: 'top center' }}
                >
                  <DocumentSignifyViewer
                    fileUrl={fileUrl}
                    fileType={fileType}
                    fields={fields}
                    signatories={signers.map(s => ({
                      id: s.id,
                      document_id: 'doc_temp',
                      name: s.name,
                      email: s.email,
                      role: s.signatoryType === 'Main' ? 'main_signatory' : 'witness',
                      token: 'token_' + s.id,
                      status: 'pending',
                      signed_at: null
                    }))}
                    isDesignerMode={true}
                    activeSignatoryId={activeSignerId}
                    onPlaceFieldAtCoordinates={handlePlaceField}
                    onFieldMove={handleFieldMove}
                    onFieldResize={handleFieldResize}
                    onFieldDelete={handleFieldDelete}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: DISPATCH COMPLETE */}
          {wizardStep === 'complete' && (
            <div className="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xl text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-black border border-emerald-100">
                ✓
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                  Envelope Dispatched Successfully!
                </h2>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  Secure invitation emails were dispatched to all configured signers.
                </p>
              </div>

              {/* Direct Links */}
              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 text-left space-y-3">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Secure Guest Signing Access Links
                </p>
                <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                  Signers can access their interactive signing portal via email or by opening these links directly (no account required):
                </p>

                <div className="space-y-2">
                  {inviteLinks.map((link, i) => (
                    <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
                      <div className="truncate">
                        <p className="font-extrabold text-slate-900 truncate">{link.name} ({link.email})</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{link.url}</p>
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(link.url);
                          showToast(`Copied signing link for ${link.name}!`);
                        }}
                        className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg shrink-0 border border-indigo-100"
                      >
                        Copy Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    setWizardStep('upload');
                    setDocumentFile(null);
                    setFields([]);
                    setFileName('');
                    setFileBase64('');
                    setInviteLinks([]);
                  }}
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition-colors"
                >
                  Sign Another Document
                </button>
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-indigo-100"
                >
                  View Document Tracker
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: WORKFLOW TESTER */}
      {activeTab === 'tester' && (
        <SigningWorkflowTester companyId={company?.id} />
      )}

      {/* DOCUMENT AUDIT & REVIEW MODAL */}
      {reviewDocItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  Audit History & Document Review
                </span>
                <h3 className="text-base font-extrabold text-slate-900 mt-1">
                  {reviewDocItem.document.title}
                </h3>
              </div>
              <button
                onClick={() => setReviewDocItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-xl bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Document Details & Audit Hash */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Document ID</p>
                <p className="font-mono text-slate-800 font-bold mt-0.5">{reviewDocItem.document.id}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400">Created At</p>
                <p className="font-mono text-slate-800 font-bold mt-0.5">{new Date(reviewDocItem.document.created_at).toLocaleString()}</p>
              </div>
            </div>

            {/* Verification Status */}
            {isLoadingVerification ? (
              <div className="py-6 text-center space-y-2">
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-indigo-600 mx-auto"></div>
                <p className="text-xs text-slate-400 font-bold uppercase">Verifying document audit hash...</p>
              </div>
            ) : verificationDetails ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-black">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  <span>Verified Legal Audit Certificate</span>
                </div>
                <p className="text-[11px] text-emerald-700 font-mono">
                  SHA256 Hash: {verificationDetails.auditTrail?.cryptographicHash || "Verified Compliance Seal"}
                </p>
              </div>
            ) : null}

            {/* Signatories Audit Timeline */}
            <div className="space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Signatories Activity Log</p>
              <div className="space-y-2">
                {reviewDocItem.signatories.map((sig) => (
                  <div key={sig.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs font-semibold">
                    <div>
                      <p className="font-extrabold text-slate-900">{sig.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{sig.email}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        sig.status === 'signed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {sig.status}
                      </span>
                      {sig.signed_at && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {new Date(sig.signed_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Document Preview Frame */}
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-100 max-h-[350px] overflow-y-auto">
              <DocumentSignifyViewer
                fileUrl={reviewDocItem.document.signed_file_url || reviewDocItem.document.original_file_url}
                fileType={reviewDocItem.document.file_type || 'pdf'}
                readOnly={true}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setReviewDocItem(null)}
                className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
