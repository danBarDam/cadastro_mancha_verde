import React, { useState } from 'react';
import api from '../utils/api';
import { converterLinkDrive } from '../utils/imagem';
import ModalEdicaoCadastro from '../components/ModalEdicaoCadastro';

function Pesquisa() {
  const [termoBusca, setTermoBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [componenteEdicao, setComponenteEdicao] = useState(null);
  const [frequencias, setFrequencias] = useState({});

  const buscarFrequencias = (lista) => {
    lista.forEach(async (componente) => {
      try {
        const resposta = await api.get(`/frequencia/${componente.id}`);
        setFrequencias((prev) => ({ ...prev, [componente.id]: resposta.data }));
      } catch (err) {
        console.error('Erro ao buscar frequência:', err);
      }
    });
  };

  const lidarComBusca = async (e) => {
    e.preventDefault();
    if (!termoBusca.trim()) return;

    setCarregando(true);
    setErro('');
    setResultados([]);
    setFrequencias({});

    try {
      // Faz a requisição enviando o termo na URL (Query Parameter)
      const resposta = await api.get(`/buscar?termo=${termoBusca}`);
      setResultados(resposta.data);
      buscarFrequencias(resposta.data);

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

  const excluirCadastro = async (id) => {
    if (!window.confirm("Deseja realmente excluir este cadastro?")) return;

    try {
      await api.delete(`/excluir-cadastro/${id}`);
      setResultados((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Erro ao excluir cadastro:', err);
      alert('Erro ao excluir o cadastro. Tente novamente.');
    }
  };

  const alternarRenovacao = async (componente) => {
    const novoValor = componente.renovado === 'Sim' ? 'Não' : 'Sim';

    try {
      await api.put(`/marcar-renovacao/${componente.id}`, { renovado: novoValor });
      setResultados((prev) => prev.map((item) => (
        item.id === componente.id ? { ...item, renovado: novoValor } : item
      )));
    } catch (err) {
      console.error('Erro ao marcar renovação:', err);
      alert('Erro ao atualizar a renovação. Tente novamente.');
    }
  };

  return (
    <div className="container" style={{ maxWidth: '900px', margin: '40px auto', padding: '0 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ color: '#005c33', marginBottom: '10px' }}>Consulta de Componentes</h2>
        <p style={{ color: '#64748b' }}>Digite o nome ou o CPF para localizar a inscrição na planilha</p>
      </div>

      {/* Formulário de Busca */}
      <form onSubmit={lidarComBusca} style={{ display: 'flex', gap: '10px', marginBottom: '40px' }}>
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

      {/* Mensagens de Feedback */}
      {erro && <div style={{ textAlign: 'center', color: '#ef4444', fontWeight: 'bold', margin: '20px 0' }}>{erro}</div>}

      {/* Lista de Resultados */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {resultados.map((componente) => (
          <div
            key={componente.id}
            style={{
              display: 'flex',
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              borderLeft: '5px solid #005c33',
              alignItems: 'center',
              gap: '20px',
              flexWrap: 'wrap'
            }}
          >
            {/* Foto do Componente */}
            <div style={{ width: '100px', height: '100px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0 }}>
              {componente.fotoUrl ? (
                <img
                  src={converterLinkDrive(componente.fotoUrl)}
                  alt={componente.nome}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>👤</div>
              )}
            </div>

            {/* Informações Pessoais e de Ala */}
            <div style={{ flex: 1, minWidth: '250px' }}>
              <h3 style={{ margin: '0 0 5px 0', color: '#1e293b', textTransform: 'uppercase' }}>{componente.nome}</h3>
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#64748b' }}>
                <strong>CPF:</strong> {componente.cpf} | <strong>WhatsApp:</strong> {componente.telefone || 'Não informado'}
              </p>
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#64748b' }}>
                <strong>Inscrição:</strong> #{componente.id}
              </p>
              <p style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#64748b' }}>
                <strong>Endereço:</strong> {componente.rua}, {componente.numero} - {componente.bairro}
              </p>
              <p style={{ margin: '0', fontSize: '14px', color: '#64748b' }}>
                <strong>Frequência:</strong>{' '}
                {frequencias[componente.id]
                  ? `${frequencias[componente.id].presencas} presenças / ${frequencias[componente.id].ausencias} faltas`
                  : 'Calculando...'}
              </p>
            </div>

            {/* Crachá da Ala e Renovação */}
            <div style={{ textAlign: 'right', minWidth: '150px' }}>
              <span style={{
                backgroundColor: '#e8f5e9',
                color: '#005c33',
                padding: '6px 12px',
                borderRadius: '20px',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'inline-block',
                marginBottom: '5px'
              }}>
                ALA: {componente.ala}
              </span>
              <br />
              <span style={{
                backgroundColor: componente.renovado === 'Sim' ? '#e8f5e9' : '#f1f5f9',
                color: componente.renovado === 'Sim' ? '#005c33' : '#64748b',
                padding: '6px 12px',
                borderRadius: '20px',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'inline-block',
                marginBottom: '5px'
              }}>
                RENOVADO: {componente.renovado === 'Sim' ? 'SIM' : 'NÃO'}
              </span>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Cadastrado em: {componente.data}</div>
            </div>

            {/* Botões de Ação */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={() => setComponenteEdicao(componente)} style={{ padding: '8px 12px', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                ✏️ Editar
              </button>
              <button
                onClick={() => alternarRenovacao(componente)}
                style={{ padding: '8px 12px', backgroundColor: componente.renovado === 'Sim' ? '#64748b' : '#005c33', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {componente.renovado === 'Sim' ? '↩️ Desmarcar Renovação' : '✅ Marcar Renovação'}
              </button>
              <button onClick={() => excluirCadastro(componente.id)} style={{ padding: '8px 12px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                🗑️ Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      <ModalEdicaoCadastro
        componente={componenteEdicao}
        aoFechar={() => setComponenteEdicao(null)}
        aoSalvar={(atualizado) => {
          setResultados((prev) => prev.map((item) => (item.id === atualizado.id ? atualizado : item)));
          setComponenteEdicao(null);
        }}
      />
    </div>
  );
}

export default Pesquisa;
