import axios from 'axios';

// ==========================================
// 🚀 BACKEND URL CONFIGURATION
// ==========================================
// When testing locally, the app will automatically use 'http://localhost:8000/api'.
// When deploying to Render, you should set the `VITE_API_URL` environment variable 
// in your Render dashboard to your backend's Render URL (e.g., https://your-backend.onrender.com/api).
// 
// If you prefer manual configuration, you can comment/uncomment the lines below:

// 1. Dynamic API URL (loads VITE_API_URL from environment or falls back to local dev URL)
const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers || {} as any;
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 and formatting errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Stringify validation error arrays
    if (error.response?.data?.detail && Array.isArray(error.response.data.detail)) {
      error.response.data.detail = error.response.data.detail.map((e: any) => {
        const loc = e.loc ? e.loc.join('.') : '';
        return `${loc}: ${e.msg}`.replace(/^: /, '').trim();
      }).join(', ');
    }

    const isLoginRequest = error.config?.url?.includes('/auth/login');
    const isLoginPage = 
      window.location.pathname === '/login' || 
      window.location.hash === '#/login' || 
      window.location.hash.startsWith('#/login');
    if (error.response?.status === 401 && !isLoginRequest && !isLoginPage) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/#/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),

  resetPasswordDirect: (email: string, newPassword: string) =>
    api.post('/auth/reset-password-direct', { email, new_password: newPassword }),
  getMe: () => api.get('/auth/me'),
  bulkUploadUsers: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/auth/users/bulk-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  createUser: (data: { email: string; password: string; name: string; role: string; department?: string }) =>
    api.post('/auth/users', data),
  deleteUser: (userId: string) =>
    api.delete(`/auth/users/${userId}`),
};


// Subjects API
export const subjectsApi = {
  getAll: () => api.get('/subjects'),
  get: (id: string) => api.get(`/subjects/${id}`),
  create: (data: any) => api.post('/subjects', data),
  update: (id: string, data: any) => api.put(`/subjects/${id}`, data),
  delete: (id: string) => api.delete(`/subjects/${id}`),
};

// Syllabus API
export const syllabusApi = {
  getAll: () => api.get('/syllabus'),
  getBySubject: (subjectId: string) => api.get(`/syllabus/subject/${subjectId}`),
  get: (id: string) => api.get(`/syllabus/${id}`),
  upload: (subjectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/syllabus/upload/${subjectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  update: (id: string, data: any) => api.put(`/syllabus/${id}`, data),
  delete: (id: string) => api.delete(`/syllabus/${id}`),
};

// CDAP API (Course Delivery and Assessment Plan)
export const cdapApi = {
  getBySubject: (subjectId: string) => api.get(`/syllabus/cdap/${subjectId}`),
  upload: (subjectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/syllabus/cdap/upload/${subjectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/syllabus/cdap/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  delete: (subjectId: string) => api.delete(`/syllabus/cdap/${subjectId}`),
  update: (subjectId: string, data: any) => api.put(`/syllabus/cdap/${subjectId}`, data),
};

// Question Bank API
export const questionBankApi = {
  getAll: (params?: { status?: string; subject_id?: string; own_only?: boolean }) =>
    api.get('/question-bank', { params }),
  get: (id: string) => api.get(`/question-bank/${id}`),
  getPattern: (subjectId: string) => api.get(`/question-bank/pattern/${subjectId}`),
  updatePattern: (subjectId: string, data: any) =>
    api.put(`/question-bank/pattern/${subjectId}`, data),
  generate: (data: { subject_id: string; syllabus_id: string; pattern_id?: string; custom_parts?: any[]; selected_unit_ids?: number[]; unit_question_counts?: Record<string, Record<number, number>>; unit_configs?: Record<string, any[]>; include_answers?: boolean }) =>
    api.post('/question-bank/generate', data),
  /** Prompt Mode: build a copy-paste prompt for any external AI (no provider call) */
  generatePrompt: (data: { subject_id: string; syllabus_id: string; pattern_id?: string; custom_parts?: any[]; selected_unit_ids?: number[]; unit_question_counts?: Record<string, Record<number, number>>; unit_configs?: Record<string, any[]>; include_answers?: boolean; split_by_unit?: boolean }) =>
    api.post<{ prompt?: string; total_questions: number; num_parts: number; split_by_unit?: boolean; unit_prompts?: { unit_number: number; unit_title: string; prompt: string; total_questions: number }[] }>('/question-bank/generate-prompt', data),
  /** Prompt Mode: turn a pasted-back AI response into an Excel question bank */
  generateFromResponse: (data: { subject_id: string; syllabus_id: string; pattern_id?: string; custom_parts?: any[]; selected_unit_ids?: number[]; unit_question_counts?: Record<string, Record<number, number>>; unit_configs?: Record<string, any[]>; response_text?: string; unit_responses?: Record<string, string>; include_answers?: boolean }) =>
    api.post('/question-bank/generate-from-response', data),
  updateQuestions: (id: string, data: { questions: { parts: Record<string, any[]> } }) =>
    api.put(`/question-bank/${id}/questions`, data),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ url: string }>('/question-bank/upload-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  download: (id: string) =>
    api.get(`/question-bank/${id}/download`, { responseType: 'blob' }),
  delete: (id: string) => api.delete(`/question-bank/${id}`),
  /** Share a question bank with parallel staff via email (+ optional Drive link) */
  share: (id: string, data: { recipient_emails: string[] }) =>
    api.post(`/question-bank/${id}/share`, data),
};

// Staff API
export const staffApi = {
  getFacultyList: () => api.get('/staff/faculty-list'),
  getMySubjects: () => api.get('/staff/my-subjects'),
  getSubjectStaff: (subjectId: string) => api.get(`/staff/subject/${subjectId}`),
  assign: (subjectId: string, data: any) => api.post(`/staff/assign/${subjectId}`, data),
  updatePermissions: (assignmentId: string, data: any) =>
    api.put(`/staff/assignment/${assignmentId}`, data),
  remove: (assignmentId: string) => api.delete(`/staff/assignment/${assignmentId}`),
  /** HOD: list all registered staff members with their subject assignments */
  getAll: () => api.get('/staff/all'),
  /** HOD: deactivate a staff member account */
  deleteStaff: (staffId: string) => api.delete(`/staff/${staffId}`),
  /** HOD: bulk-import staff from an Excel file */
  importExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/staff/import-excel', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Support / Help API
export const supportApi = {
  submitQuery: (message: string, files?: File[]) => {
    const formData = new FormData();
    formData.append('message', message);
    if (files) {
      files.forEach((file) => {
        formData.append('files', file);
      });
    }
    return api.post('/auth/contact', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export default api;
