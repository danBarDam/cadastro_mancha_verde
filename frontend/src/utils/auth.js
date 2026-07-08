// Controle simples de sessão usando localStorage (token JWT emitido pelo backend)
export const salvarSessao = (token, usuario) => {
  localStorage.setItem('token', token);
  localStorage.setItem('usuario', usuario);
};

export const obterToken = () => localStorage.getItem('token');

export const obterUsuario = () => localStorage.getItem('usuario');

export const encerrarSessao = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
};

export const estaAutenticado = () => !!obterToken();
