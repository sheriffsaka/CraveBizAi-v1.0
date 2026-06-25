import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PDFDocument } from "pdf-lib";
import { DbDocument, DbDocumentSignatory, DbDocumentSignature } from "../types";

const DATA_FILE = path.join(process.cwd(), "docsignify_data.json");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface SignifyStore {
  documents: Record<string, DbDocument>;
  signatories: Record<string, DbDocumentSignatory>;
  signatures: DbDocumentSignature[];
}

function loadStore(): SignifyStore {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(data) || { documents: {}, signatories: {}, signatures: [] };
    }
  } catch (e) {
    console.error("Failed to load docsignify_data.json store:", e);
  }
  return { documents: {}, signatories: {}, signatures: [] };
}

function saveStore(store: SignifyStore) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf-8");
    return true;
  } catch (e) {
    console.error("Failed to save docsignify_data.json store:", e);
    return false;
  }
}

export class SignifyService {
  /**
   * Save an uploaded file locally and return its accessible URL.
   */
  static saveUploadedFile(fileName: string, base64Data: string, fileType: string): { fileUrl: string, filePath: string } {
    // Strip data URL prefixes if present
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    
    // Generate a secure unique file name to prevent collision
    const fileId = crypto.randomUUID();
    const safeName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storedName = `${fileId}_${safeName}`;
    const filePath = path.join(UPLOADS_DIR, storedName);
    
    fs.writeFileSync(filePath, buffer);
    
    // Use standard local URL path
    const fileUrl = `/uploads/${storedName}`;
    return { fileUrl, filePath };
  }

  /**
   * Create a new document with its signatories in the local database.
   */
  static createDocument(
    docId: string,
    title: string,
    originalFileUrl: string,
    ownerId: string,
    fileType: string,
    fileName: string,
    signatoriesInput: { name: string; email: string; role: DbDocumentSignatory['role'] }[]
  ): { document: DbDocument; signatories: DbDocumentSignatory[] } {
    const store = loadStore();
    
    const document: DbDocument = {
      id: docId,
      title,
      original_file_url: originalFileUrl,
      signed_file_url: null,
      owner_id: ownerId,
      status: "pending",
      created_at: new Date().toISOString(),
      file_type: fileType,
      file_name: fileName
    };
    
    store.documents[docId] = document;
    
    const createdSignatories: DbDocumentSignatory[] = [];
    
    for (const input of signatoriesInput) {
      const sigId = crypto.randomUUID();
      const token = crypto.randomBytes(32).toString("hex");
      
      const signatory: DbDocumentSignatory = {
        id: sigId,
        document_id: docId,
        name: input.name,
        email: input.email,
        role: input.role,
        token: token,
        status: "pending",
        signed_at: null
      };
      
      store.signatories[sigId] = signatory;
      createdSignatories.push(signatory);
    }
    
    saveStore(store);
    return { document, signatories: createdSignatories };
  }

  /**
   * Retrieve a document along with all its signatories and current placed signatures.
   */
  static getDocumentDetails(docId: string): { document: DbDocument | null; signatories: DbDocumentSignatory[]; signatures: DbDocumentSignature[] } {
    const store = loadStore();
    const document = store.documents[docId] || null;
    
    if (!document) {
      return { document: null, signatories: [], signatures: [] };
    }
    
    const signatories = Object.values(store.signatories).filter(s => s.document_id === docId);
    const signatures = store.signatures.filter(s => s.document_id === docId);
    
    return { document, signatories, signatures };
  }

  /**
   * Validate a security signing token and retrieve context.
   */
  static getDocumentByToken(token: string): { document: DbDocument; signatory: DbDocumentSignatory; signatories: DbDocumentSignatory[]; signatures: DbDocumentSignature[] } | null {
    const store = loadStore();
    
    // Find the signatory with this token
    const signatory = Object.values(store.signatories).find(s => s.token === token);
    if (!signatory) {
      return null;
    }
    
    const docId = signatory.document_id;
    const document = store.documents[docId];
    if (!document) {
      return null;
    }
    
    const signatories = Object.values(store.signatories).filter(s => s.document_id === docId);
    const signatures = store.signatures.filter(s => s.document_id === docId);
    
    return { document, signatory, signatories, signatures };
  }

  /**
   * Place signature details.
   */
  static addSignature(signatureInput: Omit<DbDocumentSignature, 'id' | 'created_at'>): DbDocumentSignature {
    const store = loadStore();
    
    const signature: DbDocumentSignature = {
      ...signatureInput,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString()
    };
    
    // Remove duplicates if the signatory is re-positioning or placing on the same page
    store.signatures = store.signatures.filter(s => 
      !(s.document_id === signature.document_id && 
        s.signatory_id === signature.signatory_id && 
        s.page_number === signature.page_number)
    );
    
    store.signatures.push(signature);
    saveStore(store);
    return signature;
  }

