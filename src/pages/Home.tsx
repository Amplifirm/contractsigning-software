import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Pen,  X, Check, RotateCcw, ChevronLeft, ChevronRight,  Send, Calendar, User, Building, Type, Link, Eye} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Supabase Configuration
const SUPABASE_URL = 'https://gaxzaskncmqbtpimzypw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheHphc2tuY21xYnRwaW16eXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3OTI2MjYsImV4cCI6MjA2ODM2ODYyNn0.D2tLT4edbdVT7Sdu_4gpS8sa-tsdFsXBmJPbGlUp0Yk';

// Debug logging
console.log('API Key length:', SUPABASE_ANON_KEY.length);
console.log('API Key starts with:', SUPABASE_ANON_KEY.substring(0, 20));
console.log('Is API key configured?', SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdheHphc2tuY21xYnRwaW16eXB3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI3OTI2MjYsImV4cCI6MjA2ODM2ODYyNn0.D2tLT4edbdVT7Sdu_4gpS8sa-tsdFsXBmJPbGlUp0Yk');

// Simple Supabase client using standard fetch
class SupabaseClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(url: string, key: string) {
    this.baseUrl = url;
    this.apiKey = key;
  }

  private async request(method: string, path: string, body?: any) {
    const response = await fetch(`${this.baseUrl}/rest/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        'Authorization': `Bearer ${this.apiKey}`,
        'Prefer': method === 'POST' ? 'return=representation' : method === 'PATCH' ? 'return=minimal' : ''
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      throw new Error(`Supabase error: ${response.status} ${response.statusText}`);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text) return null;
    
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  async upsert(table: string, data: any) {
    const response = await fetch(`${this.baseUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        'Authorization': `Bearer ${this.apiKey}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`Upsert error: ${response.status} ${response.statusText}`);
    }

    return { success: true };
  }

  async select(table: string, query: string = '*') {
    return this.request('GET', `/${table}?select=${query}`);
  }

  async insert(table: string, data: any) {
    return this.request('POST', `/${table}`, data);
  }

  async update(table: string, data: any, filter: string) {
    return this.request('PATCH', `/${table}?${filter}`, data);
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

// Only create client if API key is configured
const isApiKeyConfigured = SUPABASE_ANON_KEY.length > 50 && SUPABASE_ANON_KEY.startsWith('eyJ');
console.log('Creating Supabase client...', { 
  isApiKeyConfigured, 
  hasApiKey: !!SUPABASE_ANON_KEY,
  keyLength: SUPABASE_ANON_KEY.length,
  startsCorrectly: SUPABASE_ANON_KEY.startsWith('eyJ')
});

const supabase = isApiKeyConfigured 
  ? new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

console.log('Supabase client created:', !!supabase);

interface DocumentField {
  id: string;
  type: 'signature' | 'text' | 'date' | 'name' | 'company';
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
  label: string;
  required: boolean;
  value?: string;
  signatureData?: string;
}

interface Document {
  id: string;
  name: string;
  fields: DocumentField[];
  status: 'draft' | 'sent' | 'completed';
  clientLink?: string;
  pdfUrl?: string;
  signedPdfUrl?: string;
  created_at?: string;
  updated_at?: string;
}

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (signature: string) => void;
}

interface TextInputModalProps {
  isOpen: boolean;
  field: DocumentField | null;
  onClose: () => void;
  onSave: (value: string) => void;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ isOpen, onClose, onSave }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  
  // Define cursive fonts FIRST
  const cursiveFonts = [
    { name: 'Dancing Script', value: '"Dancing Script", cursive' },
    { name: 'Great Vibes', value: '"Great Vibes", cursive' },
    { name: 'Allura', value: '"Allura", cursive' },
    { name: 'Alex Brush', value: '"Alex Brush", cursive' },
    { name: 'Satisfy', value: '"Satisfy", cursive' },
    { name: 'Pacifico', value: '"Pacifico", cursive' }
  ];
  
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
    let signatureData = '';

    if (mode === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawn) return;
      signatureData = canvas.toDataURL('image/png');
    } else {
      if (!text.trim()) return;
      signatureData = createTypedSignature(text, selectedFont.value);
    }

    onSave(signatureData);
    setText('');
    clearCanvas();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-[600px] shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-800">Create Your Signature</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
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
                    onClose();
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onClose();
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
                  Save Signature
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
                onClick={onClose}
                className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
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

const TextInputModal: React.FC<TextInputModalProps> = ({ isOpen, field, onClose, onSave }) => {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (field?.value) {
      setValue(field.value);
    } else {
      setValue('');
    }
  }, [field]);

  const handleSave = () => {
    onSave(value);
    setValue('');
  };

  if (!isOpen || !field) return null;

  const getPlaceholder = () => {
    switch (field.type) {
      case 'name': return 'Enter your full name';
      case 'company': return 'Enter your company name';
      case 'date': return 'MM/DD/YYYY';
      case 'text': return 'Enter text';
      default: return 'Enter value';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-96 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-gray-800">{field.label}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        
        <div className="mb-6">
          {field.type === 'date' ? (
            <input
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={getPlaceholder()}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
        </div>
        
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            <Check size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default function AmplifirmDocumentPlatform() {
  const navigate = useNavigate();
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');
  
  // App state
  const [mode, setMode] = useState<'admin' | 'client'>('admin');
  const [loading, setLoading] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Document state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  console.log(documents);
  
  // PDF rendering
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageScale] = useState(1.5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Field placement and manipulation
  const [selectedFieldType, setSelectedFieldType] = useState<DocumentField['type'] | null>(null);
  const [placingField, setPlacingField] = useState(false);
  const [selectedField, setSelectedField] = useState<DocumentField | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [fieldSettings, setFieldSettings] = useState({
    fontSize: 12,
    signatureSize: { width: 200, height: 60 },
    textSize: { width: 200, height: 40 }
  });
  
  // Modals
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showTextModal, setShowTextModal] = useState(false);
  const [activeField, setActiveField] = useState<DocumentField | null>(null);

  // Debounce utility function
  function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Authentication
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginForm.username === 'a' && loginForm.password === 'a') {
      setIsAuthenticated(true);
      setLoginError('');
      setLoginForm({ username: '', password: '' });
    } else {
      setLoginError('Invalid credentials. Please try again.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentDocument(null);
    setMode('admin');
  };

  // Test Supabase connection
  

  // Save document to Supabase
  const saveDocumentToDatabase = async (doc: Document, skipLocalUpdate = false) => {
    if (!supabase) {
      console.log('Supabase not configured, working in local mode');
      if (!skipLocalUpdate) {
        setDocuments(prev => [...prev.filter(d => d.id !== doc.id), doc]);
      }
      return;
    }

    try {
      console.log('Saving document to Supabase:', doc.id);
      
      const docData = {
        id: doc.id,
        name: doc.name,
        status: doc.status,
        fields: JSON.stringify(doc.fields),
        pdf_url: doc.pdfUrl || null,
        signed_pdf_url: doc.signedPdfUrl || null,
        client_link: doc.clientLink || null,
        updated_at: new Date().toISOString()
      };

      console.log('Document data to save:', docData);
      
      // Use upsert for reliable save
      await supabase.upsert('documents', docData);
      console.log('Document saved successfully with upsert');
      
      if (!skipLocalUpdate) {
        setDocuments(prev => [...prev.filter(d => d.id !== doc.id), doc]);
      }
    } catch (err) {
      console.error('Error saving document:', err);
      // Still update local state
      if (!skipLocalUpdate) {
        setDocuments(prev => [...prev.filter(d => d.id !== doc.id), doc]);
      }
    }
  };

  // Auto-save function with debouncing
  const autoSaveDocument = useCallback(
    debounce(async (doc: Document) => {
      if (doc) {
        console.log('Auto-saving document changes...');
        setAutoSaving(true);
        try {
          await saveDocumentToDatabase(doc, true);
          setLastSaved(new Date());
          console.log('Auto-save completed');
        } catch (err) {
          console.error('Auto-save failed:', err);
        } finally {
          setAutoSaving(false);
        }
      }
    }, 2000),
    []
  );

  // Load document from Supabase
  const loadDocumentFromDatabase = async (docId: string) => {
    if (!supabase) {
      console.log('Supabase not configured, cannot load document from database');
      return null;
    }

    try {
      setLoading(true);
      console.log('Loading document from Supabase:', docId);
      
      const docs = await supabase.select('documents', '*');
      console.log('Documents from database:', docs);
      
      const doc = docs.find((d: any) => d.id === docId);
      
      if (doc) {
        console.log('Found document:', doc);
        const loadedDoc: Document = {
          id: doc.id,
          name: doc.name,
          status: doc.status,
          fields: JSON.parse(doc.fields || '[]'),
          pdfUrl: doc.pdf_url,
          signedPdfUrl: doc.signed_pdf_url,
          clientLink: doc.client_link
        };
        
        setCurrentDocument(loadedDoc);
        
        // Load PDF from URL
        if (doc.pdf_url) {
          const response = await fetch(doc.pdf_url);
          const arrayBuffer = await response.arrayBuffer();
          
          // @ts-ignore
          const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
          const pdf = await loadingTask.promise;
          
          setPdfDoc(pdf);
          setTotalPages(pdf.numPages);
          setCurrentPage(1);
        }
        
        return loadedDoc;
      } else {
        console.log('Document not found in database');
      }
    } catch (err) {
      console.error('Error loading document:', err);
      setError('Failed to load document from database.');
    } finally {
      setLoading(false);
    }
    return null;
  };

  // Client Functions
  const loadClientDocument = async (docId: string) => {
    const doc = await loadDocumentFromDatabase(docId);
    if (doc) {
      setMode('client');
    }
  };

  // Load PDF.js and PDF-lib
  useEffect(() => {
    // Load Google Fonts for cursive signatures
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;600&family=Great+Vibes&family=Allura&family=Alex+Brush&family=Satisfy&family=Pacifico&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);

    // Load PDF.js
    const pdfScript = document.createElement('script');
    pdfScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    pdfScript.onload = () => {
      // @ts-ignore
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    };
    document.head.appendChild(pdfScript);

    // Load PDF-lib for PDF manipulation
    const pdfLibScript = document.createElement('script');
    pdfLibScript.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    document.head.appendChild(pdfLibScript);

    return () => {
      document.head.removeChild(pdfScript);
      document.head.removeChild(pdfLibScript);
      document.head.removeChild(link);
    };
  }, []);

  // Check for client mode in URL on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const docId = urlParams.get('doc');
    const urlMode = urlParams.get('mode');
    
    if (docId && urlMode === 'client') {
      setMode('client');
      setIsAuthenticated(true); // Auto-authenticate for client mode
      loadClientDocument(docId);
    }
  }, []);

  useEffect(() => {
    // Test Supabase connection on mount if configured
    console.log('useEffect running - checking Supabase client...');
    console.log('supabase exists:', !!supabase);
    console.log('SUPABASE_URL:', SUPABASE_URL);
    console.log('API key first 10 chars:', SUPABASE_ANON_KEY.substring(0, 10));
    
    if (supabase) {
      console.log('✅ Supabase client initialized successfully');
    } else {
      console.log('❌ Supabase client not initialized - working in local mode');
    }
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

  // Generate PDF with embedded signatures and form data
  const generateSignedPDF = async (doc: Document): Promise<Uint8Array> => {
    try {
      // @ts-ignore
      const { PDFDocument, rgb } = window.PDFLib;
      
      let pdfBytes: Uint8Array;
      
      if (doc.pdfUrl) {
        // Load the original PDF from URL
        const response = await fetch(doc.pdfUrl);
        pdfBytes = new Uint8Array(await response.arrayBuffer());
      } else if (pdfFile) {
        // Use the local file
        pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
      } else {
        throw new Error('No PDF source available');
      }

      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();

      // Process each field
      for (const field of doc.fields) {
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
            // Convert data URL to image bytes
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
          // Add text field - position text in center of field
          const fontSize = Math.min(fieldSettings.fontSize, scaledHeight * 0.8);
          page.drawText(field.value, {
            x: pdfX + 5, // Small padding from left
            y: pdfY + (scaledHeight / 2) - (fontSize / 2), // Center vertically
            size: fontSize,
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
      console.log('Generating signed PDF...');
      
      // Generate PDF with embedded signatures
      const signedPdfBytes = await generateSignedPDF(currentDocument);
      
      // Upload the signed PDF to Supabase storage
      let signedPdfUrl = '';
      if (supabase) {
        try {
          const signedFileName = `signed_${Date.now()}_${currentDocument.name}`;
          const signedFile = new File([signedPdfBytes as BlobPart], signedFileName, { type: 'application/pdf' });
          
          await supabase.uploadFile('documents', signedFileName, signedFile);
          signedPdfUrl = supabase.getPublicUrl('documents', signedFileName);
          console.log('Signed PDF uploaded to:', signedPdfUrl);
        } catch (uploadErr) {
          console.error('Failed to upload signed PDF:', uploadErr);
        }
      }
      
      // Mark document as completed and save
      const completedDoc = {
        ...currentDocument,
        status: 'completed' as const,
        signedPdfUrl
      };
      
      await saveDocumentToDatabase(completedDoc);
      setCurrentDocument(completedDoc);
      
      // Download the PDF
      const blob = new Blob([signedPdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `signed_${currentDocument.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setError('✅ Document signed and downloaded successfully!');
      
    } catch (err) {
      console.error('Error downloading document:', err);
      setError('Failed to generate signed PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Admin Functions
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      try {
        setLoading(true);
        setPdfFile(file);

        // Upload PDF to Supabase Storage
        const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        if (supabase) {
          try {
            await supabase.uploadFile('documents', fileName, file);
            const pdfUrl = supabase.getPublicUrl('documents', fileName);
            
            const arrayBuffer = await file.arrayBuffer();
            
            // @ts-ignore
            const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
            const pdf = await loadingTask.promise;
            
            setPdfDoc(pdf);
            setTotalPages(pdf.numPages);
            setCurrentPage(1);
            
            // Create new document
            const newDoc: Document = {
              id: Date.now().toString(),
              name: file.name,
              fields: [],
              status: 'draft',
              pdfUrl
            };
            
            setCurrentDocument(newDoc);
            return; // Success, exit early
          } catch (uploadError) {
            console.error('Upload failed, using local mode:', uploadError);
            setError('Upload failed, working in local mode. Check your API key and bucket setup.');
          }
        }
        
        // Fallback: work with local file
        const arrayBuffer = await file.arrayBuffer();
        
        // @ts-ignore
        const loadingTask = window.pdfjsLib.getDocument(arrayBuffer);
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        
        // Create new document without PDF URL
        const newDoc: Document = {
          id: Date.now().toString(),
          name: file.name,
          fields: [],
          status: 'draft'
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

  const startPlacingField = (fieldType: DocumentField['type']) => {
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
      signature: 'Signature',
      name: 'Full Name',
      company: 'Company Name',
      date: 'Date',
      text: 'Text Field'
    };
    
    const fieldSizes = {
      signature: fieldSettings.signatureSize,
      name: fieldSettings.textSize,
      company: fieldSettings.textSize,
      date: { width: 150, height: fieldSettings.textSize.height },
      text: fieldSettings.textSize
    };
    
    const newField: DocumentField = {
      id: Date.now().toString(),
      type: selectedFieldType,
      x,
      y,
      width: fieldSizes[selectedFieldType].width,
      height: fieldSizes[selectedFieldType].height,
      page: currentPage,
      label: fieldLabels[selectedFieldType],
      required: true,
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

  // Field manipulation
  const handleFieldMouseDown = (e: React.MouseEvent | React.TouchEvent, field: DocumentField) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedField(field);
    const coords = getPointerCoordinates(e);
    if (coords) {
      setDragStart({ x: coords.x - field.x, y: coords.y - field.y });
      setDragging(true);
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
  };

  const handleMouseUp = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e) e.preventDefault();
    // Auto-save if fields were moved in admin mode
    if ((dragging || resizing) && currentDocument && selectedField) {
      autoSaveDocument(currentDocument);
    }
    
    setDragging(false);
    setResizing(false);
  };

  

  const generateClientLink = async () => {
    if (!currentDocument) return;
    
    try {
      setLoading(true);
      console.log('Generating client link for document:', currentDocument.id);
      
      const clientLink = `${window.location.origin}${window.location.pathname}?doc=${currentDocument.id}&mode=client`;
      const updatedDoc = {
        ...currentDocument,
        status: 'sent' as const,
        clientLink
      };
      
      console.log('Updated document with client link:', updatedDoc);
      await saveDocumentToDatabase(updatedDoc);
      setCurrentDocument(updatedDoc);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(clientLink);
      console.log('Client link copied to clipboard:', clientLink);
      
      // Clear any previous errors
      setError('');
    } catch (err) {
      console.error('Error generating client link:', err);
      setError('Failed to generate client link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFieldInteraction = (field: DocumentField) => {
    setActiveField(field);
    if (field.type === 'signature') {
      setShowSignatureModal(true);
    } else {
      setShowTextModal(true);
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

  const saveFieldValue = async (value: string) => {
    if (!activeField || !currentDocument) return;
    
    // For text fields (not signatures), measure the text and adjust field size
    // Keep the original position (x, y) - the field will grow from top-left
    let updatedField = { ...activeField };
    
    if (activeField.type !== 'signature' && value) {
      const textDimensions = measureTextDimensions(value, fieldSettings.fontSize);
      // Keep the same x, y position - only update width and height
      updatedField = {
        ...updatedField,
        width: textDimensions.width,
        height: textDimensions.height
      };
    }
    
    const updatedFields = currentDocument.fields.map(field =>
      field.id === activeField.id
        ? { 
            ...updatedField, 
            value, 
            signatureData: activeField.type === 'signature' ? value : undefined 
          }
        : field
    );
    
    const updatedDoc = {
      ...currentDocument,
      fields: updatedFields
    };
    
    setCurrentDocument(updatedDoc);
    
    // Auto-save to database
    autoSaveDocument(updatedDoc);
    
    setShowSignatureModal(false);
    setShowTextModal(false);
    setActiveField(null);
  };

  const removeField = (fieldId: string) => {
    if (!currentDocument) return;
    
    setCurrentDocument({
      ...currentDocument,
      fields: currentDocument.fields.filter(f => f.id !== fieldId)
    });
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
  const allRequiredFieldsCompleted = currentDocument?.fields.every(field => 
    !field.required || (field.type === 'signature' ? field.signatureData : field.value)
  ) || false;

  const getFieldIcon = (type: DocumentField['type']) => {
    switch (type) {
      case 'signature': return <Pen size={16} />;
      case 'name': return <User size={16} />;
      case 'company': return <Building size={16} />;
      case 'date': return <Calendar size={16} />;
      case 'text': return <Type size={16} />;
    }
  };

  // Login Screen
  if (!isAuthenticated && mode === 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-10 w-full max-w-md">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <FileText size={36} className="text-white" />
            </div>
            <h1 className="text-3xl font-semibold text-slate-900 mb-2 tracking-tight">Amplifirm</h1>
            <p className="text-slate-600 text-sm font-medium">Contract Management Platform</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all"
                placeholder="Enter username"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 bg-white text-slate-900 placeholder-slate-400 transition-all"
                placeholder="Enter password"
                required
              />
            </div>
            
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
                {loginError}
              </div>
            )}
            
            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-3.5 rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-all font-semibold shadow-md hover:shadow-lg"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-slate-900 mb-2 tracking-tight">
                {mode === 'admin' ? 'Document Center' : 'Document Signing'}
              </h1>
              <p className="text-slate-600 text-sm font-medium">
                {mode === 'admin' 
                  ? 'Manage contracts and e-signatures' 
                  : 'Review and sign the document below'
                }
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {autoSaving && (
                <div className="bg-amber-50 text-amber-700 px-3 py-2 rounded-lg text-xs font-medium border border-amber-200">
                  Auto-saving...
                </div>
              )}
              
              {lastSaved && !autoSaving && mode === 'client' && (
                <div className="bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg text-xs font-medium border border-emerald-200">
                  Saved {lastSaved.toLocaleTimeString()}
                </div>
              )}
              
              {mode === 'admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate('/internal-signing')}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300 text-sm font-medium"
                  >
                    <Building size={16} />
                    Internal Prep
                  </button>
                  <button
                    onClick={() => setMode('client')}
                    className="flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300 text-sm font-medium"
                  >
                    <Eye size={16} />
                    Preview
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
                  >
                    <X size={16} />
                    Logout
                  </button>
                </div>
              )}
              
              {mode === 'client' && (
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-medium mb-1">Status</div>
                  <div className="text-base font-semibold text-slate-900">
                    {currentDocument?.status === 'completed' 
                      ? 'Completed' 
                      : allRequiredFieldsCompleted 
                        ? 'Ready to Submit' 
                        : 'Pending'
                    }
                  </div>
                  {currentDocument?.signedPdfUrl && (
                    <a
                      href={currentDocument.signedPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-700 hover:text-emerald-900 underline font-medium mt-1 inline-block"
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Admin Interface */}
        {mode === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
                  <FileText size={18} className="text-slate-700" />
                  Tools
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
                    <p className="text-xs text-gray-500 mt-3">
                      Upload a PDF to start creating your document workflow
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <FileText size={16} className="text-slate-600" />
                      <span className="truncate font-medium text-slate-900 text-sm">{currentDocument.name}</span>
                    </div>
                    
                    <div>
                      <h3 className="font-semibold text-slate-900 mb-3 text-sm">Add Fields</h3>
                      <div className="space-y-1.5">
                        {[
                          { type: 'signature' as const, label: 'Signature', bg: 'bg-slate-100', hover: 'hover:bg-slate-200', border: 'border-slate-300', text: 'text-slate-700' },
                          { type: 'name' as const, label: 'Full Name', bg: 'bg-slate-100', hover: 'hover:bg-slate-200', border: 'border-slate-300', text: 'text-slate-700' },
                          { type: 'company' as const, label: 'Company', bg: 'bg-slate-100', hover: 'hover:bg-slate-200', border: 'border-slate-300', text: 'text-slate-700' },
                          { type: 'date' as const, label: 'Date', bg: 'bg-slate-100', hover: 'hover:bg-slate-200', border: 'border-slate-300', text: 'text-slate-700' },
                          { type: 'text' as const, label: 'Text Field', bg: 'bg-slate-100', hover: 'hover:bg-slate-200', border: 'border-slate-300', text: 'text-slate-700' }
                        ].map(({ type, label, bg, hover, border, text }) => (
                          <button
                            key={type}
                            onClick={() => startPlacingField(type)}
                            disabled={placingField}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg transition-colors border text-sm font-medium ${
                              selectedFieldType === type
                                ? `${bg} ${text} ${border} border-2`
                                : `${text} ${hover} ${placingField ? 'opacity-50 cursor-not-allowed' : ''} border border-slate-200`
                            }`}
                          >
                            {getFieldIcon(type)}
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {placingField && (
                      <div className="p-3 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium border border-slate-200">
                        Click on the document to place the {selectedFieldType} field
                      </div>
                    )}
                    
                    {selectedField && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <h4 className="font-semibold text-slate-900 mb-2 text-sm">Field Properties</h4>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          <div><span className="font-medium">Type:</span> {selectedField.type}</div>
                          <div><span className="font-medium">Size:</span> {Math.round(selectedField.width)}×{Math.round(selectedField.height)}px</div>
                          <div><span className="font-medium">Page:</span> {selectedField.page}</div>
                        </div>
                      </div>
                    )}
                    
                    {/* Field Settings */}
                    <div className="pt-6 border-t border-slate-200">
                      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
                        <Type size={16} className="text-slate-700" />
                        Settings
                      </h3>
                      <div className="space-y-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Font Size</label>
                          <input
                            type="range"
                            min="8"
                            max="24"
                            value={fieldSettings.fontSize}
                            onChange={(e) => setFieldSettings({
                              ...fieldSettings,
                              fontSize: parseInt(e.target.value)
                            })}
                            className="w-full accent-purple-600"
                          />
                          <div className="text-sm text-gray-600 mt-1">{fieldSettings.fontSize}px</div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Signature Size</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Width"
                              value={fieldSettings.signatureSize.width}
                              onChange={(e) => setFieldSettings({
                                ...fieldSettings,
                                signatureSize: {
                                  ...fieldSettings.signatureSize,
                                  width: parseInt(e.target.value) || 200
                                }
                              })}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <input
                              type="number"
                              placeholder="Height"
                              value={fieldSettings.signatureSize.height}
                              onChange={(e) => setFieldSettings({
                                ...fieldSettings,
                                signatureSize: {
                                  ...fieldSettings.signatureSize,
                                  height: parseInt(e.target.value) || 60
                                }
                              })}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                        
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Text Field Size</label>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              placeholder="Width"
                              value={fieldSettings.textSize.width}
                              onChange={(e) => setFieldSettings({
                                ...fieldSettings,
                                textSize: {
                                  ...fieldSettings.textSize,
                                  width: parseInt(e.target.value) || 200
                                }
                              })}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <input
                              type="number"
                              placeholder="Height"
                              value={fieldSettings.textSize.height}
                              onChange={(e) => setFieldSettings({
                                ...fieldSettings,
                                textSize: {
                                  ...fieldSettings.textSize,
                                  height: parseInt(e.target.value) || 40
                                }
                              })}
                              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {currentDocument.fields.length > 0 && (
                      <div className="pt-4 border-t">
                        <button
                          onClick={generateClientLink}
                          disabled={loading}
                          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400"
                        >
                          <Link size={16} />
                          Generate Client Link
                        </button>
                        
                        {!supabase && (
                          <div className="mt-2 p-2 bg-yellow-50 text-yellow-700 rounded text-xs">
                            Working in local mode - links won't persist without Supabase
                          </div>
                        )}
                        
                        {currentDocument.clientLink && (
                          <div className="mt-3 p-3 bg-green-50 rounded-lg">
                            <div className="text-xs text-green-700 mb-1">Client Link (Copied!)</div>
                            <div className="text-xs text-green-600 break-all">
                              {currentDocument.clientLink}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Document Viewer */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
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
                    <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-slate-100 flex justify-center shadow-inner">
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
                        
                        {/* Field Overlays */}
                        {currentPageFields.map((field) => (
                          <div
                            key={field.id}
                            className={`absolute border ${
                              selectedField?.id === field.id 
                                ? 'border-2 border-slate-700 bg-slate-100' 
                                : 'border-dashed border-slate-400 hover:border-slate-600'
                            } bg-slate-50/90 rounded flex items-center justify-center group cursor-move transition-all`}
                            style={{
                              left: field.x,
                              top: field.y,
                              width: field.width,
                              height: field.height,
                            }}
                            onMouseDown={(e) => handleFieldMouseDown(e, field)}
                            onTouchStart={(e) => handleFieldMouseDown(e, field)}
                          >
                            <div className="text-center pointer-events-none px-2">
                              <div className="text-xs font-semibold text-slate-700">{field.label}</div>
                              <div className="text-xs text-slate-500">{field.required ? 'Required' : 'Optional'}</div>
                            </div>
                            
                            {/* Resize handle */}
                            <div
                              className="absolute bottom-0 right-0 w-3 h-3 bg-slate-700 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity rounded-tl-lg"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setResizing(true);
                                setSelectedField(field);
                              }}
                            />
                            
                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeField(field.id);
                              }}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-md"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-96 text-slate-500">
                    <div className="text-center">
                      <FileText size={64} className="mx-auto mb-4 text-slate-300" />
                      <p className="text-slate-600 font-medium">Upload a PDF document to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Client Interface */}
        {mode === 'client' && currentDocument && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Document Info */}
            <div className="bg-slate-50 p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900 mb-1">{currentDocument.name}</h2>
                  <p className="text-slate-600 text-sm font-medium">Complete all required fields and sign where indicated</p>
                </div>
                
                <div className="flex items-center gap-4">
                  {allRequiredFieldsCompleted && currentDocument?.status !== 'completed' && (
                    <button 
                      onClick={downloadSignedDocument}
                      disabled={loading}
                      className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg font-semibold text-sm"
                    >
                      <Send size={18} />
                      Submit Document
                    </button>
                  )}
                  
                  {currentDocument?.status === 'completed' && (
                    <div className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 font-semibold text-sm">
                      <Check size={18} />
                      Completed
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6">
              {/* Progress */}
              <div className="mb-6">
                <div className="flex justify-between text-xs text-slate-600 mb-2 font-medium">
                  <span>Completion Progress</span>
                  <span>
                    {currentDocument.fields.filter(f => f.value || f.signatureData).length} of {currentDocument.fields.length} fields
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div 
                    className="bg-slate-900 h-2 rounded-full transition-all duration-500"
                    style={{
                      width: `${(currentDocument.fields.filter(f => f.value || f.signatureData).length / currentDocument.fields.length) * 100}%`
                    }}
                  />
                </div>
              </div>

              {/* Navigation */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mb-6">
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
              <div className="relative border border-slate-300 rounded-lg overflow-hidden bg-slate-100 flex justify-center shadow-inner">
                <div className="relative">
                  <canvas ref={canvasRef} className="max-w-full" />
                  
                  {/* Interactive Fields */}
                  {currentPageFields.map((field) => (
                    <div
                      key={field.id}
                      className={`absolute rounded-lg flex items-center justify-center cursor-pointer transition-all border ${
                        field.value || field.signatureData
                          ? 'bg-emerald-50 border-emerald-500 shadow-md'
                          : 'bg-slate-100 border-slate-400 hover:bg-slate-200 hover:border-slate-600 shadow-sm hover:shadow-md'
                      }`}
                      style={{
                        left: field.x,
                        top: field.y,
                        width: field.width,
                        height: field.height,
                      }}
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
                          className="max-w-full max-h-full object-contain"
                        />
                      ) : field.value ? (
                        <span className="text-sm font-medium text-slate-900 px-2 truncate">
                          {field.value}
                        </span>
                      ) : (
                        <div className="text-center px-2">
                          <div className="text-sm font-medium text-slate-700 mb-1">
                            {getFieldIcon(field.type)}
                          </div>
                          <div className="text-xs text-slate-600 font-medium">
                            Click to {field.type === 'signature' ? 'sign' : 'fill'}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Powered by */}
              <div className="text-center mt-6 pt-4 border-t border-slate-200">
                <p className="text-xs text-slate-500 font-medium">
                  Powered by <span className="font-semibold text-slate-700">Amplifirm</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Back to Admin Button (Client Mode) - Only show in preview mode */}
        {mode === 'client' && !window.location.search.includes('mode=client') && (
          <div className="text-center mt-6">
            <button
              onClick={() => setMode('admin')}
              className="text-blue-600 hover:text-blue-800 transition-colors"
            >
              ← Back to Admin View
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      <SignatureModal
        isOpen={showSignatureModal}
        onClose={() => setShowSignatureModal(false)}
        onSave={saveFieldValue}
      />
      
      <TextInputModal
        isOpen={showTextModal}
        field={activeField}
        onClose={() => setShowTextModal(false)}
        onSave={saveFieldValue}
      />
    </div>
  );
}