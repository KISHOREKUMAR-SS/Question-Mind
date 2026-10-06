import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../lib/store';
import { supportApi } from '../lib/api';
import toast from 'react-hot-toast';
import { 
  Send, 
  X, 
  Loader2, 
  MessageSquare, 
  CheckCircle2,
  Plus,
  FileText
} from 'lucide-react';

export default function Support() {
  const { user } = useAuthStore();
  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{ file: File; previewUrl?: string }[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Revoke object URLs on component unmount
  useEffect(() => {
    return () => {
      attachedFiles.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
    };
  }, [attachedFiles]);

  // Handle Ctrl+V Paste event
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      let pastedCount = 0;
      const newFiles: File[] = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const renamedFile = new File(
              [file], 
              `pasted_image_${Date.now()}_${pastedCount + 1}.png`, 
              { type: file.type }
            );
            newFiles.push(renamedFile);
            pastedCount++;
          }
        }
      }

      if (newFiles.length > 0) {
        addFiles(newFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const addFiles = (newFiles: File[]) => {
    const updated = newFiles.map(file => {
      let previewUrl = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      return { file, previewUrl };
    });
    setAttachedFiles(prev => [...prev, ...updated]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => {
      const fileToRemove = prev[index];
      if (fileToRemove.previewUrl) URL.revokeObjectURL(fileToRemove.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && attachedFiles.length === 0) return;

    setIsSending(true);
    try {
      const filesToSend = attachedFiles.map(item => item.file);
      await supportApi.submitQuery(inputText || "[Attachment only]", filesToSend);
      
      setShowSuccessModal(true);
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height on success
      }
      
      // Clear attachments
      attachedFiles.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      setAttachedFiles([]);
      
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to send support query.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full p-4 md:p-6 min-h-[calc(100vh-6rem)] flex items-center justify-center">
      
      {/* Pink Outlined Glow Box Container */}
      <div className="w-full flex flex-col bg-white dark:bg-slate-900 rounded-3xl border-2 border-pink-300 dark:border-pink-600 shadow-[0_0_40px_rgba(236,72,153,0.15)] dark:shadow-[0_0_40px_rgba(236,72,153,0.25)] overflow-hidden transition-all duration-500">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 p-4 md:p-5 text-white flex justify-between items-center z-10 shadow-md flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
              <MessageSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                Contact Question Mind
              </h2>
              <p className="text-xs text-pink-100 font-medium opacity-90">Send queries, share feedback, or report issues</p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <form onSubmit={handleSendMessage} className="flex flex-col w-full">
          
          <div className="w-full p-4 md:p-5 space-y-5 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
            
            {/* Welcome Message Bubble */}
            <div className="flex gap-4 items-start animate-in fade-in duration-300">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 text-white flex items-center justify-center shadow-md flex-shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-3xl p-4 md:p-5 shadow-sm max-w-3xl space-y-2 relative">
                <div className="absolute top-4 -left-2 w-4 h-4 bg-white dark:bg-slate-800 border-l border-b border-slate-100 dark:border-slate-700 rotate-45" />
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <span>Contact Question Mind</span>
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  Hi <strong>{user?.name || 'User'}</strong>! Welcome to Question Mind Support. How can we help you today? You can share feedback, ask questions, or report issues here.
                </p>
                <div className="pt-1 text-xs text-slate-400 dark:text-slate-500 font-medium">
                  💡 Tip: You can copy & paste screenshots (Ctrl+V) directly into this page!
                </div>
              </div>
            </div>

            {/* Large Textarea for typing query */}
            <div className="w-full flex flex-col pt-1 animate-in slide-in-from-bottom-4 duration-300">
              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">
                Your Query / Message
              </label>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (textareaRef.current) {
                    textareaRef.current.style.height = 'auto';
                    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
                  }
                }}
                placeholder="Type your message, query, or report here... Use Ctrl+V to paste screenshots"
                className="input resize-none overflow-hidden min-h-[150px] w-full bg-white dark:bg-slate-950/50 p-5 text-sm md:text-base leading-relaxed focus:outline-none transition-all shadow-inner border border-pink-100 dark:border-pink-900/40 rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    handleSendMessage(e);
                  }
                }}
              />
            </div>
            
          </div>

          {/* Bottom Area: Attachments & Actions (Files Only) */}
          <div className="bg-white dark:bg-slate-900 border-t border-pink-100 dark:border-pink-900/40 p-4 md:p-6 z-10 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
            
            {/* Attachments Section */}
            <div className="flex items-center gap-3 flex-1 overflow-x-auto py-2 px-1 md:py-0">
              <input
                type="file"
                multiple
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              />
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-14 h-14 flex-shrink-0 bg-slate-100 dark:bg-slate-800 hover:bg-pink-50 dark:hover:bg-purple-950/40 hover:text-pink-500 text-slate-600 dark:text-slate-300 rounded-2xl flex items-center justify-center transition-colors border border-slate-200/40 dark:border-slate-800 shadow-sm"
                title="Add files"
              >
                <Plus className="w-6 h-6" />
              </button>

              {/* Paste/Upload Previews */}
              <div className="flex items-center gap-3 overflow-x-auto py-2 pr-2">
                {attachedFiles.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="relative w-16 h-16 bg-slate-100 dark:bg-slate-800 border-2 border-pink-200 dark:border-purple-800 rounded-2xl flex-shrink-0 flex items-center justify-center shadow-sm animate-in zoom-in-95 duration-150"
                  >
                    {item.previewUrl ? (
                      <img 
                        src={item.previewUrl} 
                        alt="preview" 
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-1">
                        <FileText className="w-5 h-5 text-pink-500" />
                        <span className="text-[8px] font-black text-slate-500 dark:text-slate-400 truncate max-w-[48px] uppercase mt-0.5">
                          {item.file.name.split('.').pop()}
                        </span>
                      </div>
                    )}

                    {/* File Name Pill */}
                    <span className="absolute -bottom-2 left-1 right-1 bg-gradient-to-r from-pink-500 to-purple-600 text-[8px] text-white px-1.5 py-0.5 rounded-full truncate text-center font-bold shadow-sm z-10">
                      {item.file.name}
                    </span>

                    {/* Delete Button */}
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-rose-600 transition-colors z-20"
                      title="Remove attachment"
                    >
                      <X className="w-3.5 h-3.5" strokeWidth={3.5} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={isSending || (!inputText.trim() && attachedFiles.length === 0)}
              className="h-14 px-8 flex-shrink-0 bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 hover:opacity-90 active:scale-95 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-pink-500/20 disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  <span>Send Mail</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Success Modal Overlay */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-8 text-center border-2 border-pink-100 dark:border-purple-900 shadow-2xl transform transition-all scale-100 opacity-100 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-md shadow-pink-500/20">
              <CheckCircle2 className="w-9 h-9 text-white animate-bounce" />
            </div>
            
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
              Mail Sent Successfully
            </h3>
            
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              Your support ticket has been dispatched! We have received your query, name, and registered email address. Our support team will review your notes and reach back out to you.
            </p>

            <button
              onClick={() => setShowSuccessModal(false)}
              className="w-full py-3 bg-gradient-to-r from-pink-500 via-purple-500 to-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-pink-500/20 hover:opacity-95 active:scale-[0.98] transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
