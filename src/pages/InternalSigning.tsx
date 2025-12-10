import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Pen, X, Check, RotateCcw, ChevronLeft, ChevronRight, Download, Type, ArrowLeft, Move } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Supabase Configuration (reusing from main app)
const SUPABASE_URL = 'https://gaxzaskncmqbtpimzypw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheHphc2tuY21xYnRwaW16eXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3OTI2MjYsImV4cCI6MjA2ODM2ODYyNn0.D2tLT4edbdVT7Sdu_4gpS8sa-tsdFsXBmJPbGlUp0Yk';

// Simple Supabase client
class SupabaseClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(url: string, key: string) {
    this.baseUrl = url;
    this.apiKey = key;
  }

  async uploadFile(bucket: string, path: string, file: File) {
    const response = await fetch(`${this.baseUrl}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'apikey': this.apiKey,
      },
      body: file
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Upload error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
  }

  getPublicUrl(bucket: string, path: string) {
    return `${this.baseUrl}/storage/v1/object/public/${bucket}/${path}`;
  }
}

const isApiKeyConfigured = SUPABASE_ANON_KEY.length > 50 && SUPABASE_ANON_KEY.startsWith('eyJ');
const supabase = isApiKeyConfigured ? new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

interface CompanyField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'name' | 'company';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  label: string;
  value?: string;
  signatureData?: string;
}

interface CompanyDocument {
  id: string;
  name: string;
  fields: CompanyField[];
  status: 'draft' | 'completed';
  originalPdfUrl?: string;
  signedPdfUrl?: string;
}

const cursiveFonts = [
  { name: 'Dancing Script', value: '"Dancing Script", cursive' },
  { name: 'Great Vibes', value: '"Great Vibes", cursive' },
  { name: 'Allura', value: '"Allura", cursive' },
  { name: 'Alex Brush', value: '"Alex Brush", cursive' },
  { name: 'Satisfy', value: '"Satisfy", cursive' },
  { name: 'Pacifico', value: '"Pacifico", cursive' }
];

export default function InternalSigning() {
  const navigate = useNavigate();
  
  // Document state
  const [currentDocument, setCurrentDocument] = useState<CompanyDocument | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // PDF rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageScale] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Field placement and manipulation
  const [selectedFieldType, setSelectedFieldType] = useState<CompanyField['type'] | null>(null);
  const [placingField, setPlacingField] = useState(false);
  const [selectedField, setSelectedField] = useState<CompanyField | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  
  // Modals
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600&family=Great+Vibes&family=Allura&family=Alex+Brush&family=Satisfy&family=Pacifico&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // Load PDF.js and PDF-lib
  useEffect(() => {
    const pdfScript = document.createElement('script');
    pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    pdfScript.onload = () => {
      // @ts-ignore
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    };
    document.head.appendChild(pdfScript);

    const pdfLibScript = document.createElement('script');
    pdfLibScript.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    document.head.appendChild(pdfLibScript);

    return () => {
      document.head.removeChild(pdfScript);
      document.head.removeChild(pdfLibScript);
    };
  }, []);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;
    
    const page = await pdfDoc.getPage(pageNum);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const viewport = page.getViewport({ scale: pageScale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    
    await page.render(renderContext).promise;
  }, [pdfDoc, pageScale]);

  useEffect(() => {
    if (pdfDoc) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      try {
        setLoading(true);
        setPdfFile(file);

        // Upload PDF to Supabase Storage
        let pdfUrl = '';
        if (supabase) {
          try {
            const fileName = `company_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            await supabase.uploadFile('documents', fileName, file);
            pdfUrl = supabase.getPublicUrl('documents', fileName);
          } catch (uploadError) {
            console.error('Upload failed:', uploadError);
          }
        }

        const arrayBuffer = await file.arrayBuffer();
        
        // @ts-ignore
        const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        
        // Create new company document
        const newDoc: CompanyDocument = {
          id: Date.now().toString(),
          name: file.name,
          fields: [],
          status: 'draft',
          originalPdfUrl: pdfUrl
        };
        
        setCurrentDocument(newDoc);
      } catch (err) {
        console.error('Error uploading file:', err);
        setError('Failed to upload PDF. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const startPlacingField = (fieldType: CompanyField['type']) => {
    setSelectedFieldType(fieldType);
    setPlacingField(true);
    setSelectedField(null);
  };

  // Helper to get coordinates from mouse or touch for canvas
  const getCanvasCoordinates = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if ('touches' in event && event.touches.length > 0) {
      return {
        x: event.touches[0].clientX - rect.left,
        y: event.touches[0].clientY - rect.top
      };
    } else if ('clientX' in event) {
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }
    return null;
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!placingField || !selectedFieldType || !currentDocument) return;
    
    const coords = getCanvasCoordinates(event);
    if (!coords) return;
    
    const { x, y } = coords;
    
    const fieldLabels = {
      signature: 'Company Signature',
      name: 'Company Name',
      company: 'Business Name',
      date: 'Date',
      text: 'Text Field'
    };
    
    const fieldSizes = {
      signature: { width: 200, height: 60 },
      name: { width: 200, height: 40 },
      company: { width: 200, height: 40 },
      date: { width: 150, height: 40 },
      text: { width: 200, height: 40 }
    };
    
    const newField: CompanyField = {
      id: Date.now().toString(),
      type: selectedFieldType,
      x,
      y,
      width: fieldSizes[selectedFieldType].width,
      height: fieldSizes[selectedFieldType].height,
      page: currentPage,
      label: fieldLabels[selectedFieldType],
    };
    
    setCurrentDocument({
      ...currentDocument,
      fields: [...currentDocument.fields, newField]
    });
    
    setPlacingField(false);
    setSelectedFieldType(null);
  };

  // Helper to get pointer coordinates from mouse or touch
  const getPointerCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if ('clientX' in e) {
      return { x: e.clientX, y: e.clientY };
    }
    return null;
  };

  const handleFieldMouseDown = (e: React.MouseEvent | React.TouchEvent, field: CompanyField) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    const coords = getPointerCoordinates(e);
    if (coords) {
      setDragStart({ x: coords.x - field.x, y: coords.y - field.y });
      setDragging(true);
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent | React.TouchEvent, field: CompanyField) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    const coords = getPointerCoordinates(e);
    if (coords) {
      setResizeStart({ 
        x: coords.x, 
        y: coords.y, 
        width: field.width, 
        height: field.height 
      });
      setResizing(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (dragging && selectedField && currentDocument) {
      const coords = getPointerCoordinates(e);
      if (coords) {
        const newX = coords.x - dragStart.x;
        const newY = coords.y - dragStart.y;
        
        const updatedFields = currentDocument.fields.map(field =>
          field.id === selectedField.id
            ? { ...field, x: Math.max(0, newX), y: Math.max(0, newY) }
            : field
        );
        
        setCurrentDocument({
          ...currentDocument,
          fields: updatedFields
        });
      }
    }
    
    if (resizing && selectedField && currentDocument) {
      const coords = getPointerCoordinates(e);
      if (coords) {
        const deltaX = coords.x - resizeStart.x;
        const deltaY = coords.y - resizeStart.y;
        const newWidth = Math.max(50, resizeStart.width + deltaX);
        const newHeight = Math.max(20, resizeStart.height + deltaY);
        
        const updatedFields = currentDocument.fields.map(field =>
          field.id === selectedField.id
            ? { ...field, width: newWidth, height: newHeight }
            : field
        );
        
        setCurrentDocument({
          ...currentDocument,
          fields: updatedFields
        });
      }
    }
  };

  const handleMouseUp = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    setDragging(false);
    setResizing(false);
  };

  const handleFieldInteraction = (field: CompanyField) => {
    console.log('Field clicked:', field);
    
    if (field.type === 'signature') {
      setEditingFieldId(field.id);
      setShowSignatureModal(true);
    } else {
      // Handle text fields with prompt
      const value = prompt(`Enter ${field.label}:`, field.value || '');
      if (value !== null) {
        updateFieldValue(field.id, value);
      }
    }
  };

  // Helper function to measure text dimensions using the actual canvas context
  const measureTextDimensions = (text: string, fontSize: number = 12): { width: number; height: number } => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return { width: 200, height: 40 };
    
    // Use the same font that will be used in the PDF
    ctx.font = `${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.4; // Line height with padding
    
    // Add padding: 12px horizontal, 8px vertical
    return {
      width: Math.max(textWidth + 24, 120), // Minimum width of 120px
      height: Math.max(textHeight + 16, 36) // Minimum height of 36px
    };
  };

  const updateFieldValue = (fieldId: string, value: string, signatureData?: string) => {
    if (!currentDocument) return;
    
    const field = currentDocument.fields.find(f => f.id === fieldId);
    if (!field) return;
    
    // For text fields (not signatures), measure the text and adjust field size
    // Keep the original position (x, y) - the field will grow from top-left
    let updatedField = { ...field };
    
    if (field.type !== 'signature' && value) {
      const textDimensions = measureTextDimensions(value, 12);
      // Keep the same x, y position - only update width and height
      updatedField = {
        ...updatedField,
        width: textDimensions.width,
        height: textDimensions.height
      };
    }
    
    const updatedFields = currentDocument.fields.map(f =>
      f.id === fieldId
        ? { ...updatedField, value, signatureData }
        : f
    );
    
    setCurrentDocument({
      ...currentDocument,
      fields: updatedFields
    });
  };

  const removeField = (fieldId: string) => {
    if (!currentDocument) return;
    
    setCurrentDocument({
      ...currentDocument,
      fields: currentDocument.fields.filter(f => f.id !== fieldId)
    });
  };

  const generateSignedPDF = async (): Promise<Uint8Array> => {
    if (!currentDocument) throw new Error('No document');
    
    try {
      // @ts-ignore
      const { PDFDocument, rgb } = window.PDFLib;
      
      let pdfBytes: Uint8Array;
      
      if (currentDocument.originalPdfUrl) {
        const response = await fetch(currentDocument.originalPdfUrl);
        pdfBytes = new Uint8Array(await response.arrayBuffer());
      } else if (pdfFile) {
        pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
      } else {
        throw new Error('No PDF source available');
      }

      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      for (const field of currentDocument.fields) {
        if (!field.value && !field.signatureData) continue;
        
        const page = pages[field.page - 1];
        if (!page) continue;

        const { height: pageHeight } = page.getSize();
        
        // Get the canvas element to calculate CSS scaling
        const canvas = canvasRef.current;
        if (!canvas) continue;
        
        // Canvas internal dimensions (set by PDF.js rendering)
        const canvasInternalWidth = canvas.width;
        const canvasInternalHeight = canvas.height;
        
        // Canvas display dimensions (may be different due to CSS scaling like max-w-full)
        const canvasDisplayWidth = canvas.clientWidth || canvasInternalWidth;
        const canvasDisplayHeight = canvas.clientHeight || canvasInternalHeight;
        
        // Calculate CSS scale factors
        const cssScaleX = canvasInternalWidth / canvasDisplayWidth;
        const cssScaleY = canvasInternalHeight / canvasDisplayHeight;
        
        // Convert: CSS display pixels -> Canvas internal pixels -> PDF points
        // Step 1: Convert CSS pixels to canvas internal pixels
        const canvasX = field.x * cssScaleX;
        const canvasY = field.y * cssScaleY;
        const canvasWidth = field.width * cssScaleX;
        const canvasHeight = field.height * cssScaleY;
        
        // Step 2: Convert canvas pixels to PDF points (canvas is rendered at pageScale)
        const scaleFactor = 1 / pageScale;
        const scaledX = canvasX * scaleFactor;
        const scaledY = canvasY * scaleFactor;
        const scaledWidth = canvasWidth * scaleFactor;
        const scaledHeight = canvasHeight * scaleFactor;
        
        // Step 3: Convert from top-left (HTML canvas) to bottom-left (PDF) coordinate system
        const pdfX = scaledX;
        const pdfY = pageHeight - scaledY - scaledHeight;

        if (field.type === 'signature' && field.signatureData) {
          try {
            const imageBytes = await fetch(field.signatureData).then(res => res.arrayBuffer());
            const image = await pdfDoc.embedPng(new Uint8Array(imageBytes));
            
            page.drawImage(image, {
              x: pdfX,
              y: pdfY,
              width: scaledWidth,
              height: scaledHeight,
            });
          } catch (err) {
            console.error('Error embedding signature:', err);
          }
        } else if (field.value) {
          page.drawText(field.value, {
            x: pdfX + 5,
            y: pdfY + (scaledHeight / 2) - 6,
            size: Math.min(12, scaledHeight * 0.8),
            color: rgb(0, 0, 0),
          });
        }
      }

      return await pdfDoc.save();
    } catch (err) {
      console.error('Error generating signed PDF:', err);
      throw err;
    }
  };

  const downloadSignedDocument = async () => {
    if (!currentDocument) return;
    
    try {
      setLoading(true);
      
      const signedPdfBytes = await generateSignedPDF();
      
      // Download the PDF
      const blob = new Blob([signedPdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `company_signed_${currentDocument.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setError('✅ Company document completed and downloaded successfully!');
      
    } catch (err) {
      console.error('Error downloading document:', err);
      setError('Failed to generate signed PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const currentPageFields = currentDocument?.fields.filter(field => field.page === currentPage) || [];

  const getFieldIcon = (type: CompanyField['type']) => {
    switch (type) {
      case 'signature': return <Pen size={16} />;
      case 'name': return <FileText size={16} />;
      case 'company': return <FileText size={16} />;
      case 'date': return <FileText size={16} />;
      case 'text': return <Type size={16} />;
    }
  };

  // SIGNATURE MODAL COMPONENT
  const SignatureModal = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);
    const [mode, setMode] = useState<'draw' | 'type'>('draw');
    
    // Typed signature state
    const [text, setText] = useState('');
    const [selectedFont, setSelectedFont] = useState(cursiveFonts[0]);

    // Helper to get coordinates from mouse or touch event
    const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length > 0) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top
        };
      } else if ('clientX' in e) {
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        };
      }
      return null;
    };

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const coords = getCoordinates(e);
      if (!coords) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      setIsDrawing(true);
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      if (!isDrawing) return;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const coords = getCoordinates(e);
      if (!coords) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.lineTo(coords.x, coords.y);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      setHasDrawn(true);
    };

    const stopDrawing = (e?: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (e) e.preventDefault();
      setIsDrawing(false);
    };

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    };

    const createTypedSignature = (text: string, fontFamily: string): string => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'black';
        ctx.font = `36px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        return canvas.toDataURL('image/png');
      }
      return '';
    };

    const saveSignature = () => {
      if (!editingFieldId) return;

      let signatureData = '';

      if (mode === 'draw') {
        const canvas = canvasRef.current;
        if (!canvas || !hasDrawn) return;
        signatureData = canvas.toDataURL('image/png');
      } else {
        if (!text.trim()) return;
        signatureData = createTypedSignature(text, selectedFont.value);
      }

      console.log('Saving signature to field:', editingFieldId);
      updateFieldValue(editingFieldId, '', signatureData);
      
      setShowSignatureModal(false);
      setEditingFieldId(null);
      setText('');
      clearCanvas();
    };

    if (!showSignatureModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-6 w-[600px] shadow-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-semibold text-gray-800">Create Signature</h3>
            <button 
              onClick={() => {
                setShowSignatureModal(false);
                setEditingFieldId(null);
                setText('');
                clearCanvas();
              }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={24} />
            </button>
          </div>
          
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setMode('draw')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                mode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Pen size={16} className="inline mr-2" />
              Draw
            </button>
            <button
              onClick={() => setMode('type')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                mode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Type size={16} className="inline mr-2" />
              Type
            </button>
          </div>

          {mode === 'draw' ? (
            <>
              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-3">Draw your signature in the box below:</p>
                <canvas
                  ref={canvasRef}
                  width={552}
                  height={150}
                  className="border-2 border-gray-200 rounded-lg cursor-crosshair bg-gray-50 w-full touch-none"
                  style={{ 
                    touchAction: 'none',
                    minHeight: '150px',
                    maxWidth: '100%'
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              
              <div className="flex justify-between">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      clearCanvas();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      clearCanvas();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 text-gray-600 hover:text-gray-800 active:bg-gray-200 transition-colors touch-manipulation"
                    style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <RotateCcw size={16} />
                    Clear
                  </button>
                
                <div className="flex gap-3">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      setShowSignatureModal(false);
                      setEditingFieldId(null);
                      clearCanvas();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      setShowSignatureModal(false);
                      setEditingFieldId(null);
                      clearCanvas();
                    }}
                    className="px-6 py-2.5 text-gray-600 hover:text-gray-800 active:bg-gray-200 transition-colors touch-manipulation"
                    style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      saveSignature();
                    }}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      saveSignature();
                    }}
                    disabled={!hasDrawn}
                    className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors touch-manipulation"
                    style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <Check size={16} />
                    Use Signature
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Font Style</label>
                  <select
                    value={selectedFont.name}
                    onChange={(e) => setSelectedFont(cursiveFonts.find(f => f.name === e.target.value) || cursiveFonts[0])}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {cursiveFonts.map((font) => (
                      <option key={font.name} value={font.name}>{font.name}</option>
                    ))}
                  </select>
                </div>
                
                {text && (
                  <div className="border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="text-sm text-gray-600 mb-2">Preview:</div>
                    <div 
                      style={{ fontFamily: selectedFont.value }}
                      className="text-3xl text-center text-gray-800"
                    >
                      {text}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setShowSignatureModal(false);
                    setEditingFieldId(null);
                    setText('');
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    setShowSignatureModal(false);
                    setEditingFieldId(null);
                    setText('');
                  }}
                  className="px-6 py-2.5 text-gray-600 hover:text-gray-800 active:bg-gray-200 transition-colors touch-manipulation"
                  style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    saveSignature();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    saveSignature();
                  }}
                  disabled={!text.trim()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                >
                  <Check size={16} />
                  Create Signature
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100"
         onMouseMove={handleMouseMove}
         onMouseUp={handleMouseUp}
         onTouchMove={handleMouseMove}
         onTouchEnd={handleMouseUp}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Error Display */}
        {error && (
          <div className={`mb-6 p-4 rounded-lg border font-medium ${
            error.startsWith('✅') 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            {error}
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={() => navigate('/')}
                  className="flex items-center gap-2 px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300 text-sm font-medium"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <div className="w-px h-6 bg-slate-300"></div>
                <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">Internal Document Prep</h1>
              </div>
              <p className="text-slate-600 text-sm font-medium">
                Prepare company documents with internal signatures
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {currentDocument && currentDocument.fields.length > 0 && (
                <button
                  onClick={downloadSignedDocument}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg font-semibold text-sm"
                >
                  <Download size={18} />
                  Download PDF
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <FileText size={18} className="text-slate-700" />
                Upload
              </h2>
              
              {!currentDocument ? (
                <div className="text-center">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-all disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg font-semibold text-sm"
                  >
                    <Upload size={18} />
                    Upload PDF
                  </button>
                  <p className="text-xs text-slate-500 mt-3">
                    Upload a PDF to add company signatures
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <FileText size={16} className="text-slate-600" />
                  <span className="truncate font-medium text-slate-900 text-sm">{currentDocument.name}</span>
                </div>
              )}
            </div>

            {/* Field Tools */}
            {currentDocument && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4 text-sm">Add Fields</h3>
                <div className="space-y-1.5">
                  {[
                    { type: 'signature' as const, label: 'Company Signature' },
                    { type: 'name' as const, label: 'Signatory Name' },
                    { type: 'company' as const, label: 'Company Name' },
                    { type: 'date' as const, label: 'Date' },
                    { type: 'text' as const, label: 'Custom Text' }
                  ].map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => startPlacingField(type)}
                      disabled={placingField}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg transition-colors border text-sm font-medium ${
                        selectedFieldType === type
                          ? 'bg-slate-100 text-slate-700 border-slate-300 border-2'
                          : `text-slate-700 hover:bg-slate-200 ${placingField ? 'opacity-50 cursor-not-allowed' : ''} border border-slate-200`
                      }`}
                    >
                      {getFieldIcon(type)}
                      {label}
                    </button>
                  ))}
                </div>
                
                {placingField && (
                  <div className="p-3 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 mt-4">
                    Click on the document to place the {selectedFieldType} field
                  </div>
                )}
              </div>
            )}

            {/* Field Instructions */}
            {selectedField && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
                  <Move size={16} className="text-slate-700" />
                  Selected Field
                </h3>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div><span className="font-medium">Type:</span> {selectedField.type}</div>
                  <div><span className="font-medium">Size:</span> {Math.round(selectedField.width)}×{Math.round(selectedField.height)}px</div>
                  <div><span className="font-medium">Page:</span> {selectedField.page}</div>
                </div>
                <div className="mt-4 p-3 bg-slate-50 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
                  <p><strong>Drag</strong> to move • <strong>Drag corner</strong> to resize</p>
                </div>
              </div>
            )}
          </div>

          {/* Document Viewer */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              {currentDocument && pdfDoc ? (
                <>
                  {/* Navigation */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          prevPage();
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          prevPage();
                        }}
                        disabled={currentPage === 1}
                        className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 active:bg-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors border border-slate-300 text-sm font-medium touch-manipulation"
                        style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                      >
                        <ChevronLeft size={16} />
                        Previous
                      </button>
                      <span className="text-sm font-semibold text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          nextPage();
                        }}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          nextPage();
                        }}
                        disabled={currentPage === totalPages}
                        className="flex items-center gap-2 px-4 py-2.5 text-slate-600 hover:text-slate-900 active:bg-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors border border-slate-300 text-sm font-medium touch-manipulation"
                        style={{ minHeight: '44px', WebkitTapHighlightColor: 'transparent' }}
                      >
                        Next
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {/* PDF Canvas */}
                  <div className="relative border rounded-xl overflow-hidden bg-gray-50 flex justify-center">
                    <div className="relative">
                      <canvas
                        ref={canvasRef}
                        className={`max-w-full ${placingField ? 'cursor-crosshair' : 'cursor-default'}`}
                        onClick={handleCanvasClick}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          handleCanvasClick(e);
                        }}
                        style={{ touchAction: placingField ? 'none' : 'auto' }}
                      />
                      
                      {/* Field Overlays - MORE OPAQUE */}
                      {currentPageFields.map((field) => (
                        <div
                          key={field.id}
                          className={`absolute border-2 ${
                            selectedField?.id === field.id 
                              ? 'border-solid border-purple-600 bg-purple-200' 
                              : 'border-dashed hover:border-solid'
                          } ${
                            field.type === 'signature' ? 'border-purple-500 bg-purple-100' :
                            'border-blue-500 bg-blue-100'
                          } rounded flex items-center justify-center group cursor-pointer opacity-90 hover:opacity-100`}
                          style={{
                            left: field.x,
                            top: field.y,
                            width: field.width,
                            height: field.height,
                          }}
                          onMouseDown={(e) => handleFieldMouseDown(e, field)}
                          onTouchStart={(e) => handleFieldMouseDown(e, field)}
                          onClick={() => handleFieldInteraction(field)}
                          onTouchEnd={(e) => {
                            e.preventDefault();
                            handleFieldInteraction(field);
                          }}
                        >
                          {field.signatureData ? (
                            <img
                              src={field.signatureData}
                              alt="Signature"
                              className="max-w-full max-h-full object-contain pointer-events-none"
                            />
                          ) : field.value ? (
                            <span className="text-sm font-medium text-gray-800 px-2 truncate pointer-events-none">
                              {field.value}
                            </span>
                          ) : (
                            <div className="text-center pointer-events-none">
                              <div className="text-xs font-medium text-gray-700">{field.label}</div>
                              <div className="text-xs text-gray-500">Click to fill</div>
                            </div>
                          )}
                          
                          {/* Resize handle - BIGGER AND MORE VISIBLE */}
                          <div
                            className="absolute bottom-0 right-0 w-4 h-4 bg-blue-600 cursor-se-resize opacity-70 group-hover:opacity-100 transition-opacity rounded-tl-lg"
                            onMouseDown={(e) => handleResizeMouseDown(e, field)}
                            onTouchStart={(e) => handleResizeMouseDown(e, field)}
                            style={{ background: 'linear-gradient(-45deg, transparent 30%, #2563eb 30%)' }}
                          />
                          
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeField(field.id);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-500">
                  <div className="text-center">
                    <FileText size={64} className="mx-auto mb-4 text-gray-300" />
                    <p>Upload a PDF document to start preparing it with company information</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Signature Modal */}
      <SignatureModal />
    </div>
  );
}