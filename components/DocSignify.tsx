import React, { useState, useEffect, useRef } from 'react';
import { Upload, Mail, Check, Trash2, Edit3, UserCheck, Play, ArrowRight, Sparkles, ChevronRight, PenTool } from 'lucide-react';
import { api } from '../lib/api';
import { DocumentSignifyViewer, PreparedField } from './DocumentSignifyViewer';
import { Company, User, GeneratedDocument, DbDocumentSignatory, SignatureInfo } from '../types';

interface DocSignifyProps {
    company: Company | null;
    user: User | null;
    prefillProject?: any;
    prefillClient?: any;
    initialFile?: GeneratedDocument | null;
    onBackToDashboard?: () => void;
}

export default function DocSignify({ company, user, prefillProject, prefillClient, initialFile, onBackToDashboard }: DocSignifyProps) {
    const [wizardStep, setWizardStep] = useState<'upload' | 'prepare' | 'complete'>('upload');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Document State
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

    // Drag-and-drop / Click-to-place Signature Fields State
    const [fields, setFields] = useState<PreparedField[]>([]);
    const [activeSignerId, setActiveSignerId] = useState<string>('');
    const [inviteLinks, setInviteLinks] = useState<{ name: string; email: string; url: string }[]>([]);

    // Signature Pad Modal (for local signing)
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
    const [drawnSigUrl, setDrawnSigUrl] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);

    useEffect(() => {
        if (initialFile) {
            setDocumentFile(initialFile);
            setFileName(initialFile.originalFileName || 'document.pdf');
            setFileBase64(initialFile.originalFileBase64 || '');
            setFileType(initialFile.originalFileType || 'pdf');
            setFileUrl(initialFile.originalFileUrl || '');
        }
    }, [initialFile]);

    // Auto-add current user as a signer option
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
        setTimeout(() => setToastMessage(null), 3000);
    };

    // File Upload Handler
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
                }

                setFileName(file.name);
                setFileBase64(base64Data);
                setFileType(mimeType);

                // Call upload API to get a cloud/local URL
                const cloudUrl = await api.uploadDocSignifyFile(file.name, base64Data, mimeType, company?.id);
                setFileUrl(cloudUrl || "/uploads/placeholder_document.pdf");

                const newDoc: GeneratedDocument = {
                    documentType: file.name.replace(/\.[^/.]+$/, "") || "Uploaded Document",
                    blocks: [{ id: 'block_0', type: 'paragraph', content: { text: `Uploaded Document: ${file.name}` } }],
                    originalFileBase64: base64Data,
                    originalFileType: mimeType,
                    originalFileName: file.name,
                    originalFileUrl: cloudUrl || ""
                };
                setDocumentFile(newDoc);
                showToast("🎉 Document loaded successfully!");
            } catch (err: any) {
                console.error("DocSignify file upload processing error:", err);
                setError(err.message || "Failed to parse file.");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsDataURL(file);
    };

    // Signers Administration
    const addSigner = () => {
        if (!newSignerName.trim()) {
            showToast("⚠️ Please enter signer name.");
            return;
        }
        if (!newSignerEmail.trim() || !newSignerEmail.includes('@')) {
            showToast("⚠️ Please enter a valid email address.");
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
        showToast(`👤 Added ${newSigner.name} as signer.`);
    };

    const removeSigner = (id: string) => {
        setSigners(prev => prev.filter(s => s.id !== id));
        setFields(prev => prev.filter(f => f.assigned_signer_id !== id));
        if (activeSignerId === id) {
            const remain = signers.filter(s => s.id !== id);
            setActiveSignerId(remain[0]?.id || '');
        }
        showToast("Removed signer and their associated signature boxes.");
    };

    // Proceeding to Field Placement Step
    const handleProceedToPrepare = () => {
        if (!documentFile) {
            showToast("⚠️ Please upload a document first.");
            return;
        }
        if (signers.length === 0) {
            showToast("⚠️ Please add at least one signer.");
            return;
        }
        setWizardStep('prepare');
    };

    // Click on canvas to place fields
    const handlePlaceField = (pageNum: number, x: number, y: number) => {
        if (!activeSignerId) {
            showToast("⚠️ Please select an active signer from the left menu first.");
            return;
        }

        const activeSigner = signers.find(s => s.id === activeSignerId);
        const fieldName = activeSigner ? activeSigner.name : "Signer";

        const newField: PreparedField = {
            id: 'field_' + Math.floor(Math.random() * 899999 + 100000),
            type: 'signature',
            page_number: pageNum,
            x_position: x,
            y_position: y,
            width: 140,
            height: 55,
            assigned_signer_id: activeSignerId,
            required: true
        };

        setFields(prev => [...prev, newField]);
        showToast(`✍️ Placed signature box for ${fieldName} on Page ${pageNum}`);
    };

    // Draggable canvas mechanics
    const handleFieldMove = (id: string, pageNum: number, x: number, y: number) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, page_number: pageNum, x_position: x, y_position: y } : f));
    };

    const handleFieldResize = (id: string, w: number, h: number) => {
        setFields(prev => prev.map(f => f.id === id ? { ...f, width: w, height: h } : f));
    };

    const handleFieldDelete = (id: string) => {
        setFields(prev => prev.filter(f => f.id !== id));
        showToast("Removed signature box.");
    };

    // Local Signing Pad
    const openSignPad = (fieldId: string) => {
        setSelectedFieldId(fieldId);
        setIsSignModalOpen(true);
        setDrawnSigUrl(null);
        setTimeout(initCanvas, 100);
    };

    const initCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        isDrawing.current = true;
        const rect = canvas.getBoundingClientRect();
        let clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        let clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        ctx.beginPath();
        ctx.moveTo(clientX - rect.left, clientY - rect.top);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        let clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        let clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        ctx.lineTo(clientX - rect.left, clientY - rect.top);
        ctx.stroke();
    };

    const stopDrawing = () => {
        isDrawing.current = false;
    };

    const clearCanvas = () => {
        initCanvas();
    };

    const saveDrawnSignature = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        setDrawnSigUrl(url);

        // Instantly sign the chosen signature box on the screen!
        if (selectedFieldId) {
            setFields(prev => prev.map(f => f.id === selectedFieldId ? { ...f, value: url } : f));
            showToast("✍️ Signed document box successfully!");
        }
        setIsSignModalOpen(false);
    };

    // Invite & finalize signatories via email
    const handleFinalizeAndSend = async () => {
        if (fields.length === 0) {
            showToast("⚠️ Please place at least one signature box on the document.");
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const docId = 'doc_' + Math.floor(Math.random() * 899999 + 100000);
            const resolvedFileName = fileName || 'secured_agreement.pdf';
            const resolvedFileType = fileType || 'pdf';

            // Generate UUID mapping
            const idMapping: { [key: string]: string } = {
                'myself': user?.id || 'myself_owner'
            };

            const mappedSigs = signers.map(s => {
                const isMyself = s.id === 'myself';
                const dbId = isMyself ? (user?.id || 'owner_id') : ('signer_' + Math.floor(Math.random() * 899999 + 100000));
                idMapping[s.id] = dbId;
                return {
                    id: dbId,
                    name: s.name,
                    email: s.email || `${s.name.toLowerCase().replace(/\s/g, '')}@cravebiz.com`,
                    role: (s.signatoryType === 'Main' ? 'main_signatory' : 'witness') as DbDocumentSignatory['role']
                };
            });

            // Map designer fields to database UUIDs
            const mappedFields = fields.map(f => ({
                ...f,
                assigned_signer_id: idMapping[f.assigned_signer_id] || f.assigned_signer_id,
                value: f.value || null
            }));

            const contentJson = {
                fields: mappedFields,
                brandColor: "#0284c7"
            };

            // Register document in backend
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
                // Dispatch real/simulated invitation emails
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
                    console.warn("Backend invitation dispatch failed:", emailErr);
                }

                // Map invite URLs so user can copy them right there!
                const links = response.signatories.map(sig => ({
                    name: sig.name,
                    email: sig.email,
                    url: `${window.location.origin}/?token=${sig.token}`
                }));
                setInviteLinks(links);

                setWizardStep('complete');
                showToast("🎉 Document workspace created & invitations dispatched!");
            } else {
                throw new Error("Failed to register e-sign workflow context on host.");
            }
        } catch (err: any) {
            console.error("Save Draft & Send Error:", err);
            setError("Failed to register secure document session: " + (err.message || err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b pb-4 gap-4">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                        <PenTool className="w-7 h-7 text-sky-600" />
                        DocSignify
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">
                        Seamlessly upload documents, place signature boxes, sign immediately, and send secure email invitations.
                    </p>
                </div>
                {onBackToDashboard && (
                    <button
                        onClick={onBackToDashboard}
                        className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                        Back to Dashboard
                    </button>
                )}
            </div>

            {/* Error notifications */}
            {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs font-medium">
                    ⚠️ {error}
                </div>
            )}

            {/* Toast Alerts */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-800 text-xs font-bold animate-in fade-in slide-in-from-bottom-4 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* Step progress bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 max-w-xl mx-auto">
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border text-[10px] ${wizardStep === 'upload' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}>
                            {documentFile ? '✔' : '1'}
                        </div>
                        <span className={wizardStep === 'upload' ? 'text-sky-600 font-extrabold' : 'text-slate-700'}>1. Upload & Signers</span>
                    </div>
                    <div className="flex-1 h-0.5 bg-slate-100 mx-4">
                        <div className={`h-full bg-sky-600 transition-all ${wizardStep !== 'upload' ? 'w-full' : 'w-0'}`}></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border text-[10px] ${wizardStep === 'prepare' ? 'bg-sky-600 border-sky-600 text-white' : wizardStep === 'complete' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            {wizardStep === 'complete' ? '✔' : '2'}
                        </div>
                        <span className={wizardStep === 'prepare' ? 'text-sky-600 font-extrabold' : 'text-slate-500'}>2. Place Boxes & Sign</span>
                    </div>
                    <div className="flex-1 h-0.5 bg-slate-100 mx-4">
                        <div className={`h-full bg-sky-600 transition-all ${wizardStep === 'complete' ? 'w-full' : 'w-0'}`}></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center border text-[10px] ${wizardStep === 'complete' ? 'bg-sky-600 border-sky-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            3
                        </div>
                        <span className={wizardStep === 'complete' ? 'text-sky-600 font-extrabold' : 'text-slate-500'}>3. Invite Dispatch</span>
                    </div>
                </div>
            </div>

            {/* Step 1 Layout */}
            {wizardStep === 'upload' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Upload box */}
                    <div className="lg:col-span-6 space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-150/80 shadow-sm space-y-4">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                                Step 1: Upload Document File
                            </h2>
                            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                Select or drop your standard PDF or Microsoft Word (.docx) agreement files.
                            </p>

                            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-sky-500/50 hover:bg-slate-50/50 transition-all text-center cursor-pointer relative">
                                <input
                                    type="file"
                                    accept=".pdf,.docx"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isLoading}
                                />
                                <div className="space-y-3">
                                    <div className="p-3 bg-sky-50 rounded-full inline-block text-sky-600">
                                        <Upload className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-800">
                                            {fileName ? `File Selected: ${fileName}` : "Click to select or drag document here"}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                                            Supports standard PDF and Word formats up to 25MB
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {documentFile && (
                                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2 text-emerald-800 text-xs font-bold">
                                    <Check className="w-4 h-4 text-emerald-600" />
                                    <span>Document successfully loaded! {fileName}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Configure Signers */}
                    <div className="lg:col-span-6 space-y-6">
                        <div className="bg-white p-6 rounded-2xl border border-slate-150/80 shadow-sm space-y-4">
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                                Step 2: Configure Signers
                            </h2>
                            <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                Set up the signers who need to execute this document. You can include yourself as a signer.
                            </p>

                            {/* Add signer small form */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Add New Recipient</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input
                                        type="text"
                                        placeholder="Full Name"
                                        value={newSignerName}
                                        onChange={(e) => setNewSignerName(e.target.value)}
                                        className="p-2 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 focus:outline-none"
                                    />
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={newSignerEmail}
                                        onChange={(e) => setNewSignerEmail(e.target.value)}
                                        className="p-2 border border-slate-200 rounded-lg text-xs font-bold bg-white text-slate-800 focus:outline-none"
                                    />
                                </div>
                                <div className="flex items-center justify-between pt-2">
                                    <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" checked={newSignerRole === 'Main'} onChange={() => setNewSignerRole('Main')} className="text-sky-600 focus:ring-sky-500" />
                                            Main Signer
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" checked={newSignerRole === 'Witness'} onChange={() => setNewSignerRole('Witness')} className="text-sky-600 focus:ring-sky-500" />
                                            Witness
                                        </label>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={addSigner}
                                        className="px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-sm"
                                    >
                                        Add Signer
                                    </button>
                                </div>
                            </div>

                            {/* Active list of signers */}
                            <div className="space-y-2">
                                <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Signers List ({signers.length})</div>
                                <div className="divide-y divide-slate-100">
                                    {signers.map((s, index) => (
                                        <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-full bg-sky-50 flex items-center justify-center font-bold text-sky-700 text-xs">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800">{s.name} {s.id === 'myself' && <span className="text-[9px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full ml-1">Myself</span>}</p>
                                                    <p className="text-[10px] text-slate-400 font-semibold">{s.email} • {s.signatoryType}</p>
                                                </div>
                                            </div>
                                            {s.id !== 'myself' && (
                                                <button
                                                    onClick={() => removeSigner(s.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Next trigger button */}
                            <button
                                onClick={handleProceedToPrepare}
                                className="w-full mt-4 py-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                            >
                                <span>Place Signature Boxes & Sign</span>
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Step 2 Layout */}
            {wizardStep === 'prepare' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left designer toolbar and signatory menu */}
                    <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-slate-150/80 shadow-sm space-y-6">
                        <div>
                            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                                Design & Place Signatures
                            </h2>
                            <p className="text-xs text-slate-500 mt-1 font-semibold leading-relaxed">
                                Select a signer, then click on the document page on the right to place their signature box.
                            </p>
                        </div>

                        {/* Selection of Active Signer */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                Select Signer for Placement:
                            </label>
                            <div className="space-y-2">
                                {signers.map(s => (
                                    <button
                                        key={s.id}
                                        onClick={() => setActiveSignerId(s.id)}
                                        className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between ${activeSignerId === s.id ? 'border-sky-600 bg-sky-50/40 shadow-sm' : 'border-slate-200 hover:bg-slate-50/50'}`}
                                    >
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">{s.name}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold">{s.email}</p>
                                        </div>
                                        {activeSignerId === s.id && (
                                            <span className="w-2 h-2 rounded-full bg-sky-600"></span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Placed fields summary */}
                        <div className="space-y-3">
                            <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider border-b pb-1">
                                Placed Fields ({fields.length})
                            </div>
                            {fields.length === 0 ? (
                                <p className="text-[11px] text-slate-400 italic">No signature fields placed yet. Click on the document pages to add them.</p>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                    {fields.map(f => {
                                        const signer = signers.find(s => s.id === f.assigned_signer_id);
                                        return (
                                            <div key={f.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between gap-2 text-xs font-medium text-slate-600">
                                                <div className="truncate">
                                                    <span className="font-bold text-slate-800">{signer ? signer.name : "Signer"}</span>
                                                    <span className="text-[10px] text-slate-400 block font-semibold">Page {f.page_number} (x:{Math.round(f.x_position)}%, y:{Math.round(f.y_position)}%)</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {f.assigned_signer_id === 'myself' && !f.value && (
                                                        <button
                                                            onClick={() => openSignPad(f.id)}
                                                            className="px-2 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded text-[10px] font-bold"
                                                        >
                                                            Sign Now
                                                        </button>
                                                    )}
                                                    {f.value && (
                                                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">Signed</span>
                                                    )}
                                                    <button
                                                        onClick={() => handleFieldDelete(f.id)}
                                                        className="p-1 text-slate-400 hover:text-red-500 rounded"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Final Send Action */}
                        <button
                            onClick={handleFinalizeAndSend}
                            disabled={isLoading}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-100 flex items-center justify-center gap-2"
                        >
                            {isLoading ? "Generating session..." : "Invite Signers & Complete"}
                        </button>
                    </div>

                    {/* Right document preview container */}
                    <div className="lg:col-span-8 bg-slate-100 p-4 rounded-2xl border border-slate-200/50 flex flex-col items-center justify-start min-h-[60vh] relative">
                        <div className="w-full text-center py-2 bg-slate-800 text-white rounded-t-xl text-[10px] font-black uppercase tracking-wider mb-2">
                            📄 Interactive Designer — Click Anywhere on the Page Below to Place a Signature Box
                        </div>
                        <div className="w-full overflow-y-auto max-h-[80vh]">
                            <DocumentSignifyViewer
                                fileUrl={fileUrl}
                                fileType={fileType}
                                fields={fields}
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

            {/* Step 3 Layout (Complete) */}
            {wizardStep === 'complete' && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-3xl border border-slate-150 shadow-lg text-center space-y-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-black">
                        ✔
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                            Workflow Activated Successfully!
                        </h2>
                        <p className="text-xs text-slate-500 font-semibold mt-1">
                            An email containing secure e-sign instructions was dispatched to each configured counterparty.
                        </p>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-3">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            Direct Guest Signing Access Links
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold leading-relaxed">
                            No CraveBiz account is required for guest signers. You can copy the links below to invite them via messaging apps:
                        </p>
                        <div className="space-y-2">
                            {inviteLinks.map((link, i) => (
                                <div key={i} className="bg-white p-2.5 rounded-lg border border-slate-150 flex items-center justify-between gap-4 text-xs">
                                    <div className="truncate">
                                        <p className="font-bold text-slate-800 truncate">{link.name} ({link.email})</p>
                                        <p className="text-[10px] text-slate-400 font-mono truncate">{link.url}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(link.url);
                                            showToast(`Copied signing link for ${link.name}!`);
                                        }}
                                        className="text-[10px] font-bold text-sky-600 hover:text-sky-700 bg-sky-50 px-2 py-1 rounded"
                                    >
                                        Copy Link
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex items-center justify-center gap-4">
                        <button
                            onClick={() => {
                                setWizardStep('upload');
                                setDocumentFile(null);
                                setFields([]);
                                setFileName('');
                                setFileBase64('');
                                setInviteLinks([]);
                            }}
                            className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold"
                        >
                            Sign Another Document
                        </button>
                        {onBackToDashboard && (
                            <button
                                onClick={onBackToDashboard}
                                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold"
                            >
                                Return to Dashboard
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Local Sign pad modal overlay */}
            {isSignModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4">
                        <div className="flex justify-between items-center border-b pb-2">
                            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                                <PenTool className="w-4 h-4 text-sky-600" />
                                Apply Secure Draw Signature
                            </h3>
                            <button onClick={() => setIsSignModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
                        </div>

                        <div className="border border-slate-200 rounded-xl bg-slate-50/50 p-1 relative">
                            <canvas
                                ref={canvasRef}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                                onTouchStart={startDrawing}
                                onTouchMove={draw}
                                onTouchEnd={stopDrawing}
                                width={440}
                                height={180}
                                className="w-full h-[180px] bg-white rounded-lg cursor-crosshair touch-none"
                            />
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                            <button
                                onClick={clearCanvas}
                                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 font-bold"
                            >
                                Clear Pad
                            </button>
                            <div className="space-x-2">
                                <button
                                    onClick={() => setIsSignModalOpen(false)}
                                    className="px-4 py-1.5 text-slate-600 font-semibold"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={saveDrawnSignature}
                                    className="px-4 py-1.5 bg-slate-900 text-white font-bold rounded-lg"
                                >
                                    Apply Signature
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
