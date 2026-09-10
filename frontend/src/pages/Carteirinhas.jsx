import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { converterLinkDrive, dataURLParaArquivo } from '../utils/imagem';
import { gerarImagemCarteirinha } from '../utils/carteirinha';
import ModalEdicaoCadastro from '../components/ModalEdicaoCadastro';
import IndicadorCarteirinha from '../components/IndicadorCarteirinha';

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

  // Geração em lote por ala
  const [alasLista, setAlasLista] = useState([]);
  const [alaLote, setAlaLote] = useState('');
  const [gerandoLote, setGerandoLote] = useState(false);
  const [progressoLote, setProgressoLote] = useState({ feitas: 0, total: 0 });
  const [statusLote, setStatusLote] = useState('');

  useEffect(() => {
    api.get('/alas')
      .then((res) => setAlasLista(res.data.alas || []))
      .catch((err) => console.error('Erro ao carregar alas:', err));
  }, []);

  const marcarCarteirinhaGerada = (id) => {
    setResultados((prev) => prev.map((item) => (
      item.id === id ? { ...item, carteirinhaGerada: 'Sim' } : item
    )));
  };

  const gerarLote = async () => {
    if (!alaLote || gerandoLote) return;

    setGerandoLote(true);
    setStatusLote('');
    setProgressoLote({ feitas: 0, total: 0 });

    try {
      const { data } = await api.get(`/componentes-por-ala?ala=${encodeURIComponent(alaLote)}`);
      const pendentes = data.filter((c) => c.carteirinhaGerada !== 'Sim');

      if (pendentes.length === 0) {
        setStatusLote('Todas as carteirinhas desta ala já foram geradas.');
        return;
      }

      setProgressoLote({ feitas: 0, total: pendentes.length });
      let erros = 0;

      // Sequencial de propósito: evita estourar os limites do Apps Script / Sheets API.
      for (let i = 0; i < pendentes.length; i++) {
        const comp = pendentes[i];
        try {
          const imagemDataUrl = await gerarImagemCarteirinha({
            id: comp.id,
            nome: comp.nome,
            ala: comp.ala,
            data: comp.data,
            fotoUrl: comp.fotoUrl,
          });
          const arquivo = dataURLParaArquivo(imagemDataUrl, `carteirinha-${comp.id}.png`);

          const formData = new FormData();
          formData.append('id', comp.id);
          formData.append('nome', comp.nome);
          formData.append('imagem', arquivo);

          await api.post('/salvar-carteirinha', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          marcarCarteirinhaGerada(comp.id);
        } catch (err) {
          console.error('Erro na carteirinha do componente', comp.id, err);
          erros += 1;
        }
        setProgressoLote({ feitas: i + 1, total: pendentes.length });
      }

      setStatusLote(
        erros === 0
          ? `${pendentes.length} carteirinha(s) gerada(s) e salva(s) no Drive.`
          : `Concluído com ${erros} erro(s) de ${pendentes.length}. Verifique o console.`
      );
    } catch (err) {
      console.error('Erro ao gerar lote de carteirinhas:', err);
      setStatusLote('Erro ao carregar os componentes da ala.');
    } finally {
      setGerandoLote(false);
    }
  };

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

      marcarCarteirinhaGerada(componenteSelecionado.id);
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

      {/* GERAÇÃO EM LOTE POR ALA */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '30px', backgroundColor: '#f8fafc' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#1e293b', fontSize: '16px' }}>Geração em Lote por Ala</h3>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
          Gera todas as carteirinhas da ala selecionada que ainda não foram feitas e salva os PNGs (fundo transparente) na pasta de carteirinhas do Drive.
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="form-input"
            value={alaLote}
            onChange={(e) => setAlaLote(e.target.value)}
            style={{ flex: '1 1 220px', height: '45px', fontSize: '16px' }}
          >
            <option value="">Selecione a Ala...</option>
            {alasLista.map((nomeAla, idx) => (
              <option key={idx} value={nomeAla}>{nomeAla}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={gerarLote}
            disabled={!alaLote || gerandoLote}
            className="btn-principal"
            style={{ width: '160px', height: '45px', borderRadius: '6px', marginTop: 0, backgroundColor: '#005c33' }}
          >
            {gerandoLote ? 'Gerando...' : 'Gerar Lote'}
          </button>
        </div>
        {gerandoLote && progressoLote.total > 0 && (
          <p style={{ margin: '10px 0 0 0', color: '#64748b', fontWeight: 'bold' }}>
            Gerando {progressoLote.feitas}/{progressoLote.total}...
          </p>
        )}
        {statusLote && (
          <p style={{ margin: '10px 0 0 0', fontWeight: 'bold', color: statusLote.toLowerCase().includes('erro') ? '#ef4444' : '#005c33' }}>
            {statusLote}
          </p>
        )}
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
                <div style={{ fontSize: '13px', color: '#64748b' }}>{componente.ala} | #{componente.id}</div>
                <div style={{ marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
                  <IndicadorCarteirinha componente={componente} aoGerar={marcarCarteirinhaGerada} />
                </div>
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
