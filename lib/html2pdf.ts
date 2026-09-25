/**
 * On-demand lazy loader for html2pdf.js
 * Prevents loading ~200KB bundle during initial application login / dashboard rendering.
 */
let html2pdfPromise: Promise<any> | null = null;

export function loadHtml2Pdf(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).html2pdf) {
    return Promise.resolve((window as any).html2pdf);
  }

  if (html2pdfPromise) {
    return html2pdfPromise;
  }

  html2pdfPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('html2pdf is only supported in browser environment'));
    }

    if ((window as any).html2pdf) {
      return resolve((window as any).html2pdf);
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.integrity = 'sha512-GsLlZN/3F2ErC5ifS5QtgpiJtWd43JWSuIgh7mbzZ8zBps+dvLusV+eNQATqgA/HdeKFVgA5v3S/cIrLF7QnIg==';
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.async = true;

    script.onload = () => {
      if ((window as any).html2pdf) {
        resolve((window as any).html2pdf);
      } else {
        reject(new Error('html2pdf object missing after script execution'));
      }
    };

    script.onerror = () => {
      html2pdfPromise = null;
      reject(new Error('Failed to load html2pdf script. Please check your network connection.'));
    };

    document.head.appendChild(script);
  });

  return html2pdfPromise;
}
