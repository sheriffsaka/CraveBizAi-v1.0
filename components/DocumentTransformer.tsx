
import React, { useState, useRef, useEffect } from 'react';
// @ts-ignore
import mammoth from 'mammoth';
import { transformDocument, generateDocumentFromPurpose, reviewDocumentContent } from '../services/aiGenerationService';
import { GeneratedDocument, DocumentBlock, HeaderBlock, MetadataBlock, TableBlock, SummaryBlock, Company, User, StoredGeneratedDoc, DocumentReviewResult, SignatureInfo } from '../types';
import EditableBlock from './EditableBlock';
import Icon from './common/Icon';

const loadPdfJS = (): Promise<any> => {
    return new Promise((resolve, reject) => {
        if ((window as any).pdfjsLib) {
            resolve((window as any).pdfjsLib);
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.onload = () => {
            (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
            resolve((window as any).pdfjsLib);
        };
        script.onerror = () => {
            reject(new Error("Failed to load PDF parsing SDK. Please check your internet connection."));
        };
        document.head.appendChild(script);
    });
};

const extractTextFromPdf = async (arrayBuffer: ArrayBuffer): Promise<string> => {
    const pdfjsLib = await loadPdfJS();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let lastY = -1;
        let pageText = '';
        
        for (const item of textContent.items as any[]) {
            const currentY = item.transform[5];
            if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
                pageText += '\n';
            } else if (pageText.length > 0 && !pageText.endsWith(' ') && !item.str.startsWith(' ')) {
                pageText += ' ';
            }
            pageText += item.str;
            lastY = currentY;
        }
        fullText += pageText + '\n\n';
    }
    return fullText;
};

interface DocumentTransformerProps {
    company: Company | null;
    user: User | null;
    generatedDocs: StoredGeneratedDoc[];
    onSaveDoc: (doc: GeneratedDocument, id?: string) => Promise<string | undefined>;
    onDeleteDoc: (id: string) => Promise<void>;
}

const TEMPLATES = [
    {
        title: "Service Agreement",
        desc: "Build a robust web, software or design agreement.",
        prompt: "Create a Comprehensive Service Agreement between CraveBiZ and Client EliteTech for Custom Web Development and SEO management. Design phase: $2,500. Development phase: $3,500. Deployment: $1,000. Total of $7,000. Payment due in net 30 days after milestones."
    },
    {
        title: "Non-Disclosure Agreement",
        desc: "Standard mutual NDA to safeguard proprietary info.",
        prompt: "Draft a Mutual Non-Disclosure Agreement (NDA) between CraveBiZ and Partner SecureVentures to protect tech architectures, source codes, and API secrets. Term: 5 years from signing. Jurisdiction: Lagos State, Nigeria."
    },
    {
        title: "Consulting Proposal",
        desc: "Professional detailed agency proposal with pricing.",
        prompt: "Draft an Executive Consulting Proposal detailing market entry strategy, brand positioning audis and corporate workshops. Stage 1 Audits: $3,000, Stage 2 Corporate Workshops: $5,000. Terms: 50% upfront, balance upon presentation of final deck."
    },
    {
        title: "Independent Contractor",
        desc: "Contractor agreement detailing delivery terms.",
        prompt: "Create an Independent Contractor Contract for a Senior UI/UX Designer, monthly retainer of $3,200. Hours capped at 30 per week. IP assignment is 100% owned by the client upon receipt of payments."
    }
];

function compileDocumentOffline(purpose: string, companyContext: any): GeneratedDocument {
    const today = new Date().toLocaleDateString();
    
    // Heuristic parser
    let clientName = "Acme Client Corp";
    const clientMatches = purpose.match(/(?:between|and|client|partner)\s+([A-Z][a-zA-Z0-9\s]{2,25})/i);
    if (clientMatches && clientMatches[1]) {
        const cleanVal = clientMatches[1].trim();
        if (cleanVal.toLowerCase() !== companyContext.name.toLowerCase() && cleanVal.toLowerCase() !== 'client' && cleanVal.toLowerCase() !== 'partner') {
            clientName = cleanVal;
        }
    }
    
    // Fee detection
    const dollarMatches = purpose.match(/\$[0-9,]+/g);
    const feeString = dollarMatches ? dollarMatches.join(", ") : "$5,000.00";
    
    // Jurisdiction
    let jurisdiction = "Lagos State, Nigeria";
    const jurMatch = purpose.match(/(?:jurisdiction|laws of|governing law:?)\s+([A-Z][a-zA-Z0-9\s,]{2,30})/i);
    if (jurMatch && jurMatch[1]) {
        jurisdiction = jurMatch[1].trim();
    }

    const documentTitle = purpose.toLowerCase().includes('nda') || purpose.toLowerCase().includes('disclosure') 
        ? "MUTUAL NON-DISCLOSURE AGREEMENT" 
        : purpose.toLowerCase().includes('consult')
        ? "EXECUTIVE CONSULTING PROPOSAL"
        : purpose.toLowerCase().includes('contractor')
        ? "INDEPENDENT CONTRACTOR AGREEMENT"
        : "PARTNERSHIP SERVICE AGREEMENT";

    const blocks: DocumentBlock[] = [
        {
            id: 'hdr_' + Math.floor(Math.random() * 10000),
            type: 'header',
            content: {
                companyName: companyContext.name,
                address: companyContext.address,
                email: companyContext.email,
                phone: companyContext.phone,
                website: companyContext.website
            }
        },
        {
            id: 'meta_' + Math.floor(Math.random() * 10000),
            type: 'metadata',
            content: {
                documentTitle: documentTitle,
                clientName: clientName,
                preparedBy: companyContext.name,
                date: today,
                reference: "REF-" + Math.floor(Math.random() * 89999 + 10000)
            }
        },
        {
            id: 'title_1',
            type: 'title',
            content: { text: "1. COVENANT OF ENGAGEMENT" }
        },
        {
            id: 'p_1',
            type: 'paragraph',
            content: { text: `This Agreement is effective as of ${today} by and between ${companyContext.name} and the esteemed client, ${clientName}. This contract formalizes the parameters and terms requested relative to: ${purpose}.` }
        }
    ];

    if (documentTitle.includes("NON-DISCLOSURE")) {
        blocks.push(
            {
                id: 'title_2',
                type: 'title',
                content: { text: "2. DEFINITION OF CONFIDENTIAL INFORMATION" }
            },
            {
                id: 'p_2',
                type: 'paragraph',
                content: { text: "Confidential Information refers to proprietary technical architectures, designs, workflows, user-experiences, business strategies, and all other strategic info designated as protected or provided under NDA." }
            },
            {
                id: 'title_3',
                type: 'title',
                content: { text: "3. PERFORMANCE TERM & NON-COMPETE LIMITS" }
            },
            {
                id: 'p_3',
                type: 'paragraph',
                content: { text: "This non-disclosure covenant remains strictly in force for five (5) consecutive years from the execution date. Both parties pledge not to leverage or compile the other's intellectual components for competitive duplication outside this venture." }
            }
        );
    } else {
        blocks.push(
            {
                id: 'title_2',
                type: 'title',
                content: { text: "2. SCHEDULE OF SERVICES & SCOPE" }
            },
            {
                id: 'p_2',
                type: 'paragraph',
                content: { text: `The service provider shall deliver the professional packages or execution items details under: ${purpose}. All deliverables will be reviewed under modern QA practices to meet enterprise standards.` }
            },
            {
                id: 'title_3',
                type: 'title',
                content: { text: "3. FINANCIAL CONSIDERATION & BILLING STAGES" }
            },
            {
                id: 'p_3',
                type: 'paragraph',
                content: { text: `In consideration for the fulfillment of the detailed tasks, the Client shall pay a total sum of ${feeString}, which is structured under standard net-30 terms post-milestone delivery, unless otherwise customized.` }
            },
            {
                id: 'tbl_1',
                type: 'table',
                content: {
                    headers: ["Description Milestones", "Associated Stage", "Assigned Cost"],
                    rows: [
                        ["Initial Setup / Kick-off", "Phase 1", "$1,500.00"],
                        ["Core Development & Drafting", "Phase 2", "$3,000.00"],
                        ["Client Signoff & Activation", "Phase 3", "$1,500.00"],
                    ]
                }
            }
        );
    }

    blocks.push(
        {
            id: 'title_final',
            type: 'title',
            content: { text: "4. JURISDICTION & GOVERNING LAWS" }
        },
        {
            id: 'p_final',
            type: 'paragraph',
            content: { text: `We hereby declare that all conditions and responsibilities outlined in this document shall be interpreted and governed by the laws and regulations in ${jurisdiction}.` }
        },
        {
            id: 'footer_idx',
            type: 'footer',
            content: { text: `Compiled locally by CraveBiZ SmartDocs Engine. (CraveBiZ No-AI Offline Compiler)` }
        }
    );

    return {
        documentType: documentTitle,
        blocks
    };
}

