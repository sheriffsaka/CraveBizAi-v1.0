import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Move, Check, Calendar, FileText, Square, CheckSquare, Image, AlertCircle, PenTool, Type, HelpCircle } from 'lucide-react';
import { DbDocumentSignature, DbDocumentSignatory } from '../types';

export interface PreparedField {
  id: string;
  type: 'signature' | 'initial' | 'date' | 'name' | 'email' | 'company' | 'title' | 'text' | 'checkbox' | 'radio' | 'dropdown' | 'attachment' | 'stamp';
  page_number: number;
  x_position: number; // percentage (0-100)
  y_position: number; // percentage (0-100)
  width: number; // in pixels
  height: number; // in pixels
  rotation?: number;
  assigned_signer_id: string;
  required: boolean;
  validation_rules?: string;
  dropdown_options?: string[];
  value?: any; // populated during signing
}

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
      reject(new Error("Failed to load PDF rendering engine. Check your connection."));
    };
    document.head.appendChild(script);
  });
};

interface DocumentSignifyViewerProps {
  fileUrl: string;
  fileType: string;
  htmlContent?: string;
  // Legacy signatures support for backward compatibility
  signatures?: DbDocumentSignature[];
  signatories?: DbDocumentSignatory[];
  activeSignatory?: DbDocumentSignatory | null;
  readOnly?: boolean;
  
  // Custom Fields (Advanced DocSignify Editor & Viewer)
  fields?: PreparedField[];
  isDesignerMode?: boolean;
  activeSignatoryId?: string;
  onFieldMove?: (fieldId: string, pageNum: number, x: number, y: number) => void;
  onFieldResize?: (fieldId: string, width: number, height: number) => void;
  onFieldDelete?: (fieldId: string) => void;
  onFieldUpdate?: (fieldId: string, updatedFields: Partial<PreparedField>) => void;
  onFieldClick?: (fieldId: string) => void;
  onPlaceFieldAtCoordinates?: (pageNum: number, x: number, y: number) => void;
}

interface PDFPageCanvasProps {
  pdfDoc: any;
  pageNum: number;
  onDimensionsLoaded: (pageNum: number, width: number, height: number) => void;
  canvasRefCallback: (pageNum: number, canvas: HTMLCanvasElement | null) => void;
}

const PDFPageCanvas: React.FC<PDFPageCanvasProps> = ({ pdfDoc, pageNum, onDimensionsLoaded, canvasRefCallback }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let renderTask: any = null;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      if (!pdfDoc || !canvas) return;
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        const context = canvas.getContext('2d');
        if (context) {
          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };
          renderTask = page.render(renderContext);
          await renderTask.promise;
          if (!isCancelled) {
            onDimensionsLoaded(pageNum, viewport.width, viewport.height);
          }
        }
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled')) {
          return;
        }
        console.error(`Error rendering PDF page ${pageNum}:`, err);
      }
    };

    renderPage();

    return () => {
      isCancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNum]);

  return (
    <canvas
      ref={(el) => {
        canvasRef.current = el;
        canvasRefCallback(pageNum, el);
      }}
      className="w-full h-full rounded-xl page-content-target"
    />
  );
};

