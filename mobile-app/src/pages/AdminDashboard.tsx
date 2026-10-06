import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, Edit, RefreshCw, KeyRound, AlertCircle, Check, Upload, Loader2, Trash2, Plus, X, Download } from 'lucide-react';
import api, { authApi } from '../lib/api';
import { Combobox } from '../components/Combobox';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  department?: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [userSearch, setUserSearch] = useState('');
  
  // Password Reset Success Modal State
  const [showResetSuccessPopup, setShowResetSuccessPopup] = useState(false);
  const [successResetUser, setSuccessResetUser] = useState<User | null>(null);
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resetError, setResetError] = useState('');
  
  // Confirmation state for deleting users
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDangerous?: boolean;
    confirmText?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('FACULTY');
  const [editDepartment, setEditDepartment] = useState('');
  
  // Create form state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState('FACULTY');
  const [addDepartment, setAddDepartment] = useState('');
  const [creating, setCreating] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to load users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditDepartment(user.department || '');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await authApi.createUser({
        name: addName,
        email: addEmail,
        password: addPassword,
        role: addRole,
        department: addDepartment || undefined,
      });
      toast.success('User created successfully and welcome email sent.');
      setIsAddingUser(false);
      // Reset fields
      setAddName('');
      setAddEmail('');
      setAddPassword('');
      setAddRole('FACULTY');
      setAddDepartment('');
      loadUsers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await api.put(`/auth/users/${editingUser.id}`, {
        name: editName,
        email: editEmail,
        role: editRole,
        department: editDepartment
      });
      toast.success('User updated successfully');
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to delete user "${userName}"? This cannot be undone.`,
      isDangerous: true,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await authApi.deleteUser(userId);
          toast.success('User deleted successfully.');
          loadUsers();
        } catch (err: any) {
          console.error(err);
          toast.error(err.response?.data?.detail || 'Failed to delete user');
        }
      },
    });
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    
    const targetUser = resettingUser;
    setSuccessResetUser(targetUser);
    setResettingUser(null);
    setResetStatus('loading');
    setShowResetSuccessPopup(true);
    
    try {
      await api.put(`/auth/users/${targetUser.id}/reset-password`, {
        new_password: newPassword
      });
      setResetStatus('success');
      setNewPassword('');
    } catch (err: any) {
      console.error(err);
      setResetStatus('error');
      setResetError(err.response?.data?.detail || 'Failed to reset password');
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx')) {
      toast.error('Please select a valid .xlsx file.');
      return;
    }

    setUploading(true);
    try {
      const response = await authApi.bulkUploadUsers(file);
      toast.success(`Success! Created ${response.data.created_count} users and queued welcome emails. Skipped ${response.data.skipped_emails.length} duplicates.`);
      loadUsers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.detail || 'Failed to upload users.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Filtered lists
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-pink-600 dark:text-pink-400 flex items-center gap-2">
            <Users className="w-9 h-9" />
            Admin Console
          </h1>
          <p className="text-purple-700 dark:text-purple-300 mt-1 font-medium">Manage user credentials and subject allocations</p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setIsAddingUser(true)}
            className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
          <input 
            type="file" 
            accept=".xlsx" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleBulkUpload} 
          />
          <a
            href={`${import.meta.env.BASE_URL}sample_users_template.xlsx`}
            download="sample_users_template.xlsx"
            className="btn btn-secondary flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Template
          </a>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary flex items-center gap-2"
            disabled={uploading}
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Bulk Upload Users
          </button>
          <button
            onClick={loadUsers}
            className="btn btn-secondary flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative w-full md:w-96">
        <input
          type="text"
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          placeholder="Search users by name or email..."

          className="input w-full dark:!bg-slate-950 dark:!text-white dark:!border-slate-800"
        />
      </div>

      <div className="card overflow-hidden p-0 dark:!bg-slate-900 border-2 border-pink-200 dark:border-pink-900 shadow-xl shadow-pink-100/30 dark:shadow-black/40">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gradient-to-r from-pink-50 to-purple-50 dark:from-slate-900 dark:to-slate-900 text-slate-700 dark:text-slate-300 font-semibold border-b border-pink-200 dark:border-slate-800">
                <tr>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Department</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pink-100 dark:divide-slate-800">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-pink-50/20 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{u.name}</td>
                    <td className="px-6 py-4 font-medium">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold ${
                        u.role === 'ADMIN' ? 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800' :
                        u.role === 'HOD' ? 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800' :
                        'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium">{u.department || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEditClick(u)}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-800 rounded-lg transition border-none bg-transparent"
                        title="Edit User"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setResettingUser(u)}
                        className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 rounded-lg transition border-none bg-transparent"
                        title="Reset Password"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.name)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded-lg transition ml-1 border-none bg-transparent"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* Add User Modal */}
      {isAddingUser && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-pink-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Add Manual User</h2>
              <button onClick={() => setIsAddingUser(false)} className="text-slate-400 hover:text-slate-600 border-none bg-transparent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input 
                  type="text" 
                  className="input" 
                  value={addName} 
                  onChange={e => setAddName(e.target.value)} 
                  placeholder="John Doe"
                  required 
                />
              </div>
              <div>
                <label className="label">Email</label>
                <input 
                  type="email" 
                  className="input" 
                  value={addEmail} 
                  onChange={e => setAddEmail(e.target.value)} 
                  placeholder="john@example.com"
                  required 
                />
              </div>
              <div>
                <label className="label">Password</label>
                <input 
                  type="password" 
                  className="input" 
                  value={addPassword} 
                  onChange={e => setAddPassword(e.target.value)} 
                  placeholder="••••••••"
                  required 
                />
              </div>
              <div>
                <label className="label">Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {['FACULTY', 'HOD'].map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setAddRole(role)}
                      className={`p-3 rounded-lg border text-sm transition-all font-medium ${addRole === role
                        ? 'bg-pink-50 border-pink-300 text-pink-700 shadow-sm dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                        }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Department</label>
                <Combobox
                  options={['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS', 'Admin Department']}
                  value={addDepartment}
                  onChange={(val) => setAddDepartment(val)}
                  placeholder="Select or type department..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsAddingUser(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600" disabled={creating}>
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Edit User Modal */}
      {editingUser && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-pink-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600 border-none bg-transparent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input" value={editName} onChange={e => setEditName(e.target.value)} required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={editEmail} onChange={e => setEditEmail(e.target.value)} required />
              </div>
              <div>
                <label className="label">Role</label>
                {editingUser?.role === 'ADMIN' ? (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 text-sm font-bold text-center">
                    ADMIN (Cannot be modified)
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {['FACULTY', 'HOD'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setEditRole(role)}
                        className={`p-3 rounded-lg border text-sm transition-all font-medium ${editRole === role
                          ? 'bg-pink-50 border-pink-300 text-pink-700 shadow-sm dark:bg-pink-900/30 dark:border-pink-700 dark:text-pink-300'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300'
                          }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label">Department</label>
                <Combobox
                  options={['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT', 'AI&DS', 'Admin Department']}
                  value={editDepartment}
                  onChange={(val) => setEditDepartment(val)}
                  placeholder="Select or type department..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditingUser(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Reset Password Modal */}
      {resettingUser && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md shadow-2xl border border-pink-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                Reset Password
              </h2>
              <button onClick={() => setResettingUser(null)} className="text-slate-400 hover:text-slate-600 border-none bg-transparent">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Set a new password for <strong>{resettingUser.name}</strong> ({resettingUser.email}).
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input 
                  type="text" 
                  className="input" 
                  value={newPassword} 
                  onChange={e => setNewPassword(e.target.value)} 
                  placeholder="Enter new password"
                  required 
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setResettingUser(null)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary bg-amber-50 hover:bg-amber-600 border-amber-500">Reset Password</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Password Reset Status Popup */}
      {showResetSuccessPopup && successResetUser && createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => { if (resetStatus !== 'loading') setShowResetSuccessPopup(false) }}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center border-2 border-pink-300 dark:border-pink-700 animate-in zoom-in-95 duration-200 flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            {resetStatus === 'loading' && (
              <>
                <Loader2 className="w-16 h-16 text-pink-500 animate-spin mb-4" />
                <h2 className="text-xl font-bold text-pink-600 dark:text-pink-400 mb-1">Resetting Password...</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Please wait while we update credentials and notify {successResetUser.name}.</p>
              </>
            )}

            {resetStatus === 'success' && (
              <>
                <div className="text-5xl mb-4">🔑</div>
                <h2 className="text-xl font-bold text-pink-600 dark:text-pink-400 mb-1">Password Reset Successfully!</h2>
                <p className="text-slate-800 dark:text-slate-200 text-sm mb-1 font-bold">{successResetUser.name}</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mb-6">Notification email has been sent to {successResetUser.email}</p>
                <div className="flex gap-3 w-full justify-center">
                  <button
                    className="btn btn-primary px-5 py-2.5 w-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold border-none"
                    onClick={() => setShowResetSuccessPopup(false)}
                  >
                    Okay
                  </button>
                </div>
              </>
            )}

            {resetStatus === 'error' && (
              <>
                <div className="text-5xl mb-4">❌</div>
                <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-1">Reset Failed</h2>
                <p className="text-slate-800 dark:text-slate-200 text-sm mb-1 font-bold">{successResetUser.name}</p>
                <p className="text-red-500 dark:text-red-400 text-sm mb-6">{resetError}</p>
                <div className="flex gap-3 w-full justify-center">
                  <button
                    className="btn btn-danger px-5 py-2.5 w-full text-white font-bold border-none"
                    onClick={() => setShowResetSuccessPopup(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        isDangerous={confirmState.isDangerous}
        confirmText={confirmState.confirmText}
      />
    </div>
  );
}