const DocumentTransformer: React.FC<DocumentTransformerProps> = ({ company, user, generatedDocs, onSaveDoc, onDeleteDoc }) => {
    // Tab State: generate (Purpose-made), sign (E-Signature), manage (Workspace Archive)
    const [activeTab, setActiveTab] = useState<'generate' | 'sign' | 'manage'>('generate');
    const [useLocalCompiler, setUseLocalCompiler] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // General state
    const [rawText, setRawText] = useState('');
    const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Feature i: Generate Document by Purpose
    const [documentPurpose, setDocumentPurpose] = useState('');

    // Feature ii: E-Signature
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [sigType, setSigType] = useState<'draw' | 'type' | 'upload'>('draw');
    const [typedName, setTypedName] = useState(user?.full_name || 'Sheriff Dean');
    const [selectedCursiveStyle, setSelectedCursiveStyle] = useState<number>(0);
    const [sigTitle, setSigTitle] = useState('Executive Partner');
    const [drawnSigUrl, setDrawnSigUrl] = useState<string | null>(null);
    const [uploadedSigUrl, setUploadedSigUrl] = useState<string | null>(null);
    const [appliedSignature, setAppliedSignature] = useState<{
        type: 'draw' | 'type' | 'upload';
        value: string;
        name: string;
        title: string;
        date: string;
    } | null>(null);

    // Drawing Canvas references
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Feature iii: Document Review & Analysis
    const [reviewText, setReviewText] = useState('');
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewReport, setReviewReport] = useState<DocumentReviewResult | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploadedFileName, setUploadedFileName] = useState('');

    // Dynamic Multi-Signatories states
    const [signatories, setSignatories] = useState<SignatureInfo[]>([]);
    const [activeSignatoryIndex, setActiveSignatoryIndex] = useState<number | null>(null);
    const [newSigName, setNewSigName] = useState('');
    const [newSigTitle, setNewSigTitle] = useState('');
    const [newSigEmail, setNewSigEmail] = useState('');
    const [newSigType, setNewSigType] = useState<'Main' | 'Witness'>('Main');
    const [editingDocId, setEditingDocId] = useState<string | null>(null);

    const [isAddSignatoryModalOpen, setIsAddSignatoryModalOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestingSigIndex, setRequestingSigIndex] = useState<number | null>(null);
    const [requestEmail, setRequestEmail] = useState('');
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isDocumentSubmitted, setIsDocumentSubmitted] = useState(false);
    const [isRequestSuccessModalOpen, setIsRequestSuccessModalOpen] = useState(false);
    const [savedSigningUrl, setSavedSigningUrl] = useState('');
    const [savedMailtoUrl, setSavedMailtoUrl] = useState('');
    const [latestRequestedEmail, setLatestRequestedEmail] = useState('');
    const [savedEmailSubject, setSavedEmailSubject] = useState('');
    const [savedEmailBody, setSavedEmailBody] = useState('');

    const triggerToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const handleAddSignatorySubmit = () => {
        if (!newSigName.trim()) {
            alert("Please enter the signatory's full name.");
            return;
        }
        if (!newSigTitle.trim()) {
            alert("Please enter their corporate/legal title.");
            return;
        }

        const newSlot: SignatureInfo = {
            id: 'sig_' + Math.floor(Math.random() * 899999 + 100000),
            type: 'type',
            value: '',
            name: newSigName.trim(),
            title: newSigTitle.trim(),
            date: '',
            signatoryType: newSigType,
            email: newSigEmail.trim(),
            isSigned: false,
            isRequested: false
        };

        const updated = [...signatories, newSlot];
        setSignatories(updated);

        if (generatedDoc) {
            const nextDoc = {
                ...generatedDoc,
                signatures: updated
            };
            setGeneratedDoc(nextDoc);
            onSaveDoc(nextDoc, editingDocId || undefined).then(savedId => {
                if (savedId) setEditingDocId(savedId);
            });
        }

        // Reset fields & close
        setNewSigName('');
        setNewSigTitle('');
        setNewSigEmail('');
        setNewSigType('Main');
        setIsAddSignatoryModalOpen(false);

        triggerToast(`Signatory "${newSlot.name}" added as ${newSlot.signatoryType} Signatory successfully.`);
    };

    const handleOpenRequestModal = (index: number) => {
        setRequestingSigIndex(index);
        const sig = signatories[index];
        if (sig) {
            setRequestEmail(sig.email || '');
        } else {
            setRequestEmail('');
        }
        setIsRequestModalOpen(true);
    };

    const handleSendRequestSubmit = () => {
        if (requestingSigIndex === null) return;
        if (!requestEmail.trim() || !requestEmail.includes('@')) {
            alert("Please enter a valid email address.");
            return;
        }

        const updated = signatories.map((sig, idx) => {
            if (idx === requestingSigIndex) {
                return {
                    ...sig,
                    email: requestEmail.trim(),
                    isRequested: true
                };
            }
            return sig;
        });

        setSignatories(updated);

        if (generatedDoc) {
            const nextDoc = {
                ...generatedDoc,
                signatures: updated
            };
            setGeneratedDoc(nextDoc);
            
            onSaveDoc(nextDoc, editingDocId || undefined).then(savedId => {
                if (savedId) {
                    setEditingDocId(savedId);
                    
                    // Generate Direct Recipient Link
                    const signingUrl = `${window.location.origin}/?docId=${savedId}&recipient=${encodeURIComponent(requestEmail.trim())}`;
                    
                    // Pre-fill email mailto client Link
                    const plainSubject = `Action Required: Secure Electronic Signature Requested for Agreement`;
                    const plainBody = `Hello,\n\nYou have been requested to review and electronic-sign the following agreement: ${nextDoc.documentType}.\n\nPlease click the secure e-sign link below to view, sign, and submit your signature back to the sender:\n\n${signingUrl}\n\nThank you,\nCraveBiZ SmartDocs Secures`;
                    
                    const subject = encodeURIComponent(plainSubject);
                    const body = encodeURIComponent(plainBody);
                    const mailtoUrl = `mailto:${requestEmail.trim()}?subject=${subject}&body=${body}`;
                    
                    setSavedSigningUrl(signingUrl);
                    setSavedMailtoUrl(mailtoUrl);
                    setSavedEmailSubject(plainSubject);
                    setSavedEmailBody(plainBody);
                    setLatestRequestedEmail(requestEmail.trim());
                    setIsRequestSuccessModalOpen(true);
                    
                    // Trigger mailto composer dynamically after a short delay
                    setTimeout(() => {
                        window.location.href = mailtoUrl;
                    }, 400);
                }
            });
        }

        setIsRequestModalOpen(false);
        setRequestingSigIndex(null);
        setRequestEmail('');

        triggerToast(`Secure signature request dispatch success! Preparing links and mailto client...`);
    };

    // Print & Layout references
    const documentRef = useRef<HTMLDivElement>(null);

    // Dynamically load elegant signature cursive fonts
    useEffect(() => {
        const link = document.createElement('link');
        link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Great+Vibes&family=Herr+Von+Muellerhoff&family=Homemade+Apple&display=swap';
        link.rel = 'stylesheet';
        document.head.appendChild(link);
        return () => {
             if (document.head.contains(link)) {
                 document.head.removeChild(link);
             }
        };
    }, []);

    const initializeSignatoriesForNewDoc = (doc: GeneratedDocument) => {
        if (doc.signatures && doc.signatures.length > 0) {
            setSignatories(doc.signatures);
        } else {
            const creatorSlot: SignatureInfo = {
                id: 'creator',
                type: 'type',
                value: '',
                name: user?.full_name || company?.name || 'Creator',
                title: 'Authorized Representative',
                date: '',
                signatoryType: 'Main',
                email: user?.email || '',
                isSigned: false
            };
            setSignatories([creatorSlot]);
        }
    };

    const handleLoadNewDocument = (doc: GeneratedDocument) => {
        const creatorSlot: SignatureInfo = {
            id: 'creator',
            type: 'type',
            value: '',
            name: user?.full_name || company?.name || 'Creator',
            title: 'Authorized Representative',
            date: '',
            signatoryType: 'Main',
            email: user?.email || '',
            isSigned: false
        };
        const finalDoc = {
            ...doc,
            signatures: doc.signatures && doc.signatures.length > 0 ? doc.signatures : [creatorSlot]
        };
        setGeneratedDoc(finalDoc);
        setSignatories(finalDoc.signatures);
        setEditingDocId(null);
    };

    // Synchronize company defaults
    const getCompanyContext = () => {
        if (!company) return { name: 'CraveBiZ Corp', address: 'Plot 10, Victoria Island, Lagos', email: 'hello@cravebiz.ai', phone: '+234 800 000 0000', website: 'cravebiz.ai', logoUrl: '' };
        return {
            name: company.name,
            address: company.address,
            email: company.email,
            phone: company.phone || '',
            website: company.website || '',
            logoUrl: company.logoUrl || ''
        };
    };

    // Prompt-based generation (Feature i)
    const handleGenerateByPurpose = async () => {
        if (!documentPurpose.trim()) {
            setError('Please enter the nature or purpose of the document to generate.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedDoc(null);
        setAppliedSignature(null); // Reset signature for new document
        
        const context = getCompanyContext();

        try {
            const result = await generateDocumentFromPurpose(documentPurpose, context);
            if (result) {
                handleLoadNewDocument(result);
            } else {
                console.warn("AI returned empty, falling back to local offline template compiler.");
                const fallbackResult = compileDocumentOffline(documentPurpose, context);
                handleLoadNewDocument(fallbackResult);
            }
        } catch (e) {
            console.warn("Failsafe triggers offline local compiler:", e);
            const fallbackResult = compileDocumentOffline(documentPurpose, context);
            handleLoadNewDocument(fallbackResult);
        } finally {
            setIsLoading(false);
        }
    };

    // Offline block compiler for signing (completely works offline, no API keys necessary!)
    const handlePrepareSignDocument = () => {
        const textToUse = rawText.trim();
        if (!textToUse && !uploadedFileName) {
            setError('Please first input some agreement clauses or drag & drop a document backup file above.');
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedDoc(null);
        setAppliedSignature(null);

        try {
            const context = getCompanyContext();
            let parsedDoc: GeneratedDocument | null = null;

            // Attempt to parse structured backup JSON
            if (uploadedFileName.endsWith('.json')) {
                try {
                    const parsed = JSON.parse(textToUse);
                    if (parsed && typeof parsed === 'object' && parsed.blocks && Array.isArray(parsed.blocks)) {
                        parsedDoc = {
                            documentType: parsed.documentType || "Uploaded JSON Agreement",
                            blocks: parsed.blocks
                        };
                    }
                } catch (err) {
                    console.warn("Uploaded JSON does not conform to generated blocks layout. Processing as plain raw text instead.");
                }
            }

            if (!parsedDoc) {
                const parts = textToUse.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                const blocks: DocumentBlock[] = [];
                
                // Only include company header branding and metadata if there's no uploaded file
                if (!uploadedFileName) {
                    blocks.push({
                        id: 'hdr_l_' + Math.floor(Math.random() * 10000),
                        type: 'header',
                        content: {
                            companyName: context.name,
                            address: context.address,
                            email: context.email,
                            phone: context.phone,
                            website: context.website
                        }
                    });

                    blocks.push({
                        id: 'meta_l_' + Math.floor(Math.random() * 10000),
                        type: 'metadata',
                        content: {
                            documentTitle: "Assigned Signature Agreement",
                            clientName: "Authorized Counterparty",
                            preparedBy: user?.full_name || "Contract Admin",
                            date: new Date().toLocaleDateString(),
                            reference: "REF-" + Math.floor(Math.random() * 89999 + 10000)
                        }
                    });
                }

                parts.forEach((part, index) => {
                    const lines = part.split('\n').map(l => l.trim()).filter(Boolean);
                    if (!uploadedFileName && lines.length === 1 && lines[0].length < 100 && (index === 0 || lines[0] === lines[0].toUpperCase())) {
                        blocks.push({
                            id: `title_l_${index}`,
                            type: 'title',
                            content: { text: lines[0] }
                        });
                    } else {
                        blocks.push({
                            id: `p_l_${index}`,
                            type: 'paragraph',
                            content: { text: part }
                        });
                    }
                });

                if (!uploadedFileName) {
                    blocks.push({
                        id: 'footer_l',
                        type: 'footer',
                        content: { text: "Prepared and formatted locally via CraveBiZ Secure eSign offline module." }
                    });
                }

                parsedDoc = {
                    documentType: uploadedFileName ? fileLabelClean(uploadedFileName) : "Local Agreement",
                    blocks
                };
            }

            if (parsedDoc) {
                handleLoadNewDocument(parsedDoc);
            }
        } catch (e: any) {
            setError("Failed to compile local blocks structure for signing: " + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Format raw text using AI (Optional fallback)
    const handleFormatRawText = async () => {
        if (!rawText.trim()) {
            setError('Please input or paste raw content first.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedDoc(null);
        setAppliedSignature(null);
        try {
            const context = getCompanyContext();
            const result = await transformDocument(rawText, context);
            if (result) {
                handleLoadNewDocument(result);
            } else {
                setError("Format operation failed. The unstructured text format is unrecognizable.");
            }
        } catch (e) {
            setError("A network error occurred formatting raw text.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    // File Drop & Parse Processing (Feature iii)
    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) {
            processUploadedFile(file);
        }
    };

    const processUploadedFile = (file: File) => {
        setUploadedFileName(file.name);
        setError(null);
        
        if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
            setIsLoading(true);
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target?.result as ArrayBuffer;
                    const extractedText = await extractTextFromPdf(arrayBuffer);
                    setRawText(extractedText);
                    setReviewText(extractedText);
                    
                    const parts = extractedText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                    const blocks: DocumentBlock[] = [];

                    parts.forEach((part, index) => {
                        blocks.push({
                            id: `p_l_${index}`,
                            type: 'paragraph',
                            content: { text: part }
                        });
                    });

                    const parsedDoc: GeneratedDocument = {
                        documentType: fileLabelClean(file.name) || "Uploaded Document",
                        blocks
                    };

                    handleLoadNewDocument(parsedDoc);
                } catch (err: any) {
                    console.error("PDF extraction error:", err);
                    setError("Failed to extract text from PDF: " + err.message);
                } finally {
                    setIsLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        if (file.name.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            setIsLoading(true);
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target?.result as ArrayBuffer;
                    // @ts-ignore
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    const extractedText = result.value;
                    setRawText(extractedText);
                    setReviewText(extractedText);
                    
                    const parts = extractedText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                    const blocks: DocumentBlock[] = [];

                    parts.forEach((part, index) => {
                        blocks.push({
                            id: `p_l_${index}`,
                            type: 'paragraph',
                            content: { text: part }
                        });
                    });

                    const parsedDoc: GeneratedDocument = {
                        documentType: fileLabelClean(file.name) || "Uploaded Document",
                        blocks
                    };

                    handleLoadNewDocument(parsedDoc);
                } catch (err: any) {
                    console.error("Word Doc extraction error:", err);
                    setError("Failed to extract text from Word document: " + err.message);
                } finally {
                    setIsLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        setError("Unsupported file format. Please upload a PDF (.pdf) or Word (.docx) document.");
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processUploadedFile(file);
        }
    };

    // AI Review Analysis (Feature iii)
    const handleAnalyzeText = async (textToAnalyze: string) => {
        const targetText = textToAnalyze || reviewText;
        if (!targetText.trim()) {
            setError('Please write, paste or upload some text to review first.');
            return;
        }
        setReviewLoading(true);
        setError(null);
        setReviewReport(null);
        try {
            const result = await reviewDocumentContent(targetText);
            if (result) {
                setReviewReport(result);
                // Dynamically populate standard preview for the uploaded file so user can sign it in-app!
                if (!generatedDoc) {
                    const parsedDoc: GeneratedDocument = {
                        documentType: "Uploaded Document",
                        blocks: [
                            { id: 'p_up', type: 'paragraph', content: { text: targetText.substring(0, 5000) } }
                        ]
                    };
                    setGeneratedDoc(parsedDoc);
                }
            } else {
                setError("The compliance intelligence model was unable to parse this material.");
            }
        } catch (e) {
            setError("Analysis process interrupted. Gemini node is currently rate-limited.");
            console.error(e);
        } finally {
            setReviewLoading(false);
        }
    };

    const fileLabelClean = (fname: string) => {
        if (!fname) return '';
        return fname.replace(/\.[^/.]+$/, "").replace(/[_\-]/g, " ");
    };

    // Canvas drawing signature mechanics
    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.strokeStyle = '#1e3a8a'; // Deep blue signature ink
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
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
        setActiveSignatoryIndex(index);
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

    // Apply E-Signature
    const handleApplySignature = () => {
        let value = '';
        if (sigType === 'draw') {
            const canvas = canvasRef.current;
            if (canvas) {
                value = canvas.toDataURL();
            } else if (drawnSigUrl) {
                value = drawnSigUrl;
            }
        } else if (sigType === 'type') {
            if (!typedName.trim()) {
                alert('Please type your signature letters.');
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
        
        // Find which slot we represent
        const activeIndex = activeSignatoryIndex !== null ? activeSignatoryIndex : 0;
        const updatedSignatories = signatories.map((sig, i) => {
            if (i === activeIndex) {
                return {
                    ...sig,
                    type: sigType,
                    value: value,
                    name: typedName || sig.name || 'User Verified',
                    title: sigTitle || sig.title || 'Representative',
                    date: dateStr,
                    isSigned: true
                };
            }
            return sig;
        });

        // Set local state
        setSignatories(updatedSignatories);
        setAppliedSignature({
            type: sigType,
            value: value,
            name: typedName || 'User Verified',
            title: sigTitle || 'Authorized Representative',
            date: dateStr
        });

        // Sync and save immediately!
        if (generatedDoc) {
            const nextDoc = {
                ...generatedDoc,
                signatures: updatedSignatories
            };
            setGeneratedDoc(nextDoc);
            onSaveDoc(nextDoc, editingDocId || undefined).then(savedId => {
                if (savedId) setEditingDocId(savedId);
            });
        }

        setIsSignModalOpen(false);
    };

    // Export documents
    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = () => {
        const element = documentRef.current;
        if (!element || !(window as any).html2pdf) return;
        const opt = {
            margin: 10,
            filename: `${generatedDoc?.documentType || 'document'}_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        (window as any).html2pdf().set(opt).from(element).save();
    };

    const handleSendEmail = () => {
        const subject = `E-Signed Document Notification: ${generatedDoc?.documentType || 'Document'}`;
        const body = `Hello,

Please inspect our finalized, e-signed ${generatedDoc?.documentType || 'Document'}.

E-SIGNED BY: ${appliedSignature ? `${appliedSignature.name} (${appliedSignature.title}) on ${appliedSignature.date}` : 'Awaiting counterparty verification.'}

Best regards,
${company?.name || 'CraveBiZ Vendor'}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleViewHistoryDoc = (doc: StoredGeneratedDoc) => {
        const creatorSlot: SignatureInfo = {
            id: 'creator',
            type: 'type',
            value: '',
            name: user?.full_name || company?.name || 'Creator',
            title: 'Authorized Representative',
            date: '',
            signatoryType: 'Main',
            email: user?.email || '',
            isSigned: false
        };
        const loadedSigs = doc.signatures && doc.signatures.length > 0 ? doc.signatures : [creatorSlot];

        setGeneratedDoc({
            documentType: doc.documentType,
            blocks: doc.blocks,
            signatures: loadedSigs
        });
        setSignatories(loadedSigs);
        setEditingDocId(doc.id);
        setAppliedSignature(null);
        setError(null);
        setReviewReport(null);
    };

    const handleUpdateBlock = (blockId: string, newContent: any) => {
        if (!generatedDoc) return;
        const updatedBlocks = generatedDoc.blocks.map(block =>
            block.id === blockId ? { ...block, content: newContent } : block
        );
        const nextDoc = { ...generatedDoc, blocks: updatedBlocks };
        setGeneratedDoc(nextDoc);
        // Auto-save any inline updates to our active working copy
        onSaveDoc({ ...nextDoc, signatures: signatories }, editingDocId || undefined).then(savedId => {
            if (savedId) setEditingDocId(savedId);
        });
    };

    const handleSaveCurrentDocument = () => {
        if (!generatedDoc) return;
        const savedDoc = {
            ...generatedDoc,
            signatures: signatories
        };
        onSaveDoc(savedDoc, editingDocId || undefined).then(savedId => {
            if (savedId) {
                setEditingDocId(savedId);
                triggerToast("Document progress successfully saved to Vault!");
            }
        });
    };

    const renderBlock = (block: DocumentBlock) => {
        const { id, type, content } = block;
        switch (type) {
            case 'header':
                const header = content as HeaderBlock;
                return (
                    <div className="flex justify-between items-start pb-6 border-b-2 border-gray-800">
                        <div className="flex items-center gap-5">
                            {company?.logoUrl ? <img src={company.logoUrl} alt="Logo" className="h-14 w-auto object-contain" /> : <div className="h-14 w-14 bg-gray-100 flex items-center justify-center rounded text-[10px] font-bold text-gray-400">Logo</div>}
                            <div>
                                <EditableBlock as="h2" value={header.companyName} onUpdate={val => handleUpdateBlock(id, { ...header, companyName: val })} className="text-xl font-bold text-gray-800" />
                                <EditableBlock as="p" value={header.address} onUpdate={val => handleUpdateBlock(id, { ...header, address: val })} className="text-[10px] text-gray-500 mt-0.5" />
                                <div className="text-[10px] text-gray-400 mt-0.5 font-medium">
                                    <EditableBlock as="span" value={header.email} onUpdate={val => handleUpdateBlock(id, { ...header, email: val })} /> | <EditableBlock as="span" value={header.phone} onUpdate={val => handleUpdateBlock(id, { ...header, phone: val })} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'metadata':
                const meta = content as MetadataBlock;
                return (
                    <div className="my-6 grid grid-cols-2 gap-4">
                        <div>
                            <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tight">
                                <EditableBlock as="span" value={meta.documentTitle} onUpdate={val => handleUpdateBlock(id, { ...meta, documentTitle: val })} />
                            </h1>
                            <EditableBlock as="p" value={`Ref: ${meta.reference}`} onUpdate={val => handleUpdateBlock(id, { ...meta, reference: val.replace('Ref: ', '') })} className="text-xs text-gray-400 mt-0.5 font-mono" />
                        </div>
                        <div className="text-xs space-y-1 text-right">
                            <div className="grid grid-cols-2 items-center text-right"><strong className="text-gray-500 font-medium">Prepared For:</strong> <EditableBlock as="span" value={meta.clientName} onUpdate={val => handleUpdateBlock(id, { ...meta, clientName: val })} className="font-bold text-gray-800" /></div>
                            <div className="grid grid-cols-2 items-center text-right"><strong className="text-gray-500 font-medium">Date Issued:</strong> <EditableBlock as="span" value={meta.date} onUpdate={val => handleUpdateBlock(id, { ...meta, date: val })} className="font-bold text-gray-800" /></div>
                            <div className="grid grid-cols-2 items-center text-right"><strong className="text-gray-500 font-medium">Consultant:</strong> <EditableBlock as="span" value={meta.preparedBy} onUpdate={val => handleUpdateBlock(id, { ...meta, preparedBy: val })} className="font-bold text-gray-800" /></div>
                        </div>
                    </div>
                );
            case 'title':
                return <EditableBlock as="h3" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} className="text-base font-bold text-gray-800 mt-6 mb-3 border-b-2 border-gray-100 pb-1 uppercase tracking-wider" />;
            case 'paragraph':
                return <EditableBlock as="p" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} className="text-xs text-gray-600 leading-relaxed mb-3 whitespace-pre-wrap" />;
            case 'table':
                const table = content as TableBlock;
                return (
                    <table className="w-full text-xs my-4 border-collapse">
                        <thead>
                            <tr className="bg-gray-800 text-white">
                                {table.headers.map((h, i) => <th key={i} className="py-1.5 px-2 text-left font-bold uppercase tracking-wider text-[10px]"><EditableBlock as="span" value={h} onUpdate={val => { const newHeaders = [...table.headers]; newHeaders[i] = val; handleUpdateBlock(id, { ...table, headers: newHeaders }); }} /></th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {table.rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-gray-100 font-medium text-gray-700">
                                    {row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 px-2 align-top"><EditableBlock as="span" value={cell} onUpdate={val => { const newRows = [...table.rows]; newRows[rowIndex][cellIndex] = val; handleUpdateBlock(id, { ...table, rows: newRows }); }} /></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            case 'summary':
                const summary = content as SummaryBlock;
                return (
                    <div className="flex justify-end my-4">
                        <div className="w-full max-w-xs space-y-1.5 text-xs border-t pt-3 border-gray-200">
                            {summary.subtotal !== undefined && <div className="flex justify-between"><strong className="text-gray-500 font-medium">Subtotal:</strong> <span>{summary.currency}<EditableBlock as="span" value={(summary.subtotal || 0).toString()} onUpdate={val => handleUpdateBlock(id, { ...summary, subtotal: Number(val) })} /></span></div>}
                            {summary.tax !== undefined && <div className="flex justify-between"><strong className="text-gray-500 font-medium">VAT & Taxes:</strong> <span>{summary.currency}<EditableBlock as="span" value={(summary.tax || 0).toString()} onUpdate={val => handleUpdateBlock(id, { ...summary, tax: Number(val) })} /></span></div>}
                            <div className="flex justify-between font-bold text-sm border-t pt-1.5 mt-1.5 border-gray-200"><strong className="text-gray-800">Grand Total:</strong> <span className="text-primary-700">{summary.currency || '$'}<EditableBlock as="span" value={(summary.total || 0).toString()} onUpdate={val => handleUpdateBlock(id, { ...summary, total: Number(val) })} /></span></div>
                            {summary.notes && <div className="pt-2 text-[10px] text-gray-400 font-medium italic"><EditableBlock as="p" value={summary.notes} onUpdate={val => handleUpdateBlock(id, { ...summary, notes: val })} /></div>}
                        </div>
                    </div>
                );
            case 'footer':
                return <div className="text-center text-[10px] text-gray-400 mt-8 pt-3 border-t"><EditableBlock as="p" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} /></div>;
            default:
                return null;
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                <div>
                    <h1 className="text-3xl font-black text-gray-950 uppercase tracking-tighter">SmartDocs</h1>
                    <p className="text-gray-500 text-sm font-medium mt-1">Generate professional templates, execute secure legal e-signatures, and obtain compliance reviews instantly.</p>
                </div>
                
                {/* Visual Accent Badge */}
                <div className="p-3 bg-primary-100 rounded-xl flex items-center gap-2 border border-primary-200/50 shadow-sm">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-primary-900 uppercase tracking-wider">Secure GenAI Engine Active</span>
                </div>
            </div>

            {/* Hub Tab Switcher */}
            <div className="grid grid-cols-3 bg-gray-100 p-1.5 rounded-xl border border-gray-200/50 my-6 shadow-sm">
                <button
                    onClick={() => { setActiveTab('generate'); setError(null); }}
                    className={`py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'generate' ? 'bg-white text-primary-900 shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    DocGenerator
                </button>
                <button
                    onClick={() => { setActiveTab('sign'); setError(null); }}
                    className={`py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'sign' ? 'bg-white text-primary-900 shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                    DocSignify
                </button>
                <button
                    onClick={() => { setActiveTab('manage'); setError(null); }}
                    className={`py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'manage' ? 'bg-white text-primary-900 shadow-md' : 'text-gray-600 hover:text-gray-900'}`}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    DocManager
                </button>
            </div>

            {/* Inner Dashboard Layout - Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* LEFT INTERACTIVE PANEL: Column Span 5 */}
                <div className="lg:col-span-5 space-y-6">
                    
                    {/* Render Form based on Active Tab */}
                    {activeTab === 'generate' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200/50 shadow-sm space-y-4">
                            <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                                Purpose-Made Smart Document
                            </h2>
                            <p className="text-xs text-gray-500 font-medium mb-4 leading-relaxed">State the nature, parameters or rules for your desired document and let the GenAI architect draft a formatted business copy.</p>
                            
                            <textarea
                                value={documentPurpose}
                                onChange={(e) => setDocumentPurpose(e.target.value)}
                                placeholder="Describe your document requirements—such as 'Service agreement with Joe Design Studio for 3 logo packages costing $1200 total, 50% retainer, delivery next month'..."
                                className="w-full h-44 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 text-xs leading-relaxed font-medium placeholder-gray-400 bg-gray-50/50"
                                disabled={isLoading}
                            />

                            {/* Local offline compiler toggle */}
                            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <span className="text-xs font-bold text-gray-700 block">Offline Local Compiler</span>
                                    <span className="text-[10px] text-gray-400 block font-medium">Bypass AI & compile instantly offline</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={useLocalCompiler}
                                        onChange={(e) => setUseLocalCompiler(e.target.checked)}
                                        className="sr-only peer" 
                                    />
                                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
                                </label>
                            </div>

                            {/* Template Suggestions Chips */}
                            <div>
                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Quick Launch Presets:</span>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    {TEMPLATES.map((tmpl, idx) => (
                                        <button
                                            key={idx}
                                            onClick={() => setDocumentPurpose(tmpl.prompt)}
                                            className="p-2 border border-gray-100 rounded-lg hover:border-primary-200 hover:bg-primary-50/30 transition-all text-left group"
                                        >
                                            <p className="text-[11px] font-bold text-gray-700 group-hover:text-primary-700">{tmpl.title}</p>
                                            <p className="text-[9px] text-gray-400 truncate mt-0.5">{tmpl.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateByPurpose}
                                disabled={isLoading || !documentPurpose.trim()}
                                className="w-full mt-2 py-3.5 bg-primary-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-primary-700 active:scale-95 shadow-md shadow-primary-200/50 transition-all disabled:bg-gray-400 disabled:shadow-none"
                            >
                                {isLoading ? 'Compiling Document...' : 'DocGenerator'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'sign' && (
                        <>
                            <div className="bg-white p-5 rounded-2xl border border-gray-200/50 shadow-sm space-y-4">
                                <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                                    Client Sign-Off & Upload
                                </h2>
                                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                                    Upload any professional Word (.docx) or PDF (.pdf) file. We will extract and automatically map its text onto our premium signable canvas.
                                </p>
                                
                                {/* Drag & Drop Upload Zone */}
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    onDrop={handleFileDrop}
                                    className={`h-40 border-2 border-dashed rounded-xl flex flex-col justify-center items-center p-4 transition-all relative ${isDragOver ? 'border-primary-500 bg-primary-50/50' : 'border-gray-200 bg-gray-50'} cursor-pointer`}
                                >
                                    <input
                                        type="file"
                                        id="review-uploader"
                                        onChange={handleFileSelect}
                                        accept=".pdf,.docx"
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                    <div className="p-2.5 bg-white shadow-sm rounded-full mb-2">
                                        <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                    </div>
                                    <span className="text-xs font-bold text-gray-700">Drag & Drop Files Here</span>
                                    <span className="text-[10px] text-gray-400 font-medium mt-0.5">Supports PDF or Word format (.pdf, .docx)</span>
                                    
                                    {uploadedFileName && (
                                        <div className="absolute bottom-2 left-2 right-2 bg-white px-2 py-1 border border-primary-100 rounded text-[9px] text-primary-800 font-mono flex items-center justify-between">
                                            <span className="truncate max-w-[200px]">{uploadedFileName}</span>
                                            <span className="text-emerald-500 font-bold">✔ Uploaded</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    <div className="h-px bg-gray-100 flex-1"></div>
                                    <span className="text-[9px] font-black uppercase text-gray-400 px-2 tracking-widest">Or raw text clauses</span>
                                    <div className="h-px bg-gray-100 flex-1"></div>
                                </div>

                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder="Paste specific terms or legal clauses to prepare for signing..."
                                    className="w-full h-44 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30 text-xs font-medium placeholder-gray-400 bg-gray-50/50"
                                    disabled={isLoading}
                                    id="raw_text_clauses"
                                />

                                <button
                                    onClick={handlePrepareSignDocument}
                                    disabled={isLoading || (!rawText.trim() && !uploadedFileName)}
                                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md transition-all disabled:bg-gray-400"
                                    id="prepare_sign_btn"
                                >
                                    {isLoading ? 'Parsing Document...' : 'Prepare & Load onto Canvas'}
                                </button>
                            </div>

                            {/* Added Signatories Management card! */}
                            {generatedDoc && (
                                <div className="bg-white p-5 rounded-2xl border border-gray-200/50 shadow-sm space-y-4 animate-in slide-in-from-top-4 duration-300">
                                    <h2 className="text-xs font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                                        <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        Live Signatories Configuration
                                    </h2>
                                    <p className="text-[11px] text-gray-500 font-medium">Manage counterparty slots and request electronic execution links directly on site.</p>
                                    
                                    <div className="space-y-2">
                                        {signatories.map((sig, idx) => (
                                            <div key={sig.id || idx} className="p-3 bg-gray-50/50 border border-gray-100 rounded-xl flex items-center justify-between text-xs transition-colors hover:bg-gray-50">
                                                <div className="truncate pr-2">
                                                    <p className="font-bold text-gray-700 truncate">{sig.name || 'Awaiting Signee'}</p>
                                                    <p className="text-[10px] text-gray-400 font-semibold">{sig.title || 'Corporate Officer'} • <span className="font-bold text-primary-600">{sig.signatoryType}</span></p>
                                                    {sig.email && <p className="text-[9px] text-gray-400 font-mono mt-0.5 truncate">{sig.email}</p>}
                                                </div>
                                                <div className="flex-shrink-0 flex items-center gap-1.5">
                                                    {sig.isSigned ? (
                                                        <span className="bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-emerald-200">
                                                            Executed
                                                        </span>
                                                    ) : sig.isRequested ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="bg-indigo-100 text-indigo-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-indigo-200">
                                                                Requested
                                                            </span>
                                                            <button 
                                                                onClick={() => handleOpenRequestModal(idx)}
                                                                className="text-[8px] text-indigo-600 hover:underline font-bold mt-1"
                                                            >
                                                                Update Request
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <span className="bg-amber-100 text-amber-800 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-amber-200">
                                                                Unsigned
                                                            </span>
                                                            {idx > 0 && (
                                                                <button 
                                                                    onClick={() => handleOpenRequestModal(idx)}
                                                                    className="text-[9px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-black uppercase tracking-widest text-[8px]"
                                                                >
                                                                    Request
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Action button immediately shown AFTER owner (first signatory) signs */}
                                    {signatories[0]?.isSigned ? (
                                        <button
                                            onClick={() => setIsAddSignatoryModalOpen(true)}
                                            className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-2"
                                            id="add_signatory_btn"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Add Signatory
                                        </button>
                                    ) : (
                                        <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl text-center">
                                            <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                                                🔒 Onboard Additional Signatories
                                            </p>
                                            <p className="text-[9px] text-amber-600 font-medium mt-0.5">
                                                Please sign the document slot as the owner first. After your official sign-off, you can add and route slots to counterparties.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'manage' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200/50 shadow-sm space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-primary-600 animate-pulse"></span>
                                        SmartDocs Archive Vault
                                    </h2>
                                    <p className="text-xs text-gray-500 font-medium leading-relaxed mt-1">
                                        Detailed view of all generated and parsed documents active in the system.
                                    </p>
                                </div>
                                <span className="bg-primary-100 text-primary-800 text-[10px] font-bold px-2.5 py-1 rounded-full border border-primary-200">
                                    Total: {generatedDocs.length}
                                </span>
                            </div>

                            {/* Live Search Input Box */}
                            <div className="relative">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Search documents by title..."
                                    className="w-full px-3 py-2 pl-9 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 bg-gray-50/50"
                                />
                                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600">
                                        Clear
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
                                {generatedDocs.filter(doc => !searchTerm.trim() || doc.documentType.toLowerCase().includes(searchTerm.toLowerCase())).map(doc => {
                                    const isCurrentlyLoaded = generatedDoc?.documentType === doc.documentType && JSON.stringify(generatedDoc.blocks) === JSON.stringify(doc.blocks);
                                    return (
                                        <div 
                                            key={doc.id} 
                                            className={`p-4 rounded-xl border transition-all flex flex-col gap-3 ${
                                                isCurrentlyLoaded 
                                                    ? 'border-indigo-500 bg-indigo-50/20 shadow-sm' 
                                                    : 'border-gray-100 bg-gray-50/50 hover:bg-gray-100/30'
                                            }`}
                                        >
                                            <div>
                                                <div className="flex items-start justify-between gap-2">
                                                    <h3 className="font-bold text-xs text-gray-800 truncate max-w-[180px]">{doc.documentType}</h3>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        {isCurrentlyLoaded && (
                                                            <span className="text-[8px] bg-indigo-600 text-white font-black uppercase tracking-wider px-1.5 py-0.5 rounded leading-none">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-gray-400 mt-1 font-mono">
                                                    Ref: REF-{doc.id.substring(0, 8).toUpperCase()} | {new Date(doc.createdAt).toLocaleDateString()}
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    onClick={() => handleViewHistoryDoc(doc)}
                                                    className="py-2 bg-white text-gray-700 hover:text-indigo-600 border border-gray-200 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    Load
                                                </button>

                                                <button
                                                    onClick={async () => {
                                                        // First load the document onto the canvas
                                                        handleViewHistoryDoc(doc);
                                                        // Then trigger compliance audit using document text
                                                        const fullTextLines = doc.blocks
                                                            .filter(b => b.type === 'paragraph' || b.type === 'title')
                                                            .map(b => (b.content as any).text || '')
                                                            .join('\n\n');
                                                        handleAnalyzeText(fullTextLines || doc.documentType);
                                                    }}
                                                    className="py-2 bg-gray-800 text-white hover:bg-gray-901 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm"
                                                >
                                                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                    AI Audit
                                                </button>

                                                <button
                                                    onClick={async () => {
                                                        if (window.confirm("Are you sure you want to permanently delete this document from your vault? This cannot be undone.")) {
                                                            await onDeleteDoc(doc.id);
                                                            if (editingDocId === doc.id) {
                                                                setGeneratedDoc(null);
                                                                setEditingDocId(null);
                                                            }
                                                            triggerToast("Document permanently purged from vault.");
                                                        }
                                                    }}
                                                    className="py-2 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-100 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-1 shadow-sm font-sans"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {generatedDocs.length === 0 && (
                                    <div className="p-8 text-center border-2 border-dashed border-gray-100 rounded-xl bg-gray-50/30 text-xs text-gray-400 font-medium">
                                        No documents saved in this tenant vault yet. Try generating a Document first!
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Left Footer: Past History Archives (Only shown on generate and sign tabs to avoid repeating list) */}
                    {activeTab !== 'manage' && (
                        <div className="bg-white p-5 rounded-2xl border border-gray-200/50 shadow-sm">
                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider mb-3">Contracts & Vault Archive</h3>
                            <div className="max-h-48 overflow-y-auto space-y-2">
                                {generatedDocs.map(doc => (
                                    <div key={doc.id} className="p-3 border border-gray-100 rounded-xl flex items-center justify-between bg-gray-50 hover:bg-primary-50/30 transition-colors">
                                        <div className="truncate pr-2">
                                            <p className="font-bold text-xs text-gray-800 truncate">{doc.documentType}</p>
                                            <p className="text-[9px] text-gray-400 font-medium">{new Date(doc.createdAt).toLocaleDateString()} {new Date(doc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            <button
                                                onClick={() => handleViewHistoryDoc(doc)}
                                                className="px-3 py-1.5 bg-white hover:bg-primary-600 hover:text-white border border-gray-200 text-[9px] font-black uppercase tracking-widest rounded-lg text-gray-600 transition-all flex-shrink-0"
                                            >
                                                Load
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (window.confirm("Are you sure you want to permanently delete this document from your vault? This cannot be undone.")) {
                                                        await onDeleteDoc(doc.id);
                                                        if (editingDocId === doc.id) {
                                                            setGeneratedDoc(null);
                                                            setEditingDocId(null);
                                                        }
                                                        triggerToast("Document permanently purged from vault.");
                                                    }
                                                }}
                                                className="px-2 py-1.5 bg-red-50 hover:bg-red-500 text-red-600 hover:text-white border border-red-100 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all flex-shrink-0"
                                                title="Delete document"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {generatedDocs.length === 0 && (
                                    <div className="p-6 text-center text-xs text-gray-400 font-medium">No documents saved in this tenant vault yet.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT SYSTEM PREVIEW / RESPONSE BENTO GRID: Column Span 7 */}
                <div className="lg:col-span-7 space-y-6">

                    {/* Rendering AI Review / Analysis Report inside Preview area if requested */}
                    {reviewReport && activeTab === 'manage' && (
                        <div className="bg-white p-5 rounded-2xl border border-primary-200 shadow-md bg-gradient-to-br from-white to-primary-50/10">
                            <div className="flex items-center justify-between border-b pb-4 mb-4">
                                <div>
                                    <h3 className="text-sm font-black text-primary-900 uppercase tracking-widest flex items-center gap-1.5">
                                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                        AI Compliance Review Report
                                    </h3>
                                    <p className="text-[10px] text-gray-400 font-medium uppercase mt-0.5 tracking-wider">CraveBiZ Risk Intelligence Module</p>
                                </div>

                                {/* Dynamic Circular Score Gauge */}
                                <div className="flex items-center gap-2">
                                    <div className="relative w-12 h-12 flex items-center justify-center">
                                        <svg className="w-full h-full transform -rotate-90">
                                            <circle cx="24" cy="24" r="18" strokeWidth="4" stroke="#f3f4f6" fill="transparent" />
                                            <circle cx="24" cy="24" r="18" strokeWidth="4" stroke={reviewReport.score >= 70 ? "#059669" : reviewReport.score >= 40 ? "#d97706" : "#dc2626"} fill="transparent" strokeDasharray={`${18 * 2 * Math.PI}`} strokeDashoffset={`${18 * 2 * Math.PI * (1 - reviewReport.score / 100)}`} strokeLinecap="round" />
                                        </svg>
                                        <span className="absolute text-xs font-black text-gray-800">{reviewReport.score}</span>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Health Score</p>
                                        <p className={`text-[10px] font-bold ${reviewReport.score >= 70 ? 'text-emerald-600' : reviewReport.score >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                            {reviewReport.score >= 70 ? 'Strong / Safe' : reviewReport.score >= 40 ? 'Moderate Risks' : 'Critical Issues'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Summary Text */}
                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 mb-4 text-xs font-medium text-gray-600 leading-relaxed italic">
                                "{reviewReport.summary}"
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Risks Section */}
                                <div className="space-y-2.5">
                                    <h4 className="text-[10px] font-black text-red-700 uppercase tracking-widest flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                        Vulnerabilities & Loop holes ({reviewReport.risks.length})
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {reviewReport.risks.map((risk, i) => (
                                            <li key={i} className="text-xs font-medium text-gray-600 bg-red-50/40 p-2 rounded-lg border border-red-100 flex items-start gap-1.5 leading-relaxed">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0"></span>
                                                {risk}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                {/* Suggestions Section */}
                                <div className="space-y-2.5">
                                    <h4 className="text-[10px] font-black text-teal-700 uppercase tracking-widest flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 01-2 2h0a2 2 0 01-2-2v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                                        Optimizations & Edits ({reviewReport.suggestions.length})
                                    </h4>
                                    <ul className="space-y-1.5">
                                        {reviewReport.suggestions.map((sug, i) => (
                                            <li key={i} className="text-xs font-medium text-gray-600 bg-teal-50/40 p-2 rounded-lg border border-teal-100 flex items-start gap-1.5 leading-relaxed">
                                                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 flex-shrink-0"></span>
                                                {sug}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Extracted Key Clauses */}
                            <div className="mt-4 pt-4 border-t">
                                <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    Extracted Critical Contracts Clauses
                                </h4>
                                <div className="space-y-2">
                                    {reviewReport.keyClauses.map((clause, idx) => (
                                        <details key={idx} className="group border border-gray-100 rounded-lg bg-gray-50 p-2 text-xs transition-all">
                                            <summary className="font-bold text-gray-700 cursor-pointer list-none flex justify-between items-center select-none">
                                                <span>{clause.name}</span>
                                                <svg className="w-3.5 h-3.5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </summary>
                                            <p className="mt-1.5 text-gray-500 font-medium text-[11px] leading-relaxed">{clause.content}</p>
                                        </details>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Box Container */}
                    <div className="bg-gray-100 p-4 rounded-3xl border border-gray-200/50 shadow-inner">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden min-h-[40rem] flex flex-col">
                            {isLoading && (
                                <div className="flex-1 flex flex-col justify-center items-center p-12 text-center">
                                    <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin mb-4"></div>
                                    <p className="font-black uppercase text-xs text-gray-600 tracking-wider">CraveBiZ AI Transformer operating...</p>
                                    <p className="text-[11px] text-gray-400 mt-1 max-w-sm leading-relaxed">Gemini-3.5-Flash is currently creating realistic legal terms, filling metadata and mapping layout structures.</p>
                                </div>
                            )}

                            {error && (
                                <div className="flex-1 flex flex-col justify-center items-center p-12 text-center text-red-500 font-medium">
                                    <svg className="w-10 h-10 text-red-100 rounded-full bg-red-50 p-2 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                                    <p className="text-xs uppercase font-black tracking-widest text-red-700">Transformer Interrupted</p>
                                    <p className="text-xs text-red-500 mt-1 max-w-sm font-medium leading-relaxed">{error}</p>
                                </div>
                            )}

                            {generatedDoc && !isLoading && !error && (
                                <>
                                    {/* Action Header Control Bar */}
                                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex flex-wrap gap-2 justify-between items-center print-hidden">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{generatedDoc.documentType} Preview Pane</span>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {/* Manual Save / Update changes button */}
                                            <button 
                                                onClick={handleSaveCurrentDocument} 
                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
                                                {editingDocId ? 'Update & Save' : 'Save Document'}
                                            </button>

                                            {/* Feature ii: Interactive E-Signature Button */}
                                            <button
                                                onClick={() => {
                                                    setActiveSignatoryIndex(0); // Creator/First signatory
                                                    setIsSignModalOpen(true);
                                                }}
                                                className="px-3 py-1.5 bg-primary-600 text-white hover:bg-primary-700 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center gap-1 shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                {signatories[0]?.isSigned ? 'Change My Signature' : 'Sign Document'}
                                            </button>
                                            
                                            <button onClick={handlePrint} className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all">Print</button>
                                            <button onClick={handleDownloadPdf} className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all">PDF</button>
                                            <button onClick={handleSendEmail} className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all">Email Link</button>
                                        </div>
                                    </div>

                                    {/* Virtual A4 Canvas */}
                                    <div className="flex-1 overflow-y-auto" style={{ maxHeight: '42rem' }}>
                                        <div ref={documentRef} className="p-10 bg-white max-w-[210mm] mx-auto min-h-[297mm]">
                                            <div className="space-y-4">
                                                {generatedDoc.blocks
                                                    .filter(block => {
                                                        const isUploaded = !!uploadedFileName || generatedDoc.documentType.toLowerCase().includes('uploaded') || generatedDoc.documentType.toLowerCase().includes('reviewed');
                                                        return !isUploaded || block.type !== 'header';
                                                    })
                                                    .map(block => <div key={block.id}>{renderBlock(block)}</div>)
                                                }
                                            </div>

                                            {/* Feature ii: Dynamic E-Signatures Board rendered inside A4 Simulation */}
                                            {signatories && signatories.length > 0 ? (
                                                <div className="mt-12 pt-8 border-t border-dashed border-gray-200">
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Execution & Counterparty Sign-Off</h4>
                                                    <div className="grid grid-cols-2 gap-6 text-xs">
                                                        
                                                        {signatories.map((sig, idx) => (
                                                            <div key={sig.id || idx} className={`border rounded-xl p-3 relative overflow-hidden ${sig.isSigned ? 'border-primary-200 bg-primary-50/10' : 'border-dashed border-gray-200 bg-gray-50/30'}`}>
                                                                {sig.isSigned ? (
                                                                    <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[7px] font-black uppercase px-2 py-0.5 rounded-bl tracking-widest select-none">
                                                                        Verified
                                                                    </div>
                                                                ) : (
                                                                    <div className="absolute top-0 right-0 bg-amber-500 text-white text-[7px] font-black uppercase px-2 py-0.5 rounded-bl tracking-widest select-none bg-opacity-90">
                                                                        Awaiting Signature
                                                                    </div>
                                                                )}
                                                                <p className="text-[9px] font-black text-gray-400 uppercase mb-2">
                                                                    {sig.signatoryType} Signee Slot:
                                                                </p>
                                                                
                                                                <div className="h-10 flex items-center justify-center mb-1 overflow-hidden">
                                                                    {sig.isSigned ? (
                                                                        <>
                                                                            {sig.type === 'draw' && (
                                                                                <img src={sig.value} alt="Signature drawn" className="h-9 max-w-full object-contain" />
                                                                            )}
                                                                            {sig.type === 'upload' && (
                                                                                <img src={sig.value} alt="Signature file" className="h-9 max-w-full object-contain" />
                                                                            )}
                                                                            {sig.type === 'type' && (
                                                                                <span
                                                                                    className="text-lg text-indigo-950 select-none font-bold italic"
                                                                                    style={{ 
                                                                                        fontFamily: 
                                                                                            sig.value === '0' ? "'Dancing Script', cursive" : 
                                                                                            sig.value === '1' ? "'Great Vibes', cursive" : 
                                                                                            sig.value === '2' ? "'Herr Von Muellerhoff', cursive" :
                                                                                            "'Homemade Apple', cursive" 
                                                                                    }}
                                                                                >
                                                                                    {sig.name}
                                                                                </span>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        <span className="text-[10px] text-gray-300 font-mono italic">[Unexecuted Signature]</span>
                                                                    )}
                                                                </div>

                                                                <div className={`border-t pt-1.5 ${sig.isSigned ? 'border-primary-100' : 'border-gray-100'}`}>
                                                                    {idx > 0 && !sig.isSigned && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleOpenRequestModal(idx)}
                                                                            className="w-full mb-1.5 py-1 px-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[8px] font-black uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1 border border-indigo-200/40 print-hidden"
                                                                        >
                                                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                                            Request Signature
                                                                        </button>
                                                                    )}
                                                                    
                                                                    <p className="font-bold text-gray-800 text-[11px] truncate">{sig.name || 'Signee Name'}</p>
                                                                    <p className="text-[9px] text-gray-400 font-medium truncate">{sig.title || 'Corporate Title'}</p>
                                                                    {sig.email && (
                                                                        <p className="text-[8px] text-gray-400 font-medium truncate flex items-center gap-1 mt-0.5">
                                                                            <span className="w-1 h-1 rounded-full bg-indigo-400"></span>
                                                                            {sig.email}
                                                                        </p>
                                                                    )}
                                                                    {sig.isSigned && sig.date && (
                                                                        <p className="text-[8px] text-primary-400 mt-1 font-mono leading-none truncate">{sig.date}</p>
                                                                    )}

                                                                    {!sig.isSigned && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleOpenSignModalForIndex(idx)}
                                                                            className="w-full mt-1.5 py-1 px-1.5 bg-primary-600 hover:bg-primary-700 text-white text-[8px] font-black uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1 shadow-sm print-hidden"
                                                                        >
                                                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                                            Sign Slot
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}

                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="mt-12 p-5 border border-dashed border-gray-200 rounded-xl text-center bg-gray-50/30 print-hidden">
                                                    <p className="text-gray-400 text-xs font-medium leading-relaxed">This document has no signatory configured. Click the <strong className="text-primary-600">DocSignify</strong> section on the left to configure legal signatories.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}

                            {!generatedDoc && !isLoading && !error && (
                                <div className="flex-1 flex flex-col justify-center items-center p-12 text-center">
                                    <div className="p-4 bg-gray-50 rounded-full border border-gray-100 mb-3">
                                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                    </div>
                                    <p className="font-black uppercase text-xs text-gray-500 tracking-wider">Awaiting Source Data</p>
                                    <p className="text-xs text-gray-400 mt-1 max-w-sm leading-relaxed font-semibold">Select a preset template, paste draft materials, or upload custom contracts on the left to activate the preview canvas.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* Feature ii: INTERACTIVE ESIGN MODAL OVERLAY */}
            {isSignModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-5 animate-scale-up">
                        
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-black text-gray-950 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-5 h-5 text-primary-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                    Audit & Apply Secure eSignature
                                </h3>
                                <p className="text-xs text-gray-400 font-medium">Verified by CraveBiZ Clients eSign Protocol.</p>
                            </div>
                            <button
                                onClick={() => setIsSignModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-800 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>

                        {/* Signature Type Switch Tabs */}
                        <div className="grid grid-cols-3 bg-gray-50 border border-gray-100 p-1 rounded-xl text-center text-xs">
                            <button onClick={() => setSigType('draw')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'draw' ? 'bg-white text-primary-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Draw Pad</button>
                            <button onClick={() => setSigType('type')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'type' ? 'bg-white text-primary-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Type Cursive</button>
                            <button onClick={() => setSigType('upload')} className={`py-1.5 font-bold rounded-lg transition-colors ${sigType === 'upload' ? 'bg-white text-primary-900 shadow-sm border border-gray-100' : 'text-gray-500 hover:text-gray-700'}`}>Signature File</button>
                        </div>

                        {/* SIGNATURE DRAWING PAD VIEW */}
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
                                        className="absolute right-3 bottom-3 px-2.5 py-1 bg-gray-900 bg-opacity-80 hover:bg-opacity-100 text-white text-[9px] font-black uppercase tracking-widest rounded transition-all"
                                    >
                                        Clear
                                    </button>
                                </div>
                                <span className="text-[10px] text-gray-400 leading-none">Use your trackpad, mouse, or touch screen to draw your signature line above.</span>
                            </div>
                        )}

                        {/* SIGNATURE TYPING VIEW */}
                        {sigType === 'type' && (
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">FullName Signature Text</label>
                                    <input
                                        type="text"
                                        value={typedName}
                                        onChange={(e) => setTypedName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold"
                                        placeholder="Type full name letters..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Select Signature Presentation Cursive</label>
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
                                                className={`p-3 border rounded-xl hover:bg-primary-50/10 text-left transition-all ${selectedCursiveStyle === idx ? 'border-primary-600 bg-primary-50/20 shadow-sm ring-1 ring-primary-500' : 'border-gray-200 bg-white'}`}
                                            >
                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">{style.label}</p>
                                                <p className="text-xl truncate text-primary-900 select-none font-bold" style={{ fontFamily: style.font }}>
                                                    {typedName || 'Signee Name'}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SIGNATURE IMAGE UPLOADER */}
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
                                        <>
                                            <svg className="w-8 h-8 text-primary-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                            <span className="text-xs font-bold text-gray-700">Choose Signature Image File</span>
                                            <span className="text-[9px] text-gray-400 mt-0.5">Recommended format: transparent PNG</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Metadata inputs for Signee Title */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Printed Representative Name</label>
                                <input
                                    type="text"
                                    value={typedName}
                                    onChange={(e) => setTypedName(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Representative Corporate Title</label>
                                <input
                                    type="text"
                                    value={sigTitle}
                                    onChange={(e) => setSigTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold"
                                    placeholder="CEO, Legal Lead, etc..."
                                />
                            </div>
                        </div>

                        {/* Save Actions */}
                        <div className="grid grid-cols-2 gap-4 pt-3 border-t">
                            <button
                                onClick={() => setIsSignModalOpen(false)}
                                className="py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-black uppercase tracking-widest rounded-xl border transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApplySignature}
                                className="py-2.5 bg-primary-600 text-white hover:bg-primary-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                            >
                                Apply Signature
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Signatory Modal */}
            {isAddSignatoryModalOpen && (
                <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4 animate-scale-up">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-sm font-black text-gray-950 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-primary-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Add Counterparty Signatory Slot
                                </h3>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Register signee credentials</p>
                            </div>
                            <button
                                onClick={() => setIsAddSignatoryModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-800 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Signatory Legal Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setNewSigType('Main')}
                                    className={`py-3 px-4 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1.5 ${newSigType === 'Main' ? 'border-primary-600 bg-primary-50/25 text-primary-900' : 'border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    Main Signatory
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setNewSigType('Witness')}
                                    className={`py-3 px-4 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1.5 ${newSigType === 'Witness' ? 'border-indigo-600 bg-indigo-50/25 text-indigo-900' : 'border-gray-100 bg-gray-50/50 text-gray-500 hover:border-gray-200'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                    Witness Signatory
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Signatory Full Name</label>
                                <input
                                    type="text"
                                    value={newSigName}
                                    onChange={(e) => setNewSigName(e.target.value)}
                                    placeholder="e.g. Johnathan Doe"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold bg-gray-50/30"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Legal/Corporate Title</label>
                                <input
                                    type="text"
                                    value={newSigTitle}
                                    onChange={(e) => setNewSigTitle(e.target.value)}
                                    placeholder="e.g. Chief Executive Officer"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold bg-gray-50/30"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Contact Email (Optional)</label>
                                <input
                                    type="email"
                                    value={newSigEmail}
                                    onChange={(e) => setNewSigEmail(e.target.value)}
                                    placeholder="e.g. j.doe@counterparty.com"
                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-primary-500 text-xs font-semibold bg-gray-50/30 font-semibold"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => setIsAddSignatoryModalOpen(false)}
                                className="py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-black uppercase tracking-widest rounded-xl border transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddSignatorySubmit}
                                className="py-2.5 bg-primary-600 text-white hover:bg-primary-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                            >
                                Add Signatory
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Signature Modal */}
            {isRequestModalOpen && (
                <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4 animate-scale-up">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-sm font-black text-gray-950 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-4 h-4 text-indigo-600 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                    Secure Signature Dispatch Engine
                                </h3>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Route legal execution invite</p>
                            </div>
                            <button
                                onClick={() => {
                                    setIsRequestModalOpen(false);
                                    setRequestingSigIndex(null);
                                }}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-800 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-4 bg-indigo-50/40 border border-indigo-100 rounded-2xl space-y-1.5 text-xs">
                            <span className="font-bold text-indigo-900 block">Recipient Onboarding Context:</span>
                            <p className="text-gray-600 font-medium leading-relaxed">
                                You are requesting an electronic signature from <strong className="font-black text-gray-800">{requestingSigIndex !== null ? signatories[requestingSigIndex]?.name : 'the counterparty'}</strong> acting as <strong className="font-black text-gray-800">{requestingSigIndex !== null ? signatories[requestingSigIndex]?.title : 'Officer'}</strong>. Mention their email below to securely map their verification token.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400">Recipient Email Address</label>
                            <input
                                type="email"
                                value={requestEmail}
                                onChange={(e) => setRequestEmail(e.target.value)}
                                placeholder="name@counterpartycompany.com"
                                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 text-xs font-semibold bg-gray-50/30"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setIsRequestModalOpen(false);
                                    setRequestingSigIndex(null);
                                }}
                                className="py-2.5 bg-gray-50 text-gray-700 hover:bg-gray-100 text-xs font-black uppercase tracking-widest rounded-xl border transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendRequestSubmit}
                                className="py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                Send Request
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Request Signature Success & Fallback Modal */}
            {isRequestSuccessModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-gray-950/75 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-100 p-6 space-y-4 animate-scale-up">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-sm font-black text-gray-950 uppercase tracking-tight flex items-center gap-1.5">
                                    <svg className="w-5 h-5 text-emerald-500 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Document Portal Invitation Ready!
                                </h3>
                                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">Secured Counterparty Handshake</p>
                            </div>
                            <button
                                onClick={() => setIsRequestSuccessModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-800 transition-all"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-4 bg-emerald-50/50 border border-emerald-100/60 rounded-2xl space-y-2 text-xs">
                            <p className="text-emerald-950 font-medium leading-relaxed">
                                We generated a premium secure signing link for **{latestRequestedEmail}**.
                            </p>
                            <p className="text-gray-500 text-[11px] leading-relaxed">
                                Your device's native mail client was automatically triggered to compose a prefilled signature invite email containing this unique link. 
                            </p>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Copy Shareable Signing Portal Link</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={savedSigningUrl}
                                    readOnly
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-[11px] font-mono select-all bg-gray-50 text-gray-600 focus:outline-none"
                                />
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(savedSigningUrl);
                                        triggerToast("Secure Signing link successfully copied to clipboard.");
                                    }}
                                    className="px-3.5 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-sm active:scale-95 flex items-center justify-center whitespace-nowrap"
                                >
                                    Copy Link
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">Or Copy Email Invitation Template</label>
                                <button
                                    onClick={() => {
                                        const fullTemplate = `Subject: ${savedEmailSubject}\n\n${savedEmailBody}`;
                                        navigator.clipboard.writeText(fullTemplate);
                                        triggerToast("Full email template successfully copied to clipboard!");
                                    }}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-black uppercase tracking-wider flex items-center gap-1"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                    Copy Template
                                </button>
                            </div>
                            <div className="border border-gray-200/80 rounded-2xl bg-gray-50/50 p-3.5 space-y-2.5 text-left max-h-48 overflow-y-auto border-dashed">
                                <div className="text-[10px]">
                                    <span className="font-black text-gray-400 uppercase tracking-wider">Subject:</span>
                                    <p className="font-bold text-gray-800 mt-0.5 border-b border-gray-150 pb-1.5">{savedEmailSubject}</p>
                                </div>
                                <div className="text-[10px]">
                                    <span className="font-black text-gray-400 uppercase tracking-wider">Message:</span>
                                    <p className="font-semibold text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed select-all font-mono text-[9px] bg-white p-2 rounded-xl border border-gray-100">{savedEmailBody}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <a
                                href={savedMailtoUrl}
                                className="py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-indigo-200/40 flex items-center justify-center gap-1.5 active:scale-95 text-center"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                Resend Email
                            </a>
                            <button
                                onClick={() => setIsRequestSuccessModalOpen(false)}
                                className="py-2.5 bg-gray-900 hover:bg-gray-950 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Elegant Outbound Notification Toast */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-[120] bg-gray-900 border border-gray-800 text-white px-5 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 max-w-sm">
                    <div className="p-1.5 bg-emerald-500 text-white rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                        <p className="text-xs font-bold font-mono tracking-tight text-gray-200">System Notification</p>
                        <p className="text-[11px] text-gray-400 font-medium leading-normal mt-0.5">{toastMessage}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocumentTransformer;
