import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StoredGeneratedDoc, DocumentBlock, SignatureInfo, DbDocument, DbDocumentSignatory, DbDocumentSignature } from '../types';
import { api } from '../lib/api';
import { DocumentSignifyViewer } from './DocumentSignifyViewer';

const base64ToUtf8 = (str: string): string => {
    try {
        return decodeURIComponent(Array.prototype.map.call(atob(str), (c) => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
    } catch (e) {
        console.error("base64ToUtf8 error:", e);
        return atob(str);
    }
};

interface PublicSigningPortalProps {
    docId?: string;
    token?: string;
    prefilledRecipient?: string;
    onBackToLogin?: () => void;
}

export default function PublicSigningPortal({ docId, token, prefilledRecipient, onBackToLogin }: PublicSigningPortalProps) {
    const [loading, setLoading] = useState(true);
    const [document, setDocument] = useState<StoredGeneratedDoc | null>(null);
    const [signatories, setSignatories] = useState<SignatureInfo[]>([]);
    const [activeSigIndex, setActiveSigIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSignedSuccess, setIsSignedSuccess] = useState(false);

    // Modern DB state
    const [dbDoc, setDbDoc] = useState<DbDocument | null>(null);
    const [dbSignatory, setDbSignatory] = useState<DbDocumentSignatory | null>(null);
    const [dbSignatories, setDbSignatories] = useState<DbDocumentSignatory[]>([]);
    const [dbSignatures, setDbSignatures] = useState<DbDocumentSignature[]>([]);
    const [alreadySigned, setAlreadySigned] = useState(false);

    // Manual Email verification state
    const [userEmailInput, setUserEmailInput] = useState(prefilledRecipient || '');
    const [emailMatchError, setEmailMatchError] = useState<string | null>(null);

    // Guest self-adding signatory state
    const [isAddingSelf, setIsAddingSelf] = useState(false);
    const [selfName, setSelfName] = useState('');
    const [selfTitle, setSelfTitle] = useState('Representative');

    // Signature State
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [sigType, setSigType] = useState<'draw' | 'type' | 'upload'>('draw');
    const [typedName, setTypedName] = useState('');
    const [sigTitle, setSigTitle] = useState('Representative');
    const [selectedCursiveStyle, setSelectedCursiveStyle] = useState(0);
    const [uploadedSigUrl, setUploadedSigUrl] = useState<string | null>(null);
    const [drawnSigUrl, setDrawnSigUrl] = useState<string | null>(null);

    // Canvas drawing signature mechanics
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const lastX = useRef(0);
    const lastY = useRef(0);

    const documentRef = useRef<HTMLDivElement>(null);

    // Load cursive fonts dynamically
    useEffect(() => {
        const link = window.document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Herr+Von+Muellerhoff&family=Homemade+Apple&display=swap';
        link.rel = 'stylesheet';
        window.document.head.appendChild(link);
        return () => {
            if (window.document.head.contains(link)) {
                window.document.head.removeChild(link);
            }
        };
    }, []);

    // Load document and validation on init
    useEffect(() => {
        async function fetchDoc() {
            setLoading(true);
            try {
                if (token) {
                    const data = await api.getDocSignifyDocumentByToken(token);
                    if (data) {
                        setDbDoc(data.document);
                        setDbSignatory(data.signatory);
                        setDbSignatories(data.signatories);
                        setDbSignatures(data.signatures || []);
                        
                        // Map old legacy structures to make sure we don't break legacy page layouts
                        const legacySigs = data.signatories.map(s => ({
                            id: s.id,
                            name: s.name,
                            email: s.email,
                            title: s.role.replace('_', ' ').toUpperCase(),
                            signatoryType: s.role === 'main_signatory' ? 'Main' : s.role === 'witness' ? 'Witness' : 'Additional',
                            isSigned: s.status === 'signed',
                            value: '',
                            type: 'draw' as const,
                            date: s.signed_at || ''
                        }));
                        setSignatories(legacySigs);
                        
                        // Match index
                        const activeIndex = data.signatories.findIndex(s => s.id === data.signatory.id);
                        if (activeIndex > -1) {
                            setActiveSigIndex(activeIndex);
                        }

                        // Check if already completed signing
                        if (data.signatory.status === 'signed') {
                            setAlreadySigned(true);
                        }
                    } else {
                        setError("This secure signing link is invalid or has expired.");
                    }
                } else if (docId) {
                    // Backwards compatible or ID-based loading
                    const fetched = await api.getDocSignifyDocument(docId);
                    if (fetched && fetched.document) {
                        setDbDoc(fetched.document);
                        setDbSignatories(fetched.signatories);
                        setDbSignatures(fetched.signatures || []);
                        
                        const legacySigs = fetched.signatories.map(s => ({
                            id: s.id,
                            name: s.name,
                            email: s.email,
                            title: s.role.replace('_', ' ').toUpperCase(),
                            signatoryType: s.role === 'main_signatory' ? 'Main' : s.role === 'witness' ? 'Witness' : 'Additional',
                            isSigned: s.status === 'signed',
                            value: '',
                            type: 'draw' as const,
                            date: s.signed_at || ''
                        }));
                        setSignatories(legacySigs);

                        if (prefilledRecipient) {
                            const activeIndex = fetched.signatories.findIndex(
                                s => s.email.trim().toLowerCase() === prefilledRecipient.trim().toLowerCase()
                            );
                            if (activeIndex > -1) {
                                setActiveSigIndex(activeIndex);
                                setDbSignatory(fetched.signatories[activeIndex]);
                                if (fetched.signatories[activeIndex].status === 'signed') {
                                    setAlreadySigned(true);
                                }
                            }
                        }
                    } else {
                        // Try old API fallback if modern document not found
                        const oldDoc = await api.getPublicDoc(docId);
                        if (oldDoc) {
                            setDocument(oldDoc);
                            setSignatories(oldDoc.signatures || []);
                        } else {
                            setError("Could not locate this agreement. Please verify your signature invite credentials.");
                        }
                    }
                }
            } catch (err: any) {
                setError("Vault retrieval failed: " + (err.message || err));
            } finally {
                setLoading(false);
            }
        }
        fetchDoc();
    }, [docId, token, prefilledRecipient]);

    // Parse document details and signature progression overview
    const docOverview = useMemo(() => {
        if (dbDoc) {
            const totalSigs = dbSignatories.length;
            const signedSigs = dbSignatories.filter(s => s.status === 'signed').length;
            return {
                title: dbDoc.filename || dbDoc.document_type || 'Uploaded Agreement',
                company: 'DocSignify Secured',
                date: dbDoc.created_at ? new Date(dbDoc.created_at).toLocaleDateString() : 'Recent',
                client: '',
                reference: dbDoc.id,
                totalSigs,
                signedSigs
            };
        }

        if (!document) return null;
        
        let title = document.documentType || 'Uploaded Agreement';
        let company = 'CraveBiZ Client';
        let date = document.createdAt ? new Date(document.createdAt).toLocaleDateString() : 'Recent';
        let client = '';
        let reference = '';

        // Extract from metadata block if present
        const metadataBlock = document.blocks.find(b => b.type === 'metadata');
        if (metadataBlock && metadataBlock.content) {
            if (metadataBlock.content.documentTitle) title = metadataBlock.content.documentTitle;
            if (metadataBlock.content.date) date = metadataBlock.content.date;
            if (metadataBlock.content.clientName) client = metadataBlock.content.clientName;
            if (metadataBlock.content.reference) reference = metadataBlock.content.reference;
        }

        // Extract company from header block
        const headerBlock = document.blocks.find(b => b.type === 'header');
        if (headerBlock && headerBlock.content && headerBlock.content.companyName) {
            company = headerBlock.content.companyName;
        }

        const totalSigs = signatories.length;
        const signedSigs = signatories.filter(s => s.isSigned).length;

        return {
            title,
            company,
            date,
            client,
            reference,
            totalSigs,
            signedSigs
        };
    }, [dbDoc, dbSignatories, document, signatories]);

    // Match signature slot of the prefilled invited recipient
    const matchedSignatory = useMemo(() => {
        if (!prefilledRecipient || !signatories.length) return null;
        const index = signatories.findIndex(
            s => s.email?.trim().toLowerCase() === prefilledRecipient.trim().toLowerCase()
        );
        if (index > -1) {
            return {
                sig: signatories[index],
                index: index
            };
        }
        return null;
    }, [prefilledRecipient, signatories]);

    // Auto-open signature modal if prefilled recipient matched on load and is unsigned
    useEffect(() => {
        if (!loading && prefilledRecipient && signatories.length > 0) {
            const matchedIdx = signatories.findIndex(
                s => s.email?.trim().toLowerCase() === prefilledRecipient.trim().toLowerCase()
            );
            if (matchedIdx > -1) {
                const sig = signatories[matchedIdx];
                if (sig && !sig.isSigned) {
                    setActiveSigIndex(matchedIdx);
                    setTypedName(sig.name || '');
                    setSigTitle(sig.title || 'Representative');
                    setIsSignModalOpen(true);
                }
            }
        }
    }, [loading, prefilledRecipient, signatories]);

    // Canvas drawing helpers
    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        let clientX = 0;
        let clientY = 0;

        if (window.TouchEvent && e.nativeEvent instanceof TouchEvent) {
            const touch = e.nativeEvent.touches[0] || e.nativeEvent.changedTouches[0];
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;
            clientX = mouseEvent.clientX;
            clientY = mouseEvent.clientY;
        }

        // Return accurate scale-safe position inside canvas
        return {
            x: ((clientX - rect.left) / rect.width) * canvas.width,
            y: ((clientY - rect.top) / rect.height) * canvas.height
        };
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const coords = getCoordinates(e);
        isDrawing.current = true;
        lastX.current = coords.x;
        lastY.current = coords.y;
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const coords = getCoordinates(e);
        ctx.beginPath();
        ctx.moveTo(lastX.current, lastY.current);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = '#1e3b8b'; // Deep navy blue ink
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        lastX.current = coords.x;
        lastY.current = coords.y;
    };

    const stopDrawing = () => {
        isDrawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) {
            setDrawnSigUrl(canvas.toDataURL());
        }
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setDrawnSigUrl(null);
    };

    const handleUploadSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setUploadedSigUrl(event.target?.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleOpenSignModalForIndex = (index: number) => {
        setActiveSigIndex(index);
        const sig = signatories[index];
        if (sig) {
            setTypedName(sig.name || '');
            setSigTitle(sig.title || 'Representative');
        } else {
            setTypedName('');
            setSigTitle('Representative');
        }
        setIsSignModalOpen(true);
    };

    const handleApplySignature = async () => {
        if (activeSigIndex === null && !dbSignatory) return;

        let value = '';
        if (sigType === 'draw') {
            const canvas = canvasRef.current;
            if (canvas) {
                value = canvas.toDataURL();
            } else if (drawnSigUrl) {
                value = drawnSigUrl;
            }
            if (!value) {
                alert('Please draw your signature first.');
                return;
            }
        } else if (sigType === 'type') {
            if (!typedName.trim()) {
                alert('Please type your legal name.');
                return;
            }
            value = selectedCursiveStyle.toString();
        } else if (sigType === 'upload') {
            if (!uploadedSigUrl) {
                alert('Please upload an image representation of your signature.');
                return;
            }
            value = uploadedSigUrl;
        }

        const dateStr = new Date().toLocaleString();

        let finalSigImage = value;
        if (sigType === 'type') {
            // Draw cursive text to a canvas to get a real transparent PNG data URL
            const fontCanvas = window.document.createElement('canvas');
            fontCanvas.width = 300;
            fontCanvas.height = 100;
            const ctx = fontCanvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0)'; // Transparent background
                ctx.clearRect(0, 0, fontCanvas.width, fontCanvas.height);
                const fonts = ["'Dancing Script', cursive", "'Great Vibes', cursive", "'Herr Von Muellerhoff', cursive", "'Homemade Apple', cursive"];
                const fontStr = fonts[selectedCursiveStyle] || "'Dancing Script', cursive";
                ctx.font = `bold 28px ${fontStr}`;
                ctx.fillStyle = '#0f172a'; // Slate-900 ink
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(typedName, fontCanvas.width / 2, fontCanvas.height / 2);
                finalSigImage = fontCanvas.toDataURL('image/png');
            }
        }

        // Handle Modern Database flow
        if (dbSignatory && dbDoc) {
            setLoading(true);
            try {
                // Find existing signature template for this signatory
                let targetSig = dbSignatures.find(s => s.signatory_id === dbSignatory.id);
                if (!targetSig) {
                    targetSig = {
                        id: 'sig-' + Math.random().toString(36).substr(2, 9),
                        document_id: dbDoc.id,
                        signatory_id: dbSignatory.id,
                        page_number: 1,
                        x_position: 50,
                        y_position: 85,
                        width: 140,
                        height: 60,
                        signature_image_url: finalSigImage,
                        signed_at: new Date().toISOString()
                    };
                } else {
                    targetSig = {
                        ...targetSig,
                        signature_image_url: finalSigImage,
                        signed_at: new Date().toISOString()
                    };
                }

                // Call addDocSignifySignature
                const savedSig = await api.addDocSignifySignature({
                    document_id: targetSig.document_id,
                    signatory_id: targetSig.signatory_id,
                    page_number: targetSig.page_number,
                    x_position: targetSig.x_position,
                    y_position: targetSig.y_position,
                    signature_type: targetSig.signature_type || 'draw',
                    signature_image_url: finalSigImage
                });

                if (savedSig) {
                    const nextSigs = dbSignatures.filter(s => s.id !== targetSig.id);
                    const updatedSigs = [...nextSigs, savedSig];
                    setDbSignatures(updatedSigs);
                    
                    // Transition status to signed
                    const result = await api.updateDocSignifySignatoryStatus(
                        dbSignatory.id,
                        'signed',
                        updatedSigs
                    );
                    
                    if (result && result.signatory) {
                        setDbSignatories(prev => prev.map(s => s.id === result.signatory.id ? result.signatory : s));
                        setDbSignatory(result.signatory);
                        setAlreadySigned(true);
                        setIsSignedSuccess(true);
                    }
                } else {
                    alert("Could not save the signature details. Please try again.");
                }
            } catch (err: any) {
                alert("Error saving signature to DB: " + err.message);
            } finally {
                setLoading(false);
            }
            setIsSignModalOpen(false);
            return;
        }

        // Legacy fallback
        const updatedSignatures = signatories.map((sig, idx) => {
            if (idx === activeSigIndex) {
                return {
                    ...sig,
                    isSigned: true,
                    type: sigType,
                    value: finalSigImage,
                    name: typedName || sig.name,
                    title: sigTitle || sig.title,
                    date: dateStr
                };
            }
            return sig;
        });

        setSignatories(updatedSignatures);
        setIsSignModalOpen(false);

        // Save immediately back to the cloud/DB
        setLoading(true);
        try {
            const success = await api.savePublicDocSignature(docId!, updatedSignatures);
            if (success) {
                setIsSignedSuccess(true);
            } else {
                alert("Failed to securely sync signature to database. Please try again.");
            }
        } catch (err: any) {
            alert("Error saving signature: " + (err.message || err));
        } finally {
            setLoading(false);
        }
    };

    const renderBlock = (block: DocumentBlock) => {
        const { id, type, content } = block;
        switch (type) {
            case 'header':
                return (
                    <div className="flex justify-between items-start pb-6 border-b-2 border-gray-800" key={id}>
                        <div className="flex items-center gap-5">
                            {content.logoUrl ? (
                                <img src={content.logoUrl} alt="Logo" className="h-12 w-auto object-contain" />
                            ) : (
                                <div className="h-12 w-12 bg-gray-100 flex items-center justify-center rounded text-[10px] font-bold text-gray-400">Logo</div>
                            )}
                            <div>
                                <h2 className="text-lg font-bold text-gray-800">{content.companyName}</h2>
                                <p className="text-[10px] text-gray-500 mt-0.5">{content.address}</p>
                                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{content.email} | {content.phone}</p>
                            </div>
                        </div>
                    </div>
                );
            case 'metadata':
                return (
                    <div className="my-6 grid grid-cols-2 gap-4 text-xs" key={id}>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Document Title</span>
                            <span className="font-extrabold text-gray-800 text-sm">{content.documentTitle}</span>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Date Generated</span>
                            <span className="font-semibold text-gray-600">{content.date}</span>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Contracting Client</span>
                            <span className="font-bold text-gray-700">{content.clientName}</span>
                        </div>
                        <div className="space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 block">Document Reference</span>
                            <span className="font-mono text-gray-500">{content.reference}</span>
                        </div>
                    </div>
                );
            case 'title':
                return (
                    <h1 className="text-xl font-extrabold text-gray-900 tracking-tight mt-8 mb-4 border-b pb-2" key={id}>
                        {content.text}
                    </h1>
                );
            case 'paragraph':
                return (
                    <p 
                        className="text-xs text-gray-600 leading-relaxed font-medium mb-4 whitespace-pre-wrap" 
                        key={id}
                        dangerouslySetInnerHTML={{ __html: content.text || '' }}
                    />
                );
            case 'table':
                return (
                    <div className="my-6 overflow-x-auto shadow-sm rounded-xl border border-gray-100" key={id}>
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-100">
                                    {(content.headers || []).map((h: string, i: number) => (
                                        <th key={i} className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {(content.rows || []).map((row: string[], rIdx: number) => (
                                    <tr key={rIdx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/45 transition-colors">
                                        {row.map((cell, cIdx) => (
                                            <td key={cIdx} className="px-4 py-3 text-xs font-semibold text-gray-700">{cell}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'summary':
                return (
                    <div className="my-6 bg-gray-50/50 rounded-2xl p-4 border border-gray-100/50 flex flex-col md:flex-row md:justify-between font-sans gap-3" key={id}>
                        <div className="space-y-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Transaction Summary</span>
                            <p className="text-[11px] text-gray-500">{content.notes || 'Executed in alignment with the terms and covenants highlighted above.'}</p>
                        </div>
                        <div className="text-right flex-shrink-0 flex flex-col justify-center">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Total Valuation</span>
                            <span className="text-base font-extrabold text-gray-900">{content.total} {content.currency || 'USD'}</span>
                        </div>
                    </div>
                );
            case 'footer':
                return (
                    <div className="mt-12 pt-4 border-t border-gray-100 text-[10px] text-gray-400 font-medium text-center" key={id}>
                        {content.text}
                    </div>
                );
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-gray-100 max-w-sm w-full text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mb-4 mx-auto"></div>
                    <h3 className="text-lg font-black text-gray-800 tracking-tight">Accessing Secure Vault</h3>
                    <p className="text-xs text-gray-400 font-medium mt-1 uppercase tracking-wider">Verifying token routing...</p>
                </div>
            </div>
        );
    }

    if (error || !document) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
                <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-gray-100 max-w-md w-full text-center space-y-6">
                    <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto text-xl">⚠️</div>
                    <div className="space-y-2">
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Access Intervention</h3>
                        <p className="text-xs text-gray-500 font-medium leading-relaxed">{error || "This document link is invalid or has expired."}</p>
                    </div>
                    {onBackToLogin ? (
                        <button
                            onClick={onBackToLogin}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all"
                        >
                            Back to Portal
                        </button>
                    ) : (
                        <div className="text-gray-400 text-xs font-semibold">CraveBiZ Document Transformer</div>
                    )}
                </div>
            </div>
        );
    }

    const cursiveStyles = [
        "font-family: 'Dancing Script', cursive",
        "font-family: 'Great Vibes', cursive",
        "font-family: 'Herr Von Muellerhoff', cursive",
        "font-family: 'Homemade Apple', cursive"
    ];

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4 md:px-8 font-sans">
            <div className="max-w-5xl mx-auto grid lg:grid-cols-12 gap-8">
                {/* Left Side: Document Preview Area (Column span 8) */}
                <div className="lg:col-span-8 bg-white rounded-3xl border border-gray-200/60 shadow-xl p-8 md:p-12 space-y-6 relative" ref={documentRef}>
                    <div className="border-b border-gray-100 pb-4 mb-6 flex justify-between items-center">
                        <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                            CraveBiZ Secure E-Sign Protocol
                        </span>
                        <span className="text-[10px] font-semibold text-gray-400 font-mono">
                            ID: {(dbDoc?.id || document?.id || '').substring(0, 8).toUpperCase()}
                        </span>
                    </div>

                    {dbDoc ? (
                        <div className="w-full mb-6">
                            <DocumentSignifyViewer
                                fileUrl={dbDoc.original_file_url || dbDoc.original_file_base64 || ''}
                                fileType={dbDoc.original_file_type || 'pdf'}
                                htmlContent={dbDoc.content_json?.htmlContent || ''}
                                signatures={dbSignatures}
                                signatories={dbSignatories}
                                activeSignatory={dbSignatory}
                                readOnly={alreadySigned}
                                onPlaceSignature={(placement) => {
                                    if (dbSignatory && !alreadySigned) {
                                        setTypedName(dbSignatory.name);
                                        setSigTitle(dbSignatory.role.toUpperCase().replace('_', ' '));
                                        setIsSignModalOpen(true);
                                    }
                                }}
                            />
                        </div>
                    ) : document?.originalFileBase64 ? (
                        <div className="w-full mb-6">
                            <DocumentSignifyViewer
                                fileUrl={document.originalFileBase64}
                                fileType={document.originalFileType || 'pdf'}
                                htmlContent={document.originalFileType === 'docx-html' ? document.blocks.map(b => b.content.text).join('') : ''}
                                signatures={dbSignatures.length > 0 ? dbSignatures : signatories.map((s, idx) => ({
                                    id: s.id || `sig-${idx}`,
                                    document_id: docId || '',
                                    signatory_id: s.id || `sig-${idx}`,
                                    page_number: 1,
                                    x_position: 50,
                                    y_position: 80 + idx * 5,
                                    width: 140,
                                    height: 55,
                                    signature_image_url: s.isSigned ? s.value : undefined
                                }))}
                                signatories={dbSignatories.length > 0 ? dbSignatories : signatories.map((s, idx) => ({
                                    id: s.id || `sig-${idx}`,
                                    document_id: docId || '',
                                    name: s.name,
                                    email: s.email || '',
                                    role: s.signatoryType === 'Main' ? 'main_signatory' : s.signatoryType === 'Witness' ? 'witness' : 'additional_signatory',
                                    status: s.isSigned ? 'signed' : 'pending'
                                }))}
                                activeSignatory={activeSigIndex !== null ? (dbSignatory || {
                                    id: signatories[activeSigIndex]?.id || `sig-${activeSigIndex}`,
                                    document_id: docId || '',
                                    name: signatories[activeSigIndex]?.name,
                                    email: signatories[activeSigIndex]?.email || '',
                                    role: signatories[activeSigIndex]?.signatoryType === 'Main' ? 'main_signatory' : 'witness',
                                    status: 'pending'
                                }) : null}
                                readOnly={activeSigIndex === null}
                                onPlaceSignature={() => {
                                    if (activeSigIndex !== null) {
                                        setIsSignModalOpen(true);
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        document?.blocks.map(block => renderBlock(block))
                    )}

                    {/* Signatures Panel Inside Document */}
                    <div className="mt-12 pt-8 border-t-2 border-dashed border-gray-200">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-6">SIGNATURES & DEEDS EXECUTION INDEX</h4>
                        <div className="grid md:grid-cols-2 gap-6">
                            {signatories.map((sig, idx) => (
                                <div key={sig.id} className="p-4 rounded-2xl border bg-gray-50/40 border-gray-100 space-y-3">
                                    <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-gray-400">{sig.signatoryType} Signatory</span>
                                        {sig.isSigned ? (
                                            <span className="bg-emerald-50 text-emerald-700 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-emerald-100">Signed</span>
                                        ) : (
                                            <span className="bg-amber-50 text-amber-700 text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border border-amber-100">Awaiting Signature</span>
                                        )}
                                    </div>
                                    
                                    <div className="h-20 flex items-center justify-center border border-dashed border-gray-200 rounded-xl bg-white p-2">
                                        {sig.isSigned ? (
                                            sig.type === 'type' ? (
                                                <div className="text-3xl text-center text-indigo-900 select-none truncate w-full" style={{ fontFamily: sig.value === '0' ? 'Dancing Script' : sig.value === '1' ? 'Great Vibes' : sig.value === '2' ? 'Herr Von Muellerhoff' : 'Homemade Apple' }}>
                                                    {sig.name}
                                                </div>
                                            ) : (
                                                <img src={sig.value} alt={`${sig.name} e-signature`} className="max-h-16 max-w-full object-contain" />
                                            )
                                        ) : (
                                            <span className="text-[10px] text-gray-400 font-semibold italic">Execution Slot</span>
                                        )}
                                    </div>

                                    <div className="text-xs">
                                        <p className="font-extrabold text-gray-800">{sig.name}</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{sig.title}</p>
                                        {sig.isSigned && sig.date && (
                                            <p className="text-[9px] font-mono text-gray-400 mt-1">Validated: {sig.date}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Signing Panel Status & Actions (Column span 4) */}
                <div className="lg:col-span-4 space-y-6">
                    {/* Document Details Card */}
                    {docOverview && (
                        <div className="bg-white border border-gray-200/60 p-6 rounded-[2.5rem] shadow-xl space-y-4">
                            <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                                <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-sm">
                                    📋
                                </div>
                                <div>
                                    <h4 className="text-[9px] font-black uppercase tracking-wider text-gray-400">Document Overview</h4>
                                    <h3 className="text-xs font-black text-gray-800 line-clamp-1">{docOverview.title}</h3>
                                </div>
                            </div>

                            <div className="space-y-3 text-xs">
                                <div className="flex justify-between items-start gap-2">
                                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Origin / Sender:</span>
                                    <span className="font-extrabold text-gray-800 text-right">{docOverview.company}</span>
                                </div>
                                {docOverview.client && (
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Client Name:</span>
                                        <span className="font-extrabold text-gray-700 text-right">{docOverview.client}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Date Generated:</span>
                                    <span className="font-mono text-gray-600">{docOverview.date}</span>
                                </div>
                                {docOverview.reference && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400 font-bold uppercase tracking-wider text-[9px]">Reference:</span>
                                        <span className="font-mono text-gray-500">{docOverview.reference}</span>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-gray-100 space-y-2">
                                    <div className="flex justify-between items-center text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                        <span>Completion Status</span>
                                        <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{docOverview.signedSigs} of {docOverview.totalSigs} signed</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-indigo-600 h-2 rounded-full transition-all duration-700 ease-out" 
                                            style={{ width: `${((docOverview.signedSigs || 0) / (docOverview.totalSigs || 1)) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {isSignedSuccess ? (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2.5rem] shadow-xl space-y-5 animate-scale-up">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-lg shadow-md">✓</div>
                                <div>
                                    <h3 className="text-sm font-black text-emerald-950 uppercase tracking-tight">Execution Completed</h3>
                                    <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Secured via CraveBiZ SmartDocs</p>
                                </div>
                            </div>
                            
                            <p className="text-xs text-emerald-900 leading-relaxed font-semibold">
                                Your secure e-signature has been successfully applied and stored back in the CraveBiZ smart document directory.
                            </p>

                            <p className="text-[11px] text-gray-500 font-medium">
                                You can review your signed deed and other active signature fields directly on the document canvas on the left. When you are done, click the button below to return to the homepage.
                            </p>

                            {/* Promotional Advertisement */}
                            <div className="p-4 bg-white/70 rounded-2xl border border-emerald-100/50 space-y-2.5 shadow-sm">
                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full">Sponsored Ad</span>
                                <h4 className="text-xs font-black text-gray-900 leading-tight">Create Beautiful Invoices & Agreements in Seconds with CraveBiZ AI</h4>
                                <ul className="text-[10px] text-gray-500 space-y-1 font-semibold leading-normal">
                                    <li className="flex items-start gap-1">✨ <strong>AI Billing:</strong> Generate automated invoicing and billing streams.</li>
                                    <li className="flex items-start gap-1">📄 <strong>DocSignify:</strong> Drag, drop, and request signatures on legal deeds.</li>
                                    <li className="flex items-start gap-1">⚡ <strong>Vault Security:</strong> High-grade SME payment protection and analytics.</li>
                                </ul>
                                <p className="text-[10px] text-indigo-700 font-extrabold pt-0.5">Explore CraveBiZ today - It's 100% free!</p>
                            </div>

                            {onBackToLogin && (
                                <button
                                    onClick={onBackToLogin}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Done & Close
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Personal Invitation Block */}
                            {matchedSignatory ? (
                                <div className="bg-gradient-to-br from-indigo-50/70 to-indigo-100/30 border-2 border-indigo-200/80 p-6 rounded-[2.5rem] shadow-xl space-y-4">
                                    <div className="space-y-1">
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-wider rounded-md border border-indigo-200/40">
                                            ✨ Requested Signatory Slot
                                        </div>
                                        <h3 className="text-base font-black text-gray-900 tracking-tight mt-1">
                                            Welcome, {matchedSignatory.sig.name}!
                                        </h3>
                                        <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                            You are invited to review and execute this document as the <strong className="text-indigo-900">{matchedSignatory.sig.signatoryType} Signatory</strong>.
                                        </p>
                                    </div>

                                    <div className="p-4 bg-white rounded-2xl border border-indigo-100/80 shadow-sm space-y-3">
                                        <div className="text-xs space-y-1">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-gray-400">Your Signature Slot Details</p>
                                            <p className="font-extrabold text-gray-800 text-sm">{matchedSignatory.sig.name}</p>
                                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">{matchedSignatory.sig.title}</p>
                                            <p className="text-[10px] text-gray-400 font-mono">{matchedSignatory.sig.email}</p>
                                        </div>

                                        {matchedSignatory.sig.isSigned ? (
                                            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200/30 flex items-center gap-2">
                                                <span className="text-lg">✓</span>
                                                <div className="text-xs">
                                                    <p className="font-extrabold">You signed successfully!</p>
                                                    <p className="text-[9px] text-emerald-600 font-mono">{matchedSignatory.sig.date}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleOpenSignModalForIndex(matchedSignatory.index)}
                                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-2 animate-pulse"
                                            >
                                                ✍️ Sign Your Part Now
                                            </button>
                                        )}
                                    </div>

                                    <div className="text-center pt-1">
                                        <button
                                            onClick={() => {
                                                // Switch signatory by clearing recipient query parameter
                                                const url = new URL(window.location.href);
                                                url.searchParams.delete('recipient');
                                                window.history.replaceState({}, window.document.title, url.toString());
                                                window.location.reload();
                                            }}
                                            className="text-[10px] text-indigo-600 hover:underline font-black uppercase tracking-wider"
                                        >
                                            Not {matchedSignatory.sig.name}? Switch Signatory
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white border border-gray-200/60 p-6 rounded-[2.5rem] shadow-xl space-y-5">
                                    <div className="space-y-1">
                                        <h3 className="text-base font-black text-gray-800 uppercase tracking-tight flex items-center gap-1.5">
                                            🔒 Identify Your Signature Slot
                                        </h3>
                                        <p className="text-xs text-gray-500 font-medium leading-relaxed">
                                            Enter your email address to securely claim your signature slot, or select your slot from the checklist below.
                                        </p>
                                    </div>

                                    {/* Email Verification / Self-registration Form */}
                                    <div className="space-y-3 pt-1 border-t border-gray-100">
                                        {isAddingSelf ? (
                                            <div className="space-y-3 bg-indigo-50/40 p-4 rounded-2xl border border-indigo-100/40">
                                                <p className="text-[11px] font-bold text-indigo-900 flex items-center gap-1">
                                                    <span>👤</span> Onboard Yourself to Sign Now
                                                </p>
                                                <div className="space-y-2">
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Your Full Name</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Jane Doe"
                                                            value={selfName}
                                                            onChange={e => setSelfName(e.target.value)}
                                                            className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:outline-none bg-white"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black uppercase tracking-wider text-gray-400 block mb-0.5">Your Corporate Title</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Counterparty Representative / Client"
                                                            value={selfTitle}
                                                            onChange={e => setSelfTitle(e.target.value)}
                                                            className="w-full px-3 py-1.5 border border-gray-200 rounded-xl text-xs font-semibold focus:border-indigo-500 focus:outline-none bg-white"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        onClick={() => {
                                                            if (!selfName.trim()) {
                                                                alert("Please enter your name.");
                                                                return;
                                                            }
                                                            const newSig: SignatureInfo = {
                                                                id: 'sig_' + Math.floor(Math.random() * 899999 + 100000),
                                                                type: 'type',
                                                                value: '',
                                                                name: selfName.trim(),
                                                                title: selfTitle.trim() || 'Representative',
                                                                date: '',
                                                                signatoryType: 'Main',
                                                                email: userEmailInput.trim(),
                                                                isSigned: false,
                                                                isRequested: true
                                                            };
                                                            const updated = [...signatories, newSig];
                                                            setSignatories(updated);
                                                            setIsAddingSelf(false);
                                                            setEmailMatchError(null);
                                                            
                                                            // Open sign modal for the newly added slot immediately!
                                                            const newIdx = updated.length - 1;
                                                            setActiveSigIndex(newIdx);
                                                            setIsSignModalOpen(true);
                                                        }}
                                                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95"
                                                    >
                                                        Add & Sign Now
                                                    </button>
                                                    <button
                                                        onClick={() => setIsAddingSelf(false)}
                                                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Invited Email Address</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="email"
                                                        placeholder="name@company.com"
                                                        value={userEmailInput}
                                                        onChange={(e) => {
                                                            setUserEmailInput(e.target.value);
                                                            setEmailMatchError(null);
                                                        }}
                                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-semibold bg-white"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            if (!userEmailInput.trim() || !userEmailInput.includes('@')) {
                                                                setEmailMatchError("Please enter a valid email address.");
                                                                return;
                                                            }
                                                            const matchedIdx = signatories.findIndex(
                                                                s => s.email?.trim().toLowerCase() === userEmailInput.trim().toLowerCase()
                                                            );
                                                            if (matchedIdx > -1) {
                                                                // Update URL and reload to trigger auto-open
                                                                const url = new URL(window.location.href);
                                                                url.searchParams.set('recipient', userEmailInput.trim());
                                                                window.history.replaceState({}, window.document.title, url.toString());
                                                                window.location.reload();
                                                            } else {
                                                                setEmailMatchError("No exact invitation found matching this email address.");
                                                            }
                                                        }}
                                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors active:scale-95"
                                                    >
                                                        Verify
                                                    </button>
                                                </div>
                                                {emailMatchError && (
                                                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1.5">
                                                        <p className="text-[10px] text-red-600 font-bold">{emailMatchError}</p>
                                                        <button
                                                            onClick={() => {
                                                                setSelfName('');
                                                                setSelfTitle('Representative');
                                                                setIsAddingSelf(true);
                                                            }}
                                                            className="text-[10px] text-indigo-700 hover:underline font-black uppercase tracking-wider flex items-center gap-1"
                                                        >
                                                            ➕ Click here to add yourself as a signatory
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* All Signature Slots */}
                            <div className="bg-white border border-gray-200/60 p-6 rounded-[2.5rem] shadow-xl space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block border-b border-gray-50 pb-1.5">
                                    All Agreement Signatories ({signatories.length})
                                </label>
                                <div className="space-y-2.5">
                                    {signatories.map((sig, idx) => {
                                        const isMySlot = matchedSignatory?.index === idx;
                                        return (
                                            <button
                                                key={sig.id}
                                                disabled={sig.isSigned}
                                                onClick={() => handleOpenSignModalForIndex(idx)}
                                                className={`w-full p-3.5 border rounded-2xl text-left transition-all relative flex flex-col justify-between ${
                                                    sig.isSigned 
                                                        ? 'border-emerald-100 bg-emerald-50/20 opacity-70 cursor-not-allowed' 
                                                        : isMySlot
                                                            ? 'border-indigo-300 bg-indigo-50/30 hover:bg-indigo-50/50 ring-2 ring-indigo-500/10'
                                                            : 'border-gray-100 bg-gray-50/50 hover:bg-indigo-50/20 hover:border-indigo-200 active:scale-95'
                                                }`}
                                            >
                                                <div className="text-xs w-full font-extrabold text-gray-800 flex items-center justify-between">
                                                    <span className="truncate flex items-center gap-1.5">
                                                        {sig.name}
                                                        {isMySlot && (
                                                            <span className="bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">You</span>
                                                        )}
                                                    </span>
                                                    {sig.isSigned ? (
                                                        <span className="bg-emerald-50 border border-emerald-200/40 text-emerald-600 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded">Signed</span>
                                                    ) : (
                                                        <span className="text-[9px] text-indigo-600 font-black uppercase tracking-wider hover:underline">Sign Now</span>
                                                    )}
                                                </div>
                                                <div className="flex justify-between items-center w-full mt-1.5 text-[10px]">
                                                    <span className="text-gray-400 font-bold uppercase tracking-wider">{sig.title}</span>
                                                    {sig.email && (
                                                        <span className="font-mono text-gray-400 max-w-[140px] truncate">{sig.email}</span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {onBackToLogin && (
                                    <button
                                        onClick={onBackToLogin}
                                        className="w-full mt-2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all block text-center"
                                    >
                                        Log In as CRAVEBIZ User
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Interactive Drawing signatures sheet modal */}
            {isSignModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-5">
                        
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-base font-black text-gray-950 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-5 h-5 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                    Apply Electronic Signature
                                </h3>
                                <p className="text-xs text-gray-400 font-medium">Your signature will be mathematically logged with your name and timestamp.</p>
                            </div>
                            <button
                                onClick={() => setIsSignModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-800 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Signature Type Switch Tabs */}
                        <div className="grid grid-cols-3 bg-gray-50 border border-gray-100 p-1 rounded-xl text-center text-xs">
                            <button onClick={() => setSigType('draw')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'draw' ? 'bg-white text-indigo-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Draw Pad</button>
                            <button onClick={() => setSigType('type')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'type' ? 'bg-white text-indigo-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Type Cursive</button>
                            <button onClick={() => setSigType('upload')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'upload' ? 'bg-white text-indigo-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Signature File</button>
                        </div>

                        {/* DRAWING */}
                        {sigType === 'draw' && (
                            <div className="space-y-2">
                                <div className="border border-gray-200 rounded-2xl bg-gray-50/50 p-1 relative">
                                    <canvas
                                        ref={canvasRef}
                                        onMouseDown={startDrawing}
                                        onMouseMove={draw}
                                        onMouseUp={stopDrawing}
                                        onMouseLeave={stopDrawing}
                                        onTouchStart={startDrawing}
                                        onTouchMove={draw}
                                        onTouchEnd={stopDrawing}
                                        className="w-full h-44 bg-white rounded-xl border border-gray-100 cursor-crosshair touch-none"
                                        width={480}
                                        height={176}
                                    />
                                    <button
                                        onClick={clearCanvas}
                                        className="absolute right-3 bottom-3 px-2.5 py-1 bg-gray-950 bg-opacity-80 hover:bg-opacity-100 text-white text-[9px] font-black uppercase tracking-widest rounded transition-all"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <span className="text-[10px] text-gray-400 font-medium">Use your pointer or trackpad to sign your name on the canvas.</span>
                            </div>
                        )}

                        {/* TYPING */}
                        {sigType === 'type' && (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Signatory Full Name</label>
                                    <input
                                        type="text"
                                        value={typedName}
                                        onChange={(e) => setTypedName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                                        placeholder="Type full name letters..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Select Cursive Signature Style</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { font: "'Dancing Script', cursive", label: "Dynamic Cursive" },
                                            { font: "'Great Vibes', cursive", label: "Formal Elegant" },
                                            { font: "'Herr Von Muellerhoff', cursive", label: "Classic Calligraphy" },
                                            { font: "'Homemade Apple', cursive", label: "Handwritten Informal" }
                                        ].map((style, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedCursiveStyle(idx)}
                                                className={`p-3 border rounded-xl hover:bg-indigo-50/10 text-left transition-all ${selectedCursiveStyle === idx ? 'border-indigo-600 bg-indigo-50/20 shadow-sm ring-1 ring-indigo-500' : 'border-gray-200 bg-white'}`}
                                            >
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{style.label}</p>
                                                <p className="text-xl truncate text-indigo-955 font-bold" style={{ fontFamily: style.font }}>
                                                    {typedName || 'Signee Name'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* UPLOAD */}
                        {sigType === 'upload' && (
                            <div className="space-y-3">
                                <div className="border border-gray-200 rounded-2xl bg-gray-50/50 p-6 flex flex-col items-center justify-center relative cursor-pointer hover:bg-gray-100/40 transition-colors">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleUploadSignatureChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    {uploadedSigUrl ? (
                                        <div className="space-y-2 text-center">
                                            <img src={uploadedSigUrl} alt="Signature Upload Review" className="h-16 max-w-full object-contain mx-auto" />
                                            <p className="text-[9px] text-emerald-500 font-bold">Image loaded successfully</p>
                                        </div>
                                    ) : (
                                        <div className="text-center space-y-1.5">
                                            <span className="text-gray-400 block text-2xl">📁</span>
                                            <p className="text-xs font-black uppercase text-indigo-600">Upload signature file</p>
                                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">PNG, JPG, or SVG representation</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 pt-3">
                            <button
                                onClick={() => setIsSignModalOpen(false)}
                                className="py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplySignature}
                                className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                            >
                                Execute & Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