  /**
   * Complete the signing action for a signatory and check if a final merged PDF is needed.
   */
  static async updateSignatoryStatus(
    signatoryId: string,
    status: 'signed' | 'declined',
    signaturesInput: DbDocumentSignature[]
  ): Promise<{ document: DbDocument; signatory: DbDocumentSignatory }> {
    const store = loadStore();
    
    const signatory = store.signatories[signatoryId];
    if (!signatory) {
      throw new Error("Signatory not found");
    }
    
    signatory.status = status;
    signatory.signed_at = status === 'signed' ? new Date().toISOString() : null;
    
    const docId = signatory.document_id;
    const document = store.documents[docId];
    if (!document) {
      throw new Error("Document not found");
    }
    
    // Insert/update signatures in store if provided
    if (signaturesInput && signaturesInput.length > 0) {
      for (const sig of signaturesInput) {
        store.signatures = store.signatures.filter(s => s.id !== sig.id);
        store.signatures.push(sig);
      }
    }
    
    // Check all signatories for this document
    const docSignatories = Object.values(store.signatories).filter(s => s.document_id === docId);
    const totalToSign = docSignatories.filter(s => s.role !== 'owner').length;
    const signedCount = docSignatories.filter(s => s.role !== 'owner' && s.status === 'signed').length;
    
    if (status === 'declined') {
      document.status = 'declined';
    } else if (signedCount === totalToSign) {
      document.status = 'completed';
      
      // Perform PDF merge immediately!
      try {
        const mergedBase64 = await this.mergeSignatures(document.id, docSignatories, store.signatures);
        const fileNameParts = document.file_name?.split('.') || ['signed', 'pdf'];
        const ext = fileNameParts.pop();
        const baseName = fileNameParts.join('.');
        const signedFileName = `${baseName}_signed.pdf`;
        
        const { fileUrl } = this.saveUploadedFile(signedFileName, mergedBase64, "application/pdf");
        document.signed_file_url = fileUrl;
      } catch (err) {
        console.error("PDF signature merging failed:", err);
      }
    } else if (signedCount > 0) {
      document.status = 'partially_signed';
    }
    
    saveStore(store);
    return { document, signatory };
  }

  /**
   * Core PDF merging capability using pdf-lib.
   * Renders the original file and overlays signature drawings/images.
   */
  static async mergeSignatures(docId: string, signatories: DbDocumentSignatory[], signatures: DbDocumentSignature[]): Promise<string> {
    const store = loadStore();
    const document = store.documents[docId];
    if (!document) {
      throw new Error("Document not found in store");
    }
    
    // Locate original document file
    const urlParts = document.original_file_url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const originalFilePath = path.join(UPLOADS_DIR, fileName);
    
    if (!fs.existsSync(originalFilePath)) {
      throw new Error(`Original file not found on disk: ${originalFilePath}`);
    }
    
    const fileBytes = fs.readFileSync(originalFilePath);
    let pdfDoc: PDFDocument;
    
    // Check file type
    const fileType = document.file_type?.toLowerCase() || 'pdf';
    
    if (fileType === 'pdf') {
      pdfDoc = await PDFDocument.load(fileBytes);
    } else if (fileType === 'png' || fileType === 'jpg' || fileType === 'jpeg') {
      // Create a fresh PDF document and embed the image page
      pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      
      let img;
      if (fileType === 'png') {
        img = await pdfDoc.embedPng(fileBytes);
      } else {
        img = await pdfDoc.embedJpg(fileBytes);
      }
      
      // Fit the image neatly onto the page
      page.drawImage(img, {
        x: 0,
        y: 0,
        width,
        height
      });
    } else if (fileType === 'docx' || fileType === 'docx-html') {
      // DOCX files have been converted once to a baseline PDF
      // Check if there is already a converted pdf file, otherwise we load as PDF
      pdfDoc = await PDFDocument.load(fileBytes);
    } else {
      throw new Error(`Unsupported file type for signature embedding: ${fileType}`);
    }
    
    const docSignatures = signatures.filter(s => s.document_id === docId);
    
    for (const sig of docSignatures) {
      const pageNum = Math.max(0, Number(sig.page_number) - 1); // 0-indexed in pdf-lib
      const totalPages = pdfDoc.getPageCount();
      if (pageNum >= totalPages) continue;
      
      const page = pdfDoc.getPage(pageNum);
      const { width, height } = page.getSize();
      
      // Map percentage-based coordinate layout (0-100) to standard PDF margins
      // In web, y is distance from TOP. In PDF, y is distance from BOTTOM!
      const sigWidth = sig.width || 120;
      const sigHeight = sig.height || 50;
      
      const x = (Number(sig.x_position) / 100) * width;
      const y = height - ((Number(sig.y_position) / 100) * height) - sigHeight;
      
      try {
        let signatureImg;
        const imgData = sig.signature_image_url;
        
        if (imgData.startsWith("data:image/png;base64,")) {
          const base64Data = imgData.replace(/^data:image\/png;base64,/, "");
          signatureImg = await pdfDoc.embedPng(Buffer.from(base64Data, "base64"));
        } else if (imgData.startsWith("data:image/jpeg;base64,") || imgData.startsWith("data:image/jpg;base64,")) {
          const base64Data = imgData.replace(/^data:image\/jpeg;base64,/, "").replace(/^data:image\/jpg;base64,/, "");
          signatureImg = await pdfDoc.embedJpg(Buffer.from(base64Data, "base64"));
        }
        
        if (signatureImg) {
          page.drawImage(signatureImg, {
            x,
            y,
            width: sigWidth,
            height: sigHeight
          });
        }
      } catch (embedError) {
        console.error("Failed to embed signature onto page:", pageNum, embedError);
      }
    }
    
    const mergedPdfBytes = await pdfDoc.save();
    return Buffer.from(mergedPdfBytes).toString("base64");
  }
}
