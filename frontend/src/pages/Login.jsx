import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { salvarSessao } from '../utils/auth';

function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  const lidarComLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const resposta = await api.post('/login', { usuario, senha });
      salvarSessao(resposta.data.token, resposta.data.usuario);
      navigate('/');
    } catch (err) {
      console.error(err);
      setErro(err.response?.data?.error || 'Erro ao conectar com o servidor.');
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', padding: '20px' }}>
      <form
        onSubmit={lidarComLogin}
        style={{ backgroundColor: 'white', padding: '40px', borderRadius: '10px', width: '100%', maxWidth: '380px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', boxSizing: 'border-box' }}
      >
        <div style={{ textAlign: 'center', marginBottom: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
            <img src="/logo-mancha.png" alt="Mancha Verde" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
            <img src="/logo-comunidade.png" alt="Comunidade" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
          </div>
          <h2 style={{ color: '#005c33', margin: 0, fontSize: '20px' }}>G.R.C.E.S. MANCHA VERDE</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: '5px 0 0 0' }}>Acesso ao sistema de cadastro</p>
        </div>

        <label style={{ display: 'block', marginBottom: '15px' }}>
          <span style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#1e293b', fontSize: '14px' }}>Usuário</span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            className="form-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            autoFocus
            required
          />
        </label>

        <label style={{ display: 'block', marginBottom: '20px' }}>
          <span style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#1e293b', fontSize: '14px' }}>Senha</span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="form-input"
            style={{ width: '100%', boxSizing: 'border-box' }}
            required
          />
        </label>

        {erro && <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '15px', textAlign: 'center', fontSize: '14px' }}>{erro}</div>}

        <button type="submit" disabled={carregando} className="btn-primary" style={{ marginTop: 0 }}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default Login;
