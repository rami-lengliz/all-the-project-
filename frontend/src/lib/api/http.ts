import axios from 'axios';
import { toast } from '@/components/ui/Toaster';

const baseURL = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL,
  timeout: 15000,
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const message =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Request failed';
    // Avoid noisy toasts for cancelled requests
    if (message !== 'canceled') {
      toast({ title: 'Request error', message: String(message), variant: 'error' });
    }
    return Promise.reject(error);
  },
);

