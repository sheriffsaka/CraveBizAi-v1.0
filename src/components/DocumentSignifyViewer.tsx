import React, { useEffect, useRef, useState } from 'react';
import { DbDocumentSignature, DbDocumentSignatory } from '../types';

interface DocumentSignifyViewerProps {
  fileUrl: string;
  fileType: string;
  signatures: DbDocumentSignature[];
  signatories?: DbDocumentSignatory[];
  activeSignatory?: DbDocumentSignatory | null;
  onPlaceSignature?: (placement: { page_number: number; x_position: number; y_position: number; width: number; height: number }) => void;
  readOnly?: boolean;
}

export const DocumentSignifyViewer: React.FC<DocumentSignifyViewerProps> = ({
  fileUrl,
  fileType,
  signatures,
  signatories = [],
  activeSignatory = null,
  onPlaceSignature,
  readOnly = false,
}) => {
  const [numPages, setNumPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pageDimensions, setPageDimensions] = useState<Record<number, { width: number; height: number }>>({});
  
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const canvasRefs = useRef<Record<number, HTMLCanvasElement | null>>({});

  const cleanType = fileType.toLowerCase().replace('-html', '').replace('docx-pdf', 'pdf');

  useEffect(() => {
    if (!fileUrl) return;

    if (cleanType === 'pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
      renderPdf();
    } else if (['png', 'jpg', 'jpeg'].includes(cleanType) || /\.(png|jpg|jpeg)$/i.test(fileUrl)) {
      setNumPages(1);
      setLoading(false);
    } else {
      setError("Unsupported file format in e-sign viewer.");
      setLoading(false);
    }
  }, [fileUrl, fileType]);

  const renderPdf = async () => {
    setLoading(true);
    setError(null);
    try {
      const pdfjsLib = (window as any).pdfjsLib;
      if (!pdfjsLib) {
        throw new Error("PDF.js engine is still loading. Please wait...");
      }

      const loadingTask = pdfjsLib.getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      setNumPages(pdf.numPages);
      
      // Render pages sequentially
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        
        const canvas = canvasRefs.current[pageNum];
        if (canvas) {
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const context = canvas.getContext('2d');
          if (context) {
            const renderContext = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
          }
          
          setPageDimensions(prev => ({
            ...prev,
            [pageNum]: { width: viewport.width, height: viewport.height }
          }));
        }
      }
    } catch (err: any) {
      console.error("Error rendering PDF:", err);
      setError("Fidelity Viewer could not parse this PDF format: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Callback to set canvas and render when ready
  const setCanvasRef = (pageNum: number, canvas: HTMLCanvasElement | null) => {
    canvasRefs.current[pageNum] = canvas;
    if (canvas && pageDimensions[pageNum] === undefined) {
      renderPdf();
    }
  };

  const handlePageClick = (pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly || !onPlaceSignature) return;

    const pageDiv = pageRefs.current[pageNum];
    if (!pageDiv) return;

    const rect = pageDiv.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to percentage coordinate maps (0-100)
    const xPercent = (x / rect.width) * 100;
    const yPercent = (y / rect.height) * 100;

    onPlaceSignature({
      page_number: pageNum,
      x_position: parseFloat(xPercent.toFixed(2)),
      y_position: parseFloat(yPercent.toFixed(2)),
      width: 130,
      height: 55,
    });
  };

  return (
    <div className="w-full flex flex-col items-center gap-6 overflow-y-auto max-h-[750px] p-4 bg-gray-100/50 rounded-2xl border border-gray-200" ref={containerRef}>
      {loading && (
        <div className="py-12 text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-600 mx-auto"></div>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Rendering original fidelity pages...</p>
        </div>
      )}

      {error && (
        <div className="p-6 text-center text-red-500 bg-red-50 border border-red-200 rounded-xl max-w-md my-4">
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      {!loading && !error && Array.from({ length: numPages }).map((_, idx) => {
        const pageNum = idx + 1;
        return (
          <div
            key={pageNum}
            ref={el => pageRefs.current[pageNum] = el}
            onClick={(e) => handlePageClick(pageNum, e)}
            className={`relative bg-white shadow-md border border-gray-200 rounded-lg select-none ${readOnly ? '' : 'cursor-crosshair hover:ring-2 hover:ring-indigo-500/20'}`}
            style={{
              width: '100%',
              maxWidth: cleanType === 'pdf' ? '700px' : '650px',
              aspectRatio: cleanType === 'pdf' ? '595/842' : undefined,
            }}
          >
            {/* Page header marker */}
            <div className="absolute top-2 left-2 bg-black/60 text-white text-[9px] font-bold px-2 py-0.5 rounded-md z-10">
              PAGE {pageNum} of {numPages}
            </div>

            {/* Render Canvas for PDF/DOCX-pdf or direct Image for PNG/JPEG */}
            {cleanType === 'pdf' ? (
              <canvas
                ref={el => setCanvasRef(pageNum, el)}
                className="w-full h-full rounded-lg"
              />
            ) : (
              <img
                src={fileUrl}
                alt="Uploaded Original"
                className="w-full h-auto rounded-lg"
                referrerPolicy="no-referrer"
              />
            )}

            {/* Render Signature Placement Overlays on top of the document page */}
            {signatures
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
                      transform: 'translate(-50%, -50%)', // center on coordinates
                    }}
                    onClick={(e) => {
                      e.stopPropagation(); // prevent adding another signature slot
                    }}
                  >
                    <div className="flex justify-between items-center text-[8px] font-black tracking-wider uppercase">
                      <span className={isActive ? 'text-indigo-700' : 'text-amber-700'}>
                        {signatory?.role?.replace('_', ' ') || 'Signatory'}
                      </span>
                      {isActive && <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-indigo-600"></span>}
                    </div>

                    {/* Displays actual signature image if signed, else placeholder text */}
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
                        <span className="text-[10px] font-extrabold text-gray-400 select-none uppercase tracking-widest text-center">
                          {isActive ? 'Click to Sign' : signatory?.name || 'SIGN HERE'}
                        </span>
                      </div>
                    )}

                    <div className="text-[7px] text-gray-400 font-mono text-right font-medium">
                      {signatory?.name || 'Awaiting'}
                    </div>
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
};
