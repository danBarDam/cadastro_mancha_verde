import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import Pesquisa from './pages/Pesquisa';
import Relatorios from './pages/Relatorios';
import LancarPresencas from './pages/LancarPresencas';
import Carteirinhas from './pages/Carteirinhas';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { obterUsuario, encerrarSessao } from './utils/auth';

// Importação das páginas
import Cadastro from './pages/Cadastro';


// Componente de Navegação
function MenuDeAbas() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  // Fecha o menu mobile sempre que a rota muda
  useEffect(() => {
    setMenuAberto(false);
  }, [location.pathname]);

  if (location.pathname === '/login') return null;

  const usuarioLogado = obterUsuario();

  const sair = () => {
    encerrarSessao();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* ======================= ÁREA DO LOGO + BOTÃO HAMBÚRGUER (MOBILE) ======================= */}
        <div className="navbar-topo">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/logo-mancha.png"
              alt="Escudo Mancha Verde"
              loading="lazy"
              style={{ width: '45px', height: '45px', objectFit: 'contain', flexShrink: 0 }}
            />
            <h3 style={{
              margin: 0,
              color: '#f4f8f6',
              fontWeight: '900',
              textTransform: 'uppercase',
              fontSize: '18px',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.5px'
            }}>
              G.R.C.E.S. MANCHA VERDE
            </h3>
          </div>

          <button
            className="hamburger-btn"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label="Abrir menu"
          >
            {menuAberto ? '✕' : '☰'}
          </button>
        </div>

        {/* ======================= ABAS + ÁREA DO USUÁRIO (COLAPSÁVEL NO MOBILE) ======================= */}
        <div className={`menu-colapsavel ${menuAberto ? 'aberto' : ''}`}>
          <div className="abas-grupo">
            <Link to="/" className={`aba-link ${location.pathname === '/' ? 'ativa' : ''}`}>
              Inscrição
            </Link>
            <Link to="/lancar-presencas" className={`aba-link ${location.pathname === '/lancar-presencas' ? 'ativa' : ''}`}>
              Presenças
            </Link>
            <Link to="/pesquisa" className={`aba-link ${location.pathname === '/pesquisa' ? 'ativa' : ''}`}>
              Pesquisa
            </Link>
            <Link to="/carteirinhas" className={`aba-link ${location.pathname === '/carteirinhas' ? 'ativa' : ''}`}>
              Carteirinhas
            </Link>
            <Link to="/relatorios" className={`aba-link ${location.pathname === '/relatorios' ? 'ativa' : ''}`}>
              Relatórios
            </Link>
          </div>

          {usuarioLogado && (
            <div className="usuario-area">
              <span className="usuario-nome">Olá, {usuarioLogado}</span>
              <a
                href="https://drive.google.com/drive/folders/1HEhcNDScL0ZXmd5mq-tNcacKSOn16rdi?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-usuario"
              >
                📁 Google Drive
              </a>
              <button onClick={sair} className="btn-usuario">
                Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

// Estrutura Principal de Rotas
function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <MenuDeAbas />

        <div className="conteudo-principal">
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/" element={<ProtectedRoute><Cadastro /></ProtectedRoute>} />

            <Route path="/lancar-presencas" element={<ProtectedRoute><LancarPresencas /></ProtectedRoute>} />

            <Route path="/pesquisa" element={<ProtectedRoute><Pesquisa /></ProtectedRoute>} />

            <Route path="/carteirinhas" element={<ProtectedRoute><Carteirinhas /></ProtectedRoute>} />

            <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />

          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
