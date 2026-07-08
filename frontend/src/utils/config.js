// URL do backend. Em desenvolvimento, usa localhost por padrão.
// Em produção (Vercel), defina VITE_API_URL apontando para a URL do backend publicado (ex: Render).
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5174';
