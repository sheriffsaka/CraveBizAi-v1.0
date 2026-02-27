
import React, { useState, useRef } from 'react';
import { transformDocument } from '../services/aiGenerationService';
import { GeneratedDocument, DocumentBlock, HeaderBlock, MetadataBlock, TableBlock, SummaryBlock, Company, User, StoredGeneratedDoc } from '../types';
import EditableBlock from './EditableBlock';
import Icon from './common/Icon';

interface DocumentTransformerProps {
    company: Company | null;
    user: User | null;
    generatedDocs: StoredGeneratedDoc[];
    onSaveDoc: (doc: GeneratedDocument) => void;
}

const DocumentTransformer: React.FC<DocumentTransformerProps> = ({ company, user, generatedDocs, onSaveDoc }) => {
    const [rawText, setRawText] = useState('');
    const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const documentRef = useRef<HTMLDivElement>(null);

    const handleGenerate = async () => {
        if (!rawText.trim() || !company || !user) {
            setError('Input text and company context are required.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGeneratedDoc(null);
        try {
            const companyContext = {
                name: company.name,
                address: company.address,
                email: company.email,
                phone: company.phone || '',
                website: company.website || '',
                logoUrl: company.logoUrl || ''
            };
            const result = await transformDocument(rawText, companyContext);
            if (result) {
                setGeneratedDoc(result);
                onSaveDoc(result);
            } else {
                setError("Failed to generate document. The AI model returned an unexpected format.");
            }
        } catch (e) {
            setError("An error occurred while communicating with the AI. Please try again.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleUpdateBlock = (blockId: string, newContent: any) => {
        if (!generatedDoc) return;
        const updatedBlocks = generatedDoc.blocks.map(block => 
            block.id === blockId ? { ...block, content: newContent } : block
        );
        setGeneratedDoc({ ...generatedDoc, blocks: updatedBlocks });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPdf = () => {
        const element = documentRef.current;
        if (!element || !(window as any).html2pdf) return;
        
        const opt = {
            margin: 0,
            filename: `${generatedDoc?.documentType || 'document'}_${Date.now()}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        (window as any).html2pdf().set(opt).from(element).save();
    };

    const handleSendEmail = () => {
        const subject = `Regarding Your ${generatedDoc?.documentType || 'Document'}`;
        const body = `Dear [Client Name],

Please find the attached document for your review.

Best regards,
${company?.name || ''}`;
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    };

    const handleViewHistoryDoc = (doc: StoredGeneratedDoc) => {
        setGeneratedDoc({
            documentType: doc.documentType,
            blocks: doc.blocks
        });
        setRawText(''); // Optional: clear input to avoid confusion
        setError(null);
    };

    const renderBlock = (block: DocumentBlock) => {
        const { id, type, content } = block;
        switch (type) {
            case 'header':
                const header = content as HeaderBlock;
                return (
                    <div className="flex justify-between items-start pb-6 border-b-2 border-gray-800">
                        <div className="flex items-center gap-5">
                            {company?.logoUrl ? <img src={company.logoUrl} alt="Logo" className="h-16 w-auto" /> : <div className="h-16 w-16 bg-gray-100 flex items-center justify-center text-xs text-gray-400">Logo</div>}
                            <div>
                                <EditableBlock as="h2" value={header.companyName} onUpdate={val => handleUpdateBlock(id, {...header, companyName: val})} className="text-2xl font-bold text-gray-800" />
                                <EditableBlock as="p" value={header.address} onUpdate={val => handleUpdateBlock(id, {...header, address: val})} className="text-xs text-gray-500 mt-1" />
                                <div className="text-xs text-gray-500 mt-1">
                                    <EditableBlock as="span" value={header.email} onUpdate={val => handleUpdateBlock(id, {...header, email: val})} /> | <EditableBlock as="span" value={header.phone} onUpdate={val => handleUpdateBlock(id, {...header, phone: val})} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'metadata':
                const meta = content as MetadataBlock;
                return (
                    <div className="my-8 grid grid-cols-2 gap-8">
                        <div>
                            <h1 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">
                                <EditableBlock as="span" value={meta.documentTitle} onUpdate={val => handleUpdateBlock(id, {...meta, documentTitle: val})} />
                            </h1>
                             <EditableBlock as="p" value={`Ref: ${meta.reference}`} onUpdate={val => handleUpdateBlock(id, {...meta, reference: val.replace('Ref: ', '')})} className="text-sm text-gray-400 mt-1 font-mono" />
                        </div>
                        <div className="text-sm space-y-2 text-right">
                           <div className="grid grid-cols-2 items-center"><strong className="text-gray-500">Client:</strong> <EditableBlock as="span" value={meta.clientName} onUpdate={val => handleUpdateBlock(id, {...meta, clientName: val})} className="font-bold text-gray-800" /></div>
                           <div className="grid grid-cols-2 items-center"><strong className="text-gray-500">Date:</strong> <EditableBlock as="span" value={meta.date} onUpdate={val => handleUpdateBlock(id, {...meta, date: val})} className="font-bold text-gray-800" /></div>
                           <div className="grid grid-cols-2 items-center"><strong className="text-gray-500">Prepared By:</strong> <EditableBlock as="span" value={meta.preparedBy} onUpdate={val => handleUpdateBlock(id, {...meta, preparedBy: val})} className="font-bold text-gray-800" /></div>
                        </div>
                    </div>
                );
            case 'title':
                 return <EditableBlock as="h3" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} className="text-xl font-bold text-gray-800 mt-8 mb-4 border-b pb-2" />;
            case 'paragraph':
                 return <EditableBlock as="p" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} className="text-sm text-gray-600 leading-relaxed mb-4" />;
            case 'table':
                const table = content as TableBlock;
                return (
                    <table className="w-full text-sm my-6 border-collapse">
                        <thead>
                            <tr className="bg-gray-800 text-white">
                                {table.headers.map((h, i) => <th key={i} className="py-2 px-3 text-left font-bold uppercase tracking-wider text-xs"><EditableBlock as="span" value={h} onUpdate={val => { const newHeaders = [...table.headers]; newHeaders[i] = val; handleUpdateBlock(id, {...table, headers: newHeaders}); }} /></th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {table.rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="border-b border-gray-200">
                                    {row.map((cell, cellIndex) => <td key={cellIndex} className="py-3 px-3 align-top"><EditableBlock as="span" value={cell} onUpdate={val => { const newRows = [...table.rows]; newRows[rowIndex][cellIndex] = val; handleUpdateBlock(id, {...table, rows: newRows}); }} /></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            case 'summary':
                const summary = content as SummaryBlock;
                return (
                    <div className="flex justify-end my-8">
                        <div className="w-full max-w-xs space-y-2 text-sm">
                             {summary.subtotal !== undefined && <div className="flex justify-between"><strong className="text-gray-500">Subtotal:</strong> <span>{summary.currency}<EditableBlock as="span" value={(summary.subtotal || 0).toString()} onUpdate={val => handleUpdateBlock(id, {...summary, subtotal: Number(val)})} /></span></div>}
                             {summary.tax !== undefined && <div className="flex justify-between"><strong className="text-gray-500">Tax:</strong> <span>{summary.currency}<EditableBlock as="span" value={(summary.tax || 0).toString()} onUpdate={val => handleUpdateBlock(id, {...summary, tax: Number(val)})} /></span></div>}
                             <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2"><strong className="text-gray-800">Total:</strong> <span className="text-primary-700">{summary.currency}<EditableBlock as="span" value={(summary.total || 0).toString()} onUpdate={val => handleUpdateBlock(id, {...summary, total: Number(val)})} /></span></div>
                             {summary.notes && <div className="pt-4 text-xs text-gray-500"><EditableBlock as="p" value={summary.notes} onUpdate={val => handleUpdateBlock(id, {...summary, notes: val})} /></div>}
                        </div>
                    </div>
                );
            case 'footer':
                 return <div className="text-center text-xs text-gray-400 mt-12 pt-4 border-t"><EditableBlock as="p" value={(content as any).text || ''} onUpdate={val => handleUpdateBlock(id, { text: val })} /></div>;
            default:
                return null;
        }
    };
    
    return (
        <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">AI Docs Transformer</h1>
            <p className="text-gray-500 mt-1 font-medium">Paste any raw text and instantly generate a professional, editable business document.</p>
            
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <textarea 
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        placeholder="Paste your content here—like an email, notes, or a list of items..."
                        className="w-full h-96 p-4 border-2 border-dashed border-gray-300 rounded-xl focus:outline-none focus:border-primary-500 bg-white"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !rawText.trim()}
                        className="w-full mt-4 py-4 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 shadow-lg shadow-primary-200 transition-all transform hover:-translate-y-0.5 disabled:bg-gray-400 disabled:transform-none"
                    >
                        {isLoading ? 'Analyzing & Generating...' : 'Format & Generate Document'}
                    </button>

                    <div className="mt-12">
                        <h2 className="text-xl font-black text-gray-700 uppercase tracking-tighter mb-4">Generated Docs Archive</h2>
                        <div className="bg-white rounded-xl shadow-inner border border-gray-100 max-h-96 overflow-y-auto">
                            <ul className="divide-y divide-gray-100">
                                {generatedDocs.map(doc => (
                                    <li key={doc.id} className="p-4 flex justify-between items-center hover:bg-primary-50/50 transition-colors">
                                        <div>
                                            <p className="font-bold text-sm text-primary-800">{doc.documentType}</p>
                                            <p className="text-xs text-gray-400 font-medium">{new Date(doc.createdAt).toLocaleString()}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleViewHistoryDoc(doc)}
                                            className="px-4 py-2 bg-gray-100 text-[10px] font-black uppercase tracking-widest rounded-lg text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-all">
                                            Load
                                        </button>
                                    </li>
                                ))}
                                {generatedDocs.length === 0 && (
                                    <li className="p-10 text-center text-sm text-gray-400 font-medium">Your generated documents will appear here.</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
                
                <div className="bg-gray-200 p-4 rounded-xl">
                    <div className="bg-white rounded-lg shadow-lg overflow-y-auto h-[32rem]">
                        {isLoading && <div className="p-10 text-center text-gray-500">Generating your document...</div>}
                        {error && <div className="p-10 text-center text-red-500">{error}</div>}
                        {generatedDoc && (
                            <>
                                <div className="p-3 bg-gray-100 border-b print-hidden flex justify-between items-center sticky top-0 z-10">
                                    <span className="text-xs font-bold text-gray-500">{generatedDoc.documentType} Preview</span>
                                    <div className="space-x-2">
                                        <button onClick={handlePrint} className="px-3 py-1 bg-gray-200 text-xs font-bold rounded">Print</button>
                                        <button onClick={handleDownloadPdf} className="px-3 py-1 bg-gray-200 text-xs font-bold rounded">PDF</button>
                                        <button onClick={handleSendEmail} className="px-3 py-1 bg-gray-200 text-xs font-bold rounded">Email</button>
                                    </div>
                                </div>
                                <div ref={documentRef} className="p-8 A4-simulation">
                                    {generatedDoc.blocks.map(block => <div key={block.id}>{renderBlock(block)}</div>)}
                                </div>
                            </>
                        )}
                         {!generatedDoc && !isLoading && !error && <div className="p-10 text-center text-gray-400">Your generated document will appear here.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DocumentTransformer;
