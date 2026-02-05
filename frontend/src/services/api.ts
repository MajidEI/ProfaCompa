import axios from 'axios';
import type { AuthStatus, Profile, CompareResponse } from '../types';

/**
 * API base URL
 * In development, Vite proxy handles /api -> http://localhost:3001
 * In production, configure this to point to your backend
 */
const API_BASE_URL = import.meta.env.PROD 
  ? import.meta.env.VITE_API_URL || ''
  : 'http://localhost:3001';

/**
 * Axios instance configured for our API
 * withCredentials: true ensures session cookies are sent
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Response interceptor to handle common errors
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 (Unauthorized) - redirect to login
    if (error.response?.status === 401) {
      // Clear any local state and trigger re-auth
      console.warn('Session expired or unauthorized');
    }
    return Promise.reject(error);
  }
);

// ============================================================================
// AUTH API
// ============================================================================

/**
 * Get the Salesforce login URL
 * Redirect user to this URL to initiate OAuth flow
 * 
 * @param env - 'production' or 'sandbox'
 */
export function getLoginUrl(env: 'production' | 'sandbox' = 'production'): string {
  return `${API_BASE_URL}/auth/login?env=${env}`;
}

/**
 * Check current authentication status
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const response = await api.get<AuthStatus>('/auth/status');
  return response.data;
}

/**
 * Refresh the access token
 * Call this when the token expires
 */
export async function refreshToken(): Promise<void> {
  await api.post('/auth/refresh');
}

/**
 * Log out the current user
 */
export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

// ============================================================================
// PROFILE API
// ============================================================================

/**
 * Fetch all profiles from the connected Salesforce org
 */
export async function getProfiles(): Promise<Profile[]> {
  const response = await api.get<{ profiles: Profile[] }>('/profiles');
  return response.data.profiles;
}

/**
 * Compare multiple profiles
 * @param profileIds - Array of profile IDs to compare (minimum 2)
 */
export async function compareProfiles(profileIds: string[]): Promise<CompareResponse> {
  const response = await api.post<CompareResponse>('/profiles/compare', { profileIds });
  return response.data;
}

// ============================================================================
// ERROR HELPERS
// ============================================================================

/**
 * Extract a user-friendly error message from an API error
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // API returned an error response
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    // Network error
    if (error.code === 'ERR_NETWORK') {
      return 'Unable to connect to the server. Please check your connection.';
    }
    // Timeout
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. The server may be processing a large request.';
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred';
}

export default api;
