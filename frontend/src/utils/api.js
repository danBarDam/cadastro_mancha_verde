import axios from 'axios';
import { obterToken, encerrarSessao } from './auth';
import { API_BASE_URL } from './config';

// Instância do axios já configurada com o backend e o token de autenticação.
// Para chamadas a APIs externas (ex: ViaCEP), continue usando o axios "puro".
const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = obterToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      encerrarSessao();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
