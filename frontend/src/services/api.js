import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

export const sessionService = {
  start: async (userId) => {
    const response = await api.post('/session/start', { user_id: userId });
    return response.data;
  }
};

export const universeService = {
  getAll: async () => {
    const response = await api.get('/universes');
    return response.data;
  }
};

export const networkService = {
  get: async () => {
    const response = await api.get('/network');
    return response.data;
  }
};

export const codeService = {
  validate: async (sessionToken, code) => {
    const response = await api.post('/codes/validate', {
      session_token: sessionToken,
      code
    });
    return response.data;
  },

  preview: async (sessionToken) => {
    const response = await api.post('/codes/preview', {
      session_token: sessionToken
    });
    return response.data;
  },

  finalize: async (sessionToken, choice) => {
    const response = await api.post('/codes/finalize', {
      session_token: sessionToken,
      choice
    });
    return response.data;
  }
};

export const emailService = {
  send: async (sessionToken, email) => {
    const response = await api.post('/email/send', {
      session_token: sessionToken,
      email
    });
    return response.data;
  }
};

export const adminService = {
  generateUserId: async (sessionToken) => {
    const response = await api.post('/admin/generate-userid', {
      session_token: sessionToken
    });
    return response.data;
  },

  resetUniverses: async (sessionToken) => {
    const response = await api.post('/admin/reset-universes', {
      session_token: sessionToken
    });
    return response.data;
  },

  getAnalytics: async (sessionToken) => {
    const response = await api.get('/admin/analytics', {
      params: { session_token: sessionToken }
    });
    return response.data;
  },

  getUsers: async (sessionToken) => {
    const response = await api.get('/admin/users', {
      params: { session_token: sessionToken }
    });
    return response.data;
  },

  getCodes: async (sessionToken) => {
    const response = await api.get('/admin/codes', {
      params: { session_token: sessionToken }
    });
    return response.data;
  }
};

export default api;
