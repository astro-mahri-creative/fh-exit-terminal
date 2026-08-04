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
  },

  createUserId: async () => {
    const response = await api.post('/session/new-userid');
    return response.data;
  },

  saveEmail: async (sessionToken, email) => {
    const response = await api.post('/session/save-email', {
      session_token: sessionToken,
      email,
    });
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
  send: async (sessionToken, email, optIn = false) => {
    const response = await api.post('/email/send', {
      session_token: sessionToken,
      email,
      opt_in: optIn
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

  getDetailedAnalytics: async (sessionToken, startDate, endDate, phase) => {
    // `phase` selects which reset-to-reset window to report on: a phase
    // number, 'all', 'pre', or omitted for the current phase. startDate and
    // endDate are optional YYYY-MM-DD strings that narrow within it — the
    // backend clamps them into the selected phase and treats end as inclusive
    // through the end of that day, so the same value for both selects one day.
    const params = { session_token: sessionToken };
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    if (phase !== undefined && phase !== null && phase !== '') params.phase = phase;
    const response = await api.get('/admin/analytics/detailed', { params });
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
  },

  toggleReturnMode: async (sessionToken) => {
    const response = await api.post('/admin/settings/toggle-return-mode', {
      session_token: sessionToken
    });
    return response.data;
  },

  toggleTerminalLock: async (sessionToken) => {
    const response = await api.post('/admin/settings/toggle-lock', {
      session_token: sessionToken
    });
    return response.data;
  },

  getEffectScale: async (sessionToken) => {
    const response = await api.get('/admin/settings/effect-scale', {
      params: { session_token: sessionToken }
    });
    return response.data;
  },

  setEffectScale: async (sessionToken, effectScale) => {
    const response = await api.post('/admin/settings/effect-scale', {
      session_token: sessionToken,
      effectScale
    });
    return response.data;
  }
};

export default api;
