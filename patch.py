import os

path = 'frontend/src/pages/Subjects.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Imports
content = content.replace(
    '''  ChevronUp,
} from 'lucide-react';''',
    '''  ChevronUp,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';'''
)

# 2. State
content = content.replace(
    '''  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {''',
    '''  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {'''
)

# 3. Buttons
content = content.replace(
    '''        {isHOD && (
          <button
            onClick={() => {
              setEditingSubject(null);
              setShowModal(true);
            }}
            className="btn btn-primary"
          >
            <Plus className="w-5 h-5" />
            Add Subject
          </button>
        )}''',
    '''        {isHOD && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowImportModal(true)}
              className="btn btn-secondary"
            >
              <Upload className="w-4 h-4" />
              Import Staff
            </button>
            <button
              onClick={() => {
                setEditingSubject(null);
                setShowModal(true);
              }}
              className="btn btn-primary"
            >
              <Plus className="w-5 h-5" />
              Add Subject
            </button>
          </div>
        )}'''
)

# 4. Modal render
content = content.replace(
    '''        />
      )}
    </div>
  );
}''',
    '''        />
      )}

      {showImportModal && (
        <StaffImportModal onClose={() => setShowImportModal(false)} />
      )}
    </div>
  );
}'''
)

# 5. Component definition
staff_modal = """

// ── HOD Staff Import Modal ────────────────────────────────────────────────────
function StaffImportModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; assignments_added: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError('');
    try {
      const res = await staffApi.importExcel(file);
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import failed. Please check your file and try again.');
    } finally {
      setImporting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-pink-200 dark:border-pink-700 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-pink-100 dark:border-pink-800 bg-gradient-to-r from-pink-50 to-purple-50 dark:from-pink-900/20 dark:to-purple-900/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white">Import Staff from Excel</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Bulk-add faculty members via Excel upload</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!result ? (
            <>
              {/* File upload */}
              <div>
                <div
                  onClick={() => inputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                    file
                      ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-600'
                      : 'border-slate-300 dark:border-slate-600 hover:border-pink-300 dark:hover:border-pink-700 hover:bg-pink-50/50 dark:hover:bg-pink-900/10'
                  }`}
                >
                  <Upload className={`w-8 h-8 mx-auto mb-3 ${file ? 'text-pink-500' : 'text-slate-400'}`} />
                  {file ? (
                    <>
                      <p className="font-semibold text-pink-700 dark:text-pink-300">{file.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{(file.size / 1024).toFixed(1)} KB • Click to change</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-slate-600 dark:text-slate-300">Click to upload Excel file</p>
                      <p className="text-xs text-slate-400 mt-1">.xlsx or .xls format</p>
                    </>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                <button
                  onClick={handleImport}
                  disabled={!file || importing}
                  className="btn btn-primary flex-1 disabled:opacity-50"
                >
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import Staff</>}
                </button>
              </div>
            </>
          ) : (
            /* Result view */
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{result.created}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">New Staff Created</p>
                </div>
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{result.updated}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Existing Updated</p>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{result.assignments_added}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Subjects Assigned</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4" /> {result.errors.length} row(s) had issues:
                  </p>
                  <ul className="space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={i} className="text-xs text-amber-600 dark:text-amber-400">• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.errors.length === 0 && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                    Import completed successfully with no errors!
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-400 dark:text-slate-500">
                Default password for new staff: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">Welcome@123</code> (they should change it on first login)
              </p>

              <button onClick={onClose} className="btn btn-primary w-full">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
"""
content = content + staff_modal

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
