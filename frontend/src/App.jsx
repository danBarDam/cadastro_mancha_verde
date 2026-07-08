import React from 'react';
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

  if (location.pathname === '/login') return null;

  const usuarioLogado = obterUsuario();

  const sair = () => {
    encerrarSessao();
    navigate('/login');
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">

        {/* ======================= ÁREA DO LOGO (DESLOCADA PARA BAIXO) ======================= */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            // Aumentamos o primeiro valor (topo) de 20px para 35px
            padding: '35px 15px 20px 15px',
            borderBottom: '2px solid #005c33',
            marginBottom: '20px',
            gap: '12px',
            cursor: 'default',
            transition: 'background 0.3s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <img
            src="/logo-mancha.png"
            alt="Escudo Mancha Verde"
            loading="lazy"
            style={{
              width: '45px',
              height: '45px',
              objectFit: 'contain',
              flexShrink: 0
            }}
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

        {/* ======================= Inicio do Container ======================= */}

        <h1 className="navbar-logo"></h1>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', paddingLeft: '15px' }}>
            <span style={{ color: '#c8e6c9', fontSize: '13px', whiteSpace: 'nowrap' }}>Olá, {usuarioLogado}</span>
            <button
              onClick={sair}
              style={{ padding: '6px 14px', backgroundColor: 'transparent', border: '1px solid #c8e6c9', color: '#c8e6c9', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              Sair
            </button>
          </div>
        )}
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
