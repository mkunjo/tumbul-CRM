import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  logout: () => api.post('/api/auth/logout'),
  getCurrentUser: () => api.get('/api/auth/me'),
  refreshToken: () => api.post('/api/auth/refresh-token'),
};

// Clients API
export const clientsAPI = {
  getAll: (params) => api.get('/api/clients', { params }),
  getById: (id) => api.get(`/api/clients/${id}`),
  create: (data) => api.post('/api/clients', data),
  update: (id, data) => api.put(`/api/clients/${id}`, data),
  delete: (id) => api.delete(`/api/clients/${id}`),
  archive: (id) => api.post(`/api/clients/${id}/archive`),
  restore: (id) => api.post(`/api/clients/${id}/restore`),
};

// Projects API
export const projectsAPI = {
  getAll: (params) => api.get('/api/projects', { params }),
  getById: (id) => api.get(`/api/projects/${id}`),
  create: (data) => api.post('/api/projects', data),
  update: (id, data) => api.put(`/api/projects/${id}`, data),
  delete: (id) => api.delete(`/api/projects/${id}`),
  getPhotos: (id) => api.get(`/api/projects/${id}/photos`),
  uploadPhoto: (id, formData) => api.post(`/api/projects/${id}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// Invoices API
export const invoicesAPI = {
  getAll: (params) => api.get('/api/invoices', { params }),
  getById: (id) => api.get(`/api/invoices/${id}`),
  create: (data) => api.post('/api/invoices', data),
  update: (id, data) => api.put(`/api/invoices/${id}`, data),
  delete: (id) => api.delete(`/api/invoices/${id}`),
  updateStatus: (id, status) => api.patch(`/api/invoices/${id}/status`, { status }),
  recordPayment: (id, data) => api.post(`/api/invoices/${id}/payment`, data),
};

// Expenses API
export const expensesAPI = {
  getAll: (params) => api.get('/api/expenses', { params }),
  getById: (id) => api.get(`/api/expenses/${id}`),
  create: (data) => api.post('/api/expenses', data),
  update: (id, data) => api.put(`/api/expenses/${id}`, data),
  delete: (id) => api.delete(`/api/expenses/${id}`),
  // Fixed: Use update endpoint for receipt upload (backend doesn't have separate endpoint)
  uploadReceipt: (id, formData) => api.put(`/api/expenses/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  // Fixed: Correct endpoint path is /approve, not /approval
  approve: (id) => api.patch(`/api/expenses/${id}/approve`),
};

// Time Entries API
export const timeEntriesAPI = {
  getAll: (params) => api.get('/api/time-entries', { params }),
  getById: (id) => api.get(`/api/time-entries/${id}`),
  create: (data) => api.post('/api/time-entries', data),
  update: (id, data) => api.put(`/api/time-entries/${id}`, data),
  delete: (id) => api.delete(`/api/time-entries/${id}`),
  // Fixed: Removed /timer/ prefix from paths to match backend routes
  start: (data) => api.post('/api/time-entries/start', data),
  // Fixed: Changed POST to PATCH (REST convention for partial update)
  stop: (id) => api.patch(`/api/time-entries/${id}/stop`),
  // Fixed: Removed /timer/ prefix
  getRunning: () => api.get('/api/time-entries/running'),
};

// Dashboard API
export const dashboardAPI = {
  getMetrics: () => api.get('/api/dashboard/metrics'),
  getRevenue: (params) => api.get('/api/dashboard/revenue', { params }),
  getExpenses: (params) => api.get('/api/dashboard/expenses', { params }),
  getProfit: (params) => api.get('/api/dashboard/profit', { params }),
  getTopProjects: (params) => api.get('/api/dashboard/top-projects', { params }),
  getRecentActivity: (params) => api.get('/api/dashboard/recent-activity', { params }),
};

// Portal API
export const portalAPI = {
  login: (data) => api.post('/api/portal/login', data),
  getProjects: () => api.get('/api/portal/projects'),
  getProject: (id) => api.get(`/api/portal/projects/${id}`),
  getInvoices: () => api.get('/api/portal/invoices'),
  getExpenses: () => api.get('/api/portal/expenses'),
  approveExpense: (id) => api.post(`/api/portal/expenses/${id}/approve`),
  rejectExpense: (id) => api.post(`/api/portal/expenses/${id}/reject`),
};

export default api;
