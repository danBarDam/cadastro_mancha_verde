import React, { useState } from 'react';
import api from '../utils/api';
import { converterLinkDrive, dataURLParaArquivo } from '../utils/imagem';
import { gerarImagemCarteirinha } from '../utils/carteirinha';
import ModalEdicaoCadastro from '../components/ModalEdicaoCadastro';

function Carteirinhas() {
  const [termoBusca, setTermoBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [componenteSelecionado, setComponenteSelecionado] = useState(null);
  const [previaCarteirinha, setPreviaCarteirinha] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [status, setStatus] = useState('');
  const [componenteEmEdicao, setComponenteEmEdicao] = useState(null);

  const lidarComBusca = async (e) => {
    e.preventDefault();
    if (!termoBusca.trim()) return;

    setCarregando(true);
    setErro('');
    setResultados([]);
    setComponenteSelecionado(null);
    setPreviaCarteirinha(null);
    setStatus('');

    try {
      const resposta = await api.get(`/buscar?termo=${termoBusca}`);
      setResultados(resposta.data);

      if (resposta.data.length === 0) {
        setErro('Nenhum componente cadastrado foi encontrado.');
      }
    } catch (err) {
      console.error(err);
      setErro('Erro ao conectar com o servidor de busca.');
    } finally {
      setCarregando(false);
    }
  };

  const selecionarComponente = async (componente) => {
    setComponenteSelecionado(componente);
    setPreviaCarteirinha(null);
    setStatus('');
    setGerando(true);

    try {
      const imagemDataUrl = await gerarImagemCarteirinha({
        id: componente.id,
        nome: componente.nome,
        ala: componente.ala,
        data: componente.data,
        fotoUrl: componente.fotoUrl,
      });
      setPreviaCarteirinha(imagemDataUrl);
    } catch (err) {
      console.error('Erro ao gerar prévia da carteirinha:', err);
      setStatus('Erro ao gerar a prévia da carteirinha.');
    } finally {
      setGerando(false);
    }
  };

  const salvarNoDrive = async () => {
    if (!previaCarteirinha || !componenteSelecionado) return;

    setSalvando(true);
    setStatus('');

    try {
      const arquivo = dataURLParaArquivo(previaCarteirinha, `carteirinha-${componenteSelecionado.id}.png`);
      const formData = new FormData();
      formData.append('id', componenteSelecionado.id);
      formData.append('nome', componenteSelecionado.nome);
      formData.append('imagem', arquivo);

      await api.post('/salvar-carteirinha', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setStatus('Carteirinha salva no Drive com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar carteirinha:', err);
      setStatus('Erro ao salvar a carteirinha no Drive.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '900px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ color: '#005c33', marginBottom: '10px' }}>Carteirinhas</h2>
        <p style={{ color: '#64748b' }}>Busque um componente para gerar e salvar a carteirinha no Drive</p>
      </div>

      <form onSubmit={lidarComBusca} style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        <input
          type="text"
          className="form-input"
          placeholder="Ex: Nome do componente ou CPF..."
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          style={{ flex: 1, height: '45px', fontSize: '16px' }}
        />
        <button
          type="submit"
          className="btn-principal"
          style={{ width: '140px', height: '45px', borderRadius: '6px', marginTop: 0, backgroundColor: '#005c33' }}
          disabled={carregando}
        >
          {carregando ? 'Buscando...' : 'Pesquisar'}
        </button>
      </form>

      {erro && <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 'bold', margin: '20px 0' }}>{erro}</div>}

      <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Lista de Resultados */}
        <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {resultados.map((componente) => (
            <div
              key={componente.id}
              onClick={() => selecionarComponente(componente)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '15px',
                backgroundColor: componenteSelecionado?.id === componente.id ? '#e8f5e9' : 'white',
                borderRadius: '8px',
                padding: '12px 15px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                borderLeft: '5px solid #005c33',
                cursor: 'pointer'
              }}
            >
              <div style={{ width: '50px', height: '50px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0 }}>
                {componente.fotoUrl ? (
                  <img
                    src={converterLinkDrive(componente.fotoUrl)}
                    alt={componente.nome}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👤</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {componente.nome}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>ALA: {componente.ala} | #{componente.id}</div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setComponenteEmEdicao(componente); }}
                style={{ padding: '6px 10px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', flexShrink: 0 }}
              >
                ✏️ Editar
              </button>
            </div>
          ))}
        </div>

        {/* Prévia da Carteirinha */}
        {componenteSelecionado && (
          <div style={{ flex: '1 1 280px', textAlign: 'center' }}>
            <h3 style={{ color: '#1e293b', marginBottom: '15px' }}>Prévia da Carteirinha</h3>

            {gerando ? (
              <p style={{ color: '#64748b' }}>Gerando prévia...</p>
            ) : previaCarteirinha ? (
              <>
                <img
                  src={previaCarteirinha}
                  alt="Prévia da carteirinha"
                  style={{ width: '100%', maxWidth: '280px', borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', marginBottom: '15px' }}
                />
                <button
                  onClick={salvarNoDrive}
                  disabled={salvando}
                  className="btn-principal"
                  style={{ backgroundColor: '#005c33', width: '100%' }}
                >
                  {salvando ? 'Salvando...' : 'Salvar Carteirinha no Drive'}
                </button>
              </>
            ) : null}

            {status && <p style={{ marginTop: '10px', color: status.includes('sucesso') ? '#005c33' : '#ef4444', fontWeight: 'bold' }}>{status}</p>}
          </div>
        )}
      </div>

      <ModalEdicaoCadastro
        componente={componenteEmEdicao}
        aoFechar={() => setComponenteEmEdicao(null)}
        aoSalvar={(atualizado) => {
          setResultados((prev) => prev.map((item) => (item.id === atualizado.id ? atualizado : item)));
          setComponenteEmEdicao(null);

          // Se o componente editado é o que está na prévia, regenera a carteirinha com os novos dados
          if (componenteSelecionado?.id === atualizado.id) {
            selecionarComponente(atualizado);
          }
        }}
      />
    </div>
  );
}

export default Carteirinhas;
