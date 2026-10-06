/**
 * Native Python API Layer — Mobile App (Chaquopy)
 * Data is fetched by calling the native Python backend bundled on the device via Capacitor Bridge.
 * Mirrors the website's Axios-based interface exactly so that pages compile without modification.
 */

import { chaquopyBridge } from './chaquopyBridge';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';

// Helper to convert Blob to Base64 (for file uploads)
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

// Helper to convert Base64 back to Blob (for file downloads)
const base64ToBlob = (base64: string, contentType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
};

// Global helper to trigger native download
export const downloadExcel = async (blob: Blob, filename: string) => {
  try {
    if (!Capacitor.isNativePlatform()) {
      // Browser fallback
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return;
    }

    // Native Platform: Save via Capacitor Filesystem in Documents
    const base64Data = await blobToBase64(blob);
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Documents,
    });

    const filePath = writeResult.uri;

    // Trigger local notification to allow clicking and opening
    await LocalNotifications.requestPermissions();
    await LocalNotifications.schedule({
      notifications: [
        {
          title: 'Question Bank Exported',
          body: `Successfully exported to Documents: ${filename}. Tap to open.`,
          id: Math.floor(Math.random() * 100000),
          extra: { filePath },
        }
      ]
    });
  } catch (err) {
    console.error('Error downloading/exporting excel:', err);
  }
};

// Dispatch API requests to Python TestClient
const callPython = async (method: string, path: string, body?: any) => {
  try {
    const token = localStorage.getItem('token');
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const payload = {
      __bridge_headers: headers,
      data: body
    };
    
    const res = await chaquopyBridge.dispatchApiRequest(method, path, payload);
    if (!res.success) {
      console.error(`Python backend error on ${method} ${path}:`, res.error);
      
      let errorDetail = res.error;
      if (Array.isArray(errorDetail)) {
        errorDetail = errorDetail.map((e: any) => {
          const loc = e.loc ? e.loc.join('.') : '';
          return `${loc}: ${e.msg}`.replace(/^: /, '').trim();
        }).join(', ');
      } else if (typeof errorDetail === 'object' && errorDetail !== null) {
        errorDetail = JSON.stringify(errorDetail);
      }
      
      throw {
        response: {
          status: 400,
          data: { detail: errorDetail || 'Native Python Execution Error' }
        },
        message: errorDetail || 'Native Python Execution Error'
      };
    }

    let resData = res.data;
    if (resData && resData.__is_binary) {
      resData = base64ToBlob(resData.content, resData.content_type);
    }
    return { data: resData };
  } catch (err: any) {
    if (err.response) throw err;
    throw {
      response: {
        status: 500,
        data: { detail: err.message || 'Bridge Call Failed' }
      },
      message: err.message || 'Bridge Call Failed'
    };
  }
};

// Helper for file uploads (Syllabus, CDAP, Excel templates)
const uploadFilePython = async (path: string, file: File) => {
  const base64 = await blobToBase64(file);
  const body = {
    __is_file_upload: true,
    filename: file.name,
    content: base64
  };
  return callPython('POST', path, body);
};

// Axios-like interface mock
const api = {
  get: (path: string, config?: any) => callPython('GET', path, config?.params),
  post: (path: string, body?: any, config?: any) => {
    if (body instanceof FormData) {
      const file = body.get('file') as File;
      if (file) {
        return uploadFilePython(path, file);
      }
    }
    return callPython('POST', path, body);
  },
  put: (path: string, body?: any, config?: any) => callPython('PUT', path, body),
  delete: (path: string, config?: any) => callPython('DELETE', path, config?.params),
  interceptors: {
    request: { use: () => {} },
    response: { use: () => {} }
  }
};

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
    return api.post('/auth/users/bulk-upload', form);
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
    return api.post(`/syllabus/upload/${subjectId}`, formData);
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
    return api.post(`/syllabus/cdap/upload/${subjectId}`, formData);
  },
  preview: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/syllabus/cdap/preview', formData);
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
  generate: (data: any) =>
    api.post('/question-bank/generate', data),
  generateOffline: (data: any) =>
    api.post('/question-bank/generate-offline', data),
  syncOffline: (data: any) =>
    api.post('/question-bank/sync-offline', data),
  exportBytes: (data: any) =>
    api.post('/question-bank/export-bytes', data),
  generatePrompt: (data: any) =>
    api.post('/question-bank/generate-prompt', data),
  generateFromResponse: (data: any) =>
    api.post('/question-bank/generate-from-response', data),
  updateQuestions: (id: string, data: { questions: { parts: Record<string, any[]> } }) =>
    api.put(`/question-bank/${id}/questions`, data),
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/question-bank/upload-image', form);
  },
  download: (id: string) =>
    api.get(`/question-bank/${id}/download`, { responseType: 'blob' }),
  delete: (id: string) => api.delete(`/question-bank/${id}`),
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
  getAll: () => api.get('/staff/all'),
  deleteStaff: (staffId: string) => api.delete(`/staff/${staffId}`),
  importExcel: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/staff/import-excel', form);
  },
};

export default api;