export const DocumentSignifyViewer: React.FC<DocumentSignifyViewerProps> = ({
  fileUrl,
  fileType,
  htmlContent = '',
  signatures = [],
  signatories = [],
  activeSignatory = null,
  readOnly = false,
  
  fields = [],
  isDesignerMode = false,
  activeSignatoryId = '',
  onFieldMove,
  onFieldResize,
  onFieldDelete,
  onFieldUpdate,
  onFieldClick,
  onPlaceFieldAtCoordinates,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  const [pdfLoaded, setPdfLoaded] = useState<boolean>(false);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});

  const cleanType = fileType.toLowerCase().replace('-html', '').replace('docx-pdf', 'pdf');
  const isPdf = 
    cleanType.includes('pdf') || 
    (typeof fileUrl === 'string' && (
      fileUrl.toLowerCase().endsWith('.pdf') || 
      fileUrl.toLowerCase().includes('.pdf?') ||
      fileUrl.startsWith('data:application/pdf') || 
      fileUrl.includes('JVBERi0')
    ));
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].some(ext => cleanType.includes(ext)) || (fileUrl && /\.(png|jpg|jpeg|gif|webp)$/i.test(fileUrl)) || (fileUrl && fileUrl.startsWith('data:image/'));
  const isDoc = cleanType.includes('docx') || cleanType.includes('doc') || cleanType.includes('word') || cleanType.includes('html') || !!htmlContent;

  const pdfDocRef = useRef<any>(null);

  useEffect(() => {
    // Reset state whenever fileUrl changes to prevent stale data
    setPdfLoaded(false);
    setNumPages(0);
    setLoading(true);
    setError(null);
    pdfDocRef.current = null;
    canvasRefs.current = {};
  }, [fileUrl]);

  useEffect(() => {
    if (!fileUrl && !htmlContent) {
      setLoading(false);
      return;
    }

    if (isPdf) {
      const loadPdf = async () => {
        setLoading(true);
        setError(null);
        try {
          const pdfjsLib = await loadPdfJS();
          if (!pdfjsLib) {
            throw new Error("PDF.js engine is still loading. Please wait...");
          }

          let pdfSource: any = fileUrl;
          if (typeof fileUrl === 'string') {
            if (fileUrl.startsWith('data:') && fileUrl.includes(';base64,')) {
              try {
                const base64Content = fileUrl.split(';base64,')[1];
                const binaryString = window.atob(base64Content);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                pdfSource = { data: bytes };
              } catch (e) {
                console.warn("Failed decoding data URI as base64:", e);
              }
            } else if (/^[a-zA-Z0-9+/=]+$/.test(fileUrl.trim()) && fileUrl.length > 100) {
              try {
                const binaryString = window.atob(fileUrl.trim());
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                pdfSource = { data: bytes };
              } catch (e) {
                console.warn("Failed decoding raw base64 string:", e);
              }
            } else if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
              const currentOrigin = window.location.origin;
              if (!fileUrl.startsWith(currentOrigin)) {
                pdfSource = `/api/file-proxy?url=${encodeURIComponent(fileUrl)}`;
              }
            }
          }

          const loadingTask = pdfjsLib.getDocument(pdfSource);
          const pdf = await loadingTask.promise;
          pdfDocRef.current = pdf;
          setNumPages(pdf.numPages);
          setPdfLoaded(true);
        } catch (err: any) {
          console.error("Error loading PDF:", err);
          setError("Fidelity Viewer could not parse this PDF format: " + err.message);
          setLoading(false);
        }
      };
      loadPdf();
    } else if (isImage) {
      setNumPages(1);
      setLoading(false);
    } else {
      // Treat as Word / text document fallback
      setNumPages(1);
      setLoading(false);
    }
  }, [fileUrl, fileType, htmlContent, isPdf, isImage, isDoc]);

  const handleDimensionsLoaded = (pageNum: number, width: number, height: number) => {
    setPageDimensions(prev => {
      if (prev[pageNum]?.width === width && prev[pageNum]?.height === height) {
        return prev;
      }
      return {
        ...prev,
        [pageNum]: { width, height }
      };
    });
    setLoading(false);
  };

  const setCanvasRef = (pageNum: number, canvas: HTMLCanvasElement | null) => {
    canvasRefs.current[pageNum] = canvas;
  };

  const handlePageClick = (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    // Only place field on click if designer mode or click placement callback is registered
    if (!onPlaceFieldAtCoordinates) return;
    
    // Check if clicked element is actually the page canvas/image itself to avoid triggering on overlay clicks
    const target = e.target as HTMLElement;
    if (!target.classList.contains('page-content-target')) return;

    const pageDiv = pageRefs.current[pageNum];
    if (!pageDiv) return;

    const rect = pageDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    onPlaceFieldAtCoordinates(pageNum, parseFloat(xPercent.toFixed(2)), parseFloat(yPercent.toFixed(2)));
  };

  // Draggable field coordinator
  const handleDragStart = (e: React.MouseEvent, fieldId: string, pageNum: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDesignerMode || !onFieldMove) return;

    const pageDiv = pageRefs.current[pageNum];
    if (!pageDiv) return;

    const rect = pageDiv.getBoundingClientRect();

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const x = moveEvent.clientX - rect.left;
      const y = moveEvent.clientY - rect.top;

      const xPercent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const yPercent = Math.max(0, Math.min(100, (y / rect.height) * 100));

      onFieldMove(fieldId, pageNum, parseFloat(xPercent.toFixed(2)), parseFloat(yPercent.toFixed(2)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Resizable field coordinator
  const handleResizeStart = (e: React.MouseEvent, fieldId: string, currentWidth: number, currentHeight: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isDesignerMode || !onFieldResize) return;

    const startX = e.clientX;
    const startY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = Math.max(50, currentWidth + deltaX);
      const newHeight = Math.max(24, currentHeight + deltaY);

      onFieldResize(fieldId, newWidth, newHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Color mapper based on signatory sequence to help sender/signer differentiate fields
  const getSignerColorClasses = (signerId: string) => {
    const idx = signatories.findIndex(s => s.id === signerId);
    const colors = [
      { border: 'border-blue-500', bg: 'bg-blue-50/95', text: 'text-blue-700', fill: 'bg-blue-100/50', accent: 'border-blue-200' },
      { border: 'border-purple-500', bg: 'bg-purple-50/95', text: 'text-purple-700', fill: 'bg-purple-100/50', accent: 'border-purple-200' },
      { border: 'border-amber-500', bg: 'bg-amber-50/95', text: 'text-amber-700', fill: 'bg-amber-100/50', accent: 'border-amber-200' },
      { border: 'border-emerald-500', bg: 'bg-emerald-50/95', text: 'text-emerald-700', fill: 'bg-emerald-100/50', accent: 'border-emerald-200' },
      { border: 'border-pink-500', bg: 'bg-pink-50/95', text: 'text-pink-700', fill: 'bg-pink-100/50', accent: 'border-pink-200' }
    ];
    return colors[idx % colors.length] || colors[0];
  };

  // Get field type visual helpers
  const getFieldIcon = (type: string) => {
    switch (type) {
      case 'signature': return <PenTool className="w-3.5 h-3.5" />;
      case 'initial': return <PenTool className="w-3.5 h-3.5 stroke-1" />;
      case 'date': return <Calendar className="w-3.5 h-3.5" />;
      case 'text': return <Type className="w-3.5 h-3.5" />;
      case 'checkbox': return <CheckSquare className="w-3.5 h-3.5" />;
      case 'stamp': return <Image className="w-3.5 h-3.5 text-red-600" />;
      default: return <FileText className="w-3.5 h-3.5" />;
    }
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 overflow-visible max-h-none p-6 bg-slate-100 rounded-2xl border border-slate-200" ref={containerRef} id="docsignify-scroll-container">
      {/* Designer/Legend Header overlay */}
      {isDesignerMode && (
        <div className="w-full max-w-2xl bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 animate-in fade-in-50 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping"></span>
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Canvas Workspace Designer</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {signatories.map((sig, idx) => {
              const theme = getSignerColorClasses(sig.id);
              return (
                <div key={sig.id} className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded bg-slate-50 border border-slate-100">
                  <span className={`w-2.5 h-2.5 rounded-full border ${theme.border} ${theme.bg}`}></span>
                  <span className="text-slate-600 truncate max-w-[80px]">{sig.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <div className="py-20 text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-600 mx-auto"></div>
          <p className="text-xs text-slate-500 font-extrabold uppercase tracking-widest">Rendering original fidelity pages...</p>
        </div>
      )}

      {error && (
        <div className="p-8 text-center text-red-600 bg-red-50 border border-red-200 rounded-xl max-w-md my-4 shadow-sm">
          <AlertCircle className="w-8 h-8 mx-auto text-red-500 mb-2" />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {!error && (
        <div className={`w-full flex flex-col items-center gap-6 ${loading ? 'invisible h-0 overflow-hidden' : 'visible'}`}>
          {Array.from({ length: numPages }).map((_, idx) => {
        const pageNum = idx + 1;
        return (
          <div
            key={pageNum}
            ref={el => pageRefs.current[pageNum] = el}
            onClick={(e) => handlePageClick(pageNum, e)}
            className={`relative bg-white shadow-xl border border-slate-300 rounded-xl select-none transition-shadow duration-300 ${
              isDesignerMode ? 'cursor-crosshair hover:shadow-indigo-100/50 hover:border-indigo-400' : ''
            }`}
            style={{
              width: '100%',
              maxWidth: isPdf ? '720px' : '650px',
              aspectRatio: isPdf ? (pageDimensions[pageNum] ? `${pageDimensions[pageNum].width}/${pageDimensions[pageNum].height}` : '595/842') : undefined,
            }}
          >
            {/* Page header marker */}
            <div className="absolute top-3 left-3 bg-slate-900/85 text-white text-[9px] font-bold px-2.5 py-1 rounded-md z-10 uppercase tracking-widest shadow-sm">
              PAGE {pageNum} of {numPages}
            </div>

            {/* Render Canvas for PDF or direct Image for PNG/JPEG or Rich HTML/text for Docx */}
            {isPdf ? (
              pdfDocRef.current ? (
                <PDFPageCanvas
                  pdfDoc={pdfDocRef.current}
                  pageNum={pageNum}
                  onDimensionsLoaded={handleDimensionsLoaded}
                  canvasRefCallback={setCanvasRef}
                />
              ) : (
                <div className="w-full aspect-[595/842] flex items-center justify-center text-slate-400 bg-slate-50 rounded-xl">
                  Loading page...
                </div>
              )
            ) : isImage ? (
              <img
                src={fileUrl}
                alt="Uploaded Original"
                className="w-full h-auto rounded-xl page-content-target"
                referrerPolicy="no-referrer"
              />
            ) : (
              /* Beautiful rich text document rendering for DOCX / HTML Fallback */
              <div 
                className="w-full min-h-[800px] p-12 bg-white text-slate-800 rounded-xl overflow-y-auto page-content-target select-text text-left prose prose-sm max-w-none shadow-inner border border-slate-100"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                {htmlContent ? (
                  <div 
                    dangerouslySetInnerHTML={{ __html: htmlContent }} 
                    className="space-y-4 page-content-target"
                  />
                ) : (
                  <div className="space-y-4 page-content-target">
                    <h1 className="text-xl font-bold border-b pb-2 text-slate-900 uppercase tracking-tight">
                      Agreement Document
                    </h1>
                    <p className="text-xs text-slate-500 font-mono">
                      Format: {fileType || 'Structured Document'}
                    </p>
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                      This agreement is prepared for signing. Please place overlays on the canvas.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Render Interactive Fields */}
            {fields && fields.length > 0 ? (
              fields
                .filter(field => field.page_number === pageNum)
                .map(field => {
                  const signatory = signatories.find(s => s.id === field.assigned_signer_id);
                  const isInteractive = !readOnly && !isDesignerMode && field.assigned_signer_id === activeSignatoryId;
                  const theme = getSignerColorClasses(field.assigned_signer_id);
                  const signatureForField = signatures.find(sig => sig.signatory_id === field.assigned_signer_id);
                  const isFilled = (field.value !== undefined && field.value !== null && field.value !== '') || (field.type === 'signature' && !!signatureForField?.signature_image_url);
                  const fieldValue = field.value || (field.type === 'signature' && signatureForField?.signature_image_url) || '';
                  
                  return (
                    <div
                      key={field.id}
                      className={`absolute z-20 flex flex-col justify-between p-1 rounded-md border text-left transition-all group ${
                        isDesignerMode 
                          ? `cursor-move ${theme.border} ${theme.bg} shadow-sm hover:shadow-md ring-1 ring-transparent hover:ring-indigo-300`
                          : isInteractive
                            ? isFilled 
                              ? 'border-emerald-500 bg-emerald-50/90 shadow-sm cursor-pointer hover:border-emerald-600'
                              : 'border-indigo-600 bg-indigo-50/90 shadow-sm cursor-pointer hover:bg-indigo-100 ring-2 ring-indigo-500/20 animate-pulse'
                            : `border-slate-300 ${theme.bg} opacity-60 select-none`
                      }`}
                      style={{
                        left: `${field.x_position}%`,
                        top: `${field.y_position}%`,
                        width: `${field.width}px`,
                        height: `${field.height}px`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onMouseDown={(e) => handleDragStart(e, field.id, pageNum)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isInteractive && onFieldClick) {
                          onFieldClick(field.id);
                        }
                      }}
                    >
                      {/* Field Visual Indicator */}
                      <div className="flex justify-between items-center text-[8px] font-black tracking-wider uppercase select-none pb-0.5">
                        <span className="flex items-center gap-1 text-slate-600">
                          {getFieldIcon(field.type)}
                          <span>{field.type}</span>
                        </span>
                        {field.required && <span className="text-red-500 font-black">*</span>}
                      </div>

                      {/* Middle Area Content */}
                      <div className="flex-1 flex items-center justify-center overflow-hidden px-1">
                        {field.type === 'checkbox' ? (
                          <div className="flex items-center justify-center">
                            {fieldValue === true || fieldValue === 'true' ? (
                              <CheckSquare className="w-5 h-5 text-indigo-600" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                        ) : isFilled ? (
                          field.type === 'signature' || field.type === 'initial' || field.type === 'attachment' ? (
                            String(fieldValue).startsWith('data:image/') || String(fieldValue).startsWith('http') ? (
                              <img
                                src={String(fieldValue)}
                                alt="Overlay"
                                className="max-h-full max-w-full object-contain mix-blend-multiply"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="text-xs font-serif italic text-slate-800">{fieldValue}</span>
                            )
                          ) : field.type === 'stamp' ? (
                            <div className="border border-red-500 text-red-500 text-[8px] p-0.5 rounded font-black text-center border-double border-4">
                              {fieldValue}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-800 truncate leading-tight w-full text-center">
                              {fieldValue}
                            </span>
                          )
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 select-none uppercase text-center truncate">
                            {isInteractive ? `Click to fill` : signatory?.name || 'Unassigned'}
                          </span>
                        )}
                      </div>

                      {/* Bottom Role Label */}
                      <div className="text-[7px] text-slate-400 font-mono text-right pr-0.5 select-none font-semibold">
                        {signatory?.name ? signatory.name.split(' ')[0] : 'Signer'}
                      </div>

                      {/* DESIGNER ACTIONS: Delete & Resize Handles */}
                      {isDesignerMode && (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onFieldDelete) onFieldDelete(field.id);
                            }}
                            className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow z-30 transition-transform hover:scale-110"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                          
                          {/* Resize Anchor handle (Bottom-Right) */}
                          <div
                            onMouseDown={(e) => handleResizeStart(e, field.id, field.width, field.height)}
                            className="absolute bottom-0 right-0 w-3 h-3 bg-indigo-500 cursor-se-resize rounded-tl-md rounded-br-md z-30 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </>
                      )}
                    </div>
                  );
                })
            ) : (
              // BACKWARD COMPATIBLE LEGACY RENDERING
              signatures
                .filter(sig => sig.page_number === pageNum)
                .map(sig => {
                  const signatory = signatories.find(s => s.id === sig.signatory_id);
                  const isActive = activeSignatory && activeSignatory.id === sig.signatory_id;
                  
                  return (
                    <div
                      key={sig.id}
                      className={`absolute z-20 flex flex-col justify-between p-1.5 rounded-md border border-dashed transition-all ${
                        isActive 
                          ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500 shadow-lg' 
                          : 'bg-amber-50/80 border-amber-500'
                      }`}
                      style={{
                        left: `${sig.x_position}%`,
                        top: `${sig.y_position}%`,
                        width: `${sig.width || 130}px`,
                        height: `${sig.height || 55}px`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <div className="flex justify-between items-center text-[8px] font-black tracking-wider uppercase">
                        <span className={isActive ? 'text-indigo-700' : 'text-amber-700'}>
                          {signatory?.role?.replace('_', ' ') || 'Signatory'}
                        </span>
                      </div>

                      {sig.signature_image_url ? (
                        <div className="flex-1 flex items-center justify-center overflow-hidden">
                          <img
                            src={sig.signature_image_url}
                            alt="Signature overlay"
                            className="max-h-full max-w-full object-contain mix-blend-multiply"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="text-[10px] font-extrabold text-slate-400 select-none uppercase tracking-widest text-center">
                            {isActive ? 'Click to Sign' : signatory?.name || 'SIGN HERE'}
                          </span>
                        </div>
                      )}

                      <div className="text-[7px] text-slate-400 font-mono text-right font-medium">
                        {signatory?.name || 'Awaiting'}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        );
      })}
        </div>
      )}
    </div>
  );
};
