import axios from 'axios';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

let tokenPromise;

export async function getToken() {
  const existing = sessionStorage.getItem('allocation_demo_token');
  if (existing) return existing;
  if (!tokenPromise) {
    tokenPromise = axios.post(`${API}/auth/demo`)
      .then(r => {
        sessionStorage.setItem('allocation_demo_token', r.data.token);
        return r.data.token;
      })
      .finally(() => { tokenPromise = null; });
  }
  return tokenPromise;
}

export async function apiRequest(config) {
  const token = await getToken();
  return axios({
    ...config,
    url: config.url.startsWith('http') ? config.url : `${API}${config.url}`,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
}
