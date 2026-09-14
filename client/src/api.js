import axios from 'axios';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// RULE (security): this module must never silently mint credentials.
// Previously, getToken() called POST /api/auth/demo on its own whenever no
// token was cached, which meant every single API call — from any page, on
// any load — would auto-log the user in as a fully-privileged HOD without
// any credential check, completely bypassing the /login screen and its
// gating in App.jsx. Now: if there's no token, we do not fetch one here.
// The caller is redirected to /login, where a real sign-in (or an
// explicit, server-gated "continue with demo" action) is required.
export function getStoredToken() {
  return sessionStorage.getItem('allocation_demo_token') || null;
}

function goToLogin() {
  sessionStorage.removeItem('allocation_demo_token');
  sessionStorage.removeItem('allocation_user');
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

export async function apiRequest(config) {
  const token = getStoredToken();
  if (!token) {
    goToLogin();
    // Stop the caller's promise chain; the page is navigating away.
    return new Promise(() => {});
  }
  try {
    return await axios({
      ...config,
      url: config.url.startsWith('http') ? config.url : `${API}${config.url}`,
      headers: {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    if (error.response?.status === 401) {
      goToLogin();
      return new Promise(() => {});
    }
    throw error;
  }
}
