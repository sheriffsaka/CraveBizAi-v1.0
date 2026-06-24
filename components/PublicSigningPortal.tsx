import React, { useState, useEffect, useRef } from 'react';
import { StoredGeneratedDoc, DocumentBlock, SignatureInfo } from '../types';
import { api } from '../lib/api';

interface PublicSigningPortalProps {
    docId: string;
    prefilledRecipient?: string;
    onBackToLogin?: () => void;
}

export default function PublicSigningPortal({ docId, prefilledRecipient, onBackToLogin }: PublicSigningPortalProps) {
    const [loading, setLoading] = useState(true);
    const [document, setDocument] = useState<StoredGeneratedDoc | null>(null);
    const [signatories, setSignatories] = useState<SignatureInfo[]>([]);
    const [activeSigIndex, setActiveSigIndex] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSignedSuccess, setIsSignedSuccess] = useState(false);

    // Signature State
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [sigType, setSigType] = useState<'draw' | 'type' | 'upload'>('draw');
    const [typedName, setTypedName] = useState('');
    const [sigTitle, setSigTitle] = useState('Representative');
    const [selectedCursiveStyle, setSelectedCursiveStyle] = useState(0);
    const [uploadedSigUrl, setUploadedSigUrl] = useState<string | null>(null);
    const [drawnSigUrl, setDrawnSigUrl] = useState<string | null>(null);
    const [redirectCountdown, setRedirectCountdown] = useState(5);

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

    // Countdown and redirect effect after successful signature
    useEffect(() => {
        if (!isSignedSuccess) return;
        
        const interval = setInterval(() => {
            setRedirectCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    if (onBackToLogin) onBackToLogin();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [isSignedSuccess, onBackToLogin]);

    // Load document on init
    useEffect(() => {
        async function fetchDoc() {
            setLoading(true);
            try {
                const fetched = await api.getPublicDoc(docId);
                if (fetched) {
                    setDocument(fetched);
                    setSignatories(fetched.signatures || []);
                    
                    // Match prefilled email signature slot
                    if (prefilledRecipient && fetched.signatures) {
                        const matchedIdx = fetched.signatures.findIndex(
                            s => s.email?.trim().toLowerCase() === prefilledRecipient.trim().toLowerCase()
                        );
                        if (matchedIdx > -1) {
                            setActiveSigIndex(matchedIdx);
                        }
                    }
                } else {
                    setError("Could not locate this agreement. Please verify your signature invite credentials.");
                }
            } catch (err: any) {
                setError("Vault retrieval failed: " + (err.message || err));
            } finally {
                setLoading(false);
            }
        }
        fetchDoc();
    }, [docId, prefilledRecipient]);

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
        if (activeSigIndex === null) return;

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

        const updatedSignatures = signatories.map((sig, idx) => {
            if (idx === activeSigIndex) {
                return {
                    ...sig,
                    isSigned: true,
                    type: sigType,
                    value: value,
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
            const success = await api.savePublicDocSignature(docId, updatedSignatures);
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
                    <p className="text-xs text-gray-600 leading-relaxed font-medium mb-4 whitespace-pre-wrap" key={id}>
                        {content.text}
                    </p>
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
                            ID: {document.id.substring(0, 8).toUpperCase()}
                        </span>
                    </div>

                    {document.blocks.map(block => renderBlock(block))}

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
                    {isSignedSuccess ? (
                        <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2.5rem] shadow-xl space-y-5 animate-scale-up">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center text-lg shadow-md animate-bounce">✓</div>
                                <div>
                                    <h3 className="text-sm font-black text-emerald-950 uppercase tracking-tight">Execution Completed</h3>
                                    <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Secured via CraveBiZ SmartDocs</p>
                                </div>
                            </div>
                            
                            <p className="text-xs text-emerald-900 leading-relaxed font-semibold">
                                Your secure e-signature has been successfully applied and stored back in the CraveBiZ smart document directory.
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

                            <div className="text-center bg-emerald-100/40 p-3 rounded-2xl border border-emerald-200/30">
                                <p className="text-xs text-emerald-950 font-bold">
                                    Redirecting to CraveBiZ homepage in <span className="font-black text-sm text-emerald-700 font-mono animate-pulse">{redirectCountdown}</span> seconds...
                                </p>
                            </div>

                            {onBackToLogin && (
                                <button
                                    onClick={onBackToLogin}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Explore CraveBiZ AI Now
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="bg-white border border-gray-200/60 p-6 rounded-[2.5rem] shadow-xl space-y-5">
                            <div className="space-y-1">
                                <h3 className="text-base font-black text-gray-800 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Execute Agreement
                                </h3>
                                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                                    Read and confirm the terms of the agreement on the left panel, then choose your signature slot below to execute.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Identify Your Signature Slot</label>
                                <div className="space-y-2">
                                    {signatories.map((sig, idx) => (
                                        <button
                                            key={sig.id}
                                            disabled={sig.isSigned}
                                            onClick={() => handleOpenSignModalForIndex(idx)}
                                            className={`w-full p-3.5 border rounded-2xl text-left transition-all relative flex flex-col justify-between ${
                                                sig.isSigned 
                                                    ? 'border-emerald-100 bg-emerald-50/20 opacity-70 cursor-not-allowed' 
                                                    : 'border-gray-100 bg-gray-50/50 hover:bg-indigo-50/20 hover:border-indigo-200 active:scale-95'
                                            }`}
                                        >
                                            <div className="text-xs w-[90%] font-extrabold text-gray-800 flex items-center justify-between">
                                                <span className="truncate">{sig.name}</span>
                                                {sig.isSigned ? (
                                                    <span className="text-[9px] text-emerald-600 block">Signed</span>
                                                ) : (
                                                    <span className="text-[9px] text-indigo-600 hover:underline block font-black uppercase tracking-wider">Sign Now</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">{sig.title}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {onBackToLogin && (
                                <button
                                    onClick={onBackToLogin}
                                    className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all block text-center"
                                >
                                    Log In as CRAVEBIZ User
                                </button>
                            )}
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
