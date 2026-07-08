import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function LancarPresencas() {
  const hoje = new Date().toISOString().split('T')[0];
  const [dataEnsaio, setDataEnsaio] = useState(hoje);
  const [termoBusca, setTermoBusca] = useState('');
  const [componentesBase, setComponentesBase] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState({ texto: '', tipo: '' });
  const [listaAlas, setListaAlas] = useState([]);
  const [presentesNaQuadra, setPresentesNaQuadra] = useState([]);
  const [totalPresentesManual, setTotalPresentesManual] = useState(0);
  const [totalAusentesManual, setTotalAusentesManual] = useState(0);
  const [alaFiltroVisuais, setAlaFiltroVisuais] = useState('TODAS');

  useEffect(() => {
    api.get('/dados-relatorio')
      .then(res => {
        const comp = res.data.componentes || [];
        setComponentesBase(comp);
        setTotalAusentesManual(comp.length);
        const alasUnicas = [...new Set(comp.map(c => c.ala))].filter(Boolean).sort();
        setListaAlas(alasUnicas);
      })
      .catch(err => console.error(err))
      .finally(() => setCarregando(false));
  }, []);

  const resultadosBusca = componentesBase.filter(c => {
    if (!termoBusca) return false;
    if (presentesNaQuadra.some(p => p.id === c.id)) return false; 
    const buscaLower = termoBusca.toLowerCase();
    return c.nome.toLowerCase().includes(buscaLower) || c.id === termoBusca;
  });

  const marcarPresente = (componente) => {
    const novaLista = [...presentesNaQuadra, componente];
    setPresentesNaQuadra(novaLista);
    setTotalPresentesManual(novaLista.length);
    setTotalAusentesManual(componentesBase.length - novaLista.length);
    setTermoBusca('');
  };

  const removerPresente = (idParaRemover) => {
    const novaLista = presentesNaQuadra.filter(p => p.id !== idParaRemover);
    setPresentesNaQuadra(novaLista);
    setTotalPresentesManual(novaLista.length);
    setTotalAusentesManual(componentesBase.length - novaLista.length);
  };

  const salvarEnsaioCompleto = async () => {
    if (!dataEnsaio) {
      setMensagem({ texto: 'A data do ensaio é obrigatória.', tipo: 'erro' });
      return;
    }

    // NOVA MATEMÁTICA: Calcula presentes e ausentes específicos de cada ala
    const estatisticasAlas = listaAlas.map(ala => {
      const pres = presentesNaQuadra.filter(p => p.ala === ala).length;
      const totalDaAla = componentesBase.filter(c => c.ala === ala).length;
      const aus = totalDaAla - pres;
      return { ala, presentes: pres, ausentes: aus };
    });

    try {
      await api.post('/registrar-ensaio-completo', {
        data: dataEnsaio.split('-').reverse().join('/'),
        presentes: totalPresentesManual,
        ausentes: totalAusentesManual,
        listaNominal: presentesNaQuadra,
        estatisticasAlas: estatisticasAlas // Envia os dados avançados para o Sheets
      });
      
      setMensagem({ texto: 'Dados salvos com sucesso na planilha exclusiva!', tipo: 'sucesso' });
      
      // Reseta a tela perfeitamente sem travar
      setPresentesNaQuadra([]);
      setTotalPresentesManual(0);
      setTotalAusentesManual(componentesBase.length);
      setDataEnsaio(hoje);
    } catch (err) {
      setMensagem({ texto: 'Falha ao salvar ensaio.', tipo: 'erro' });
    }
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
  };

  if (carregando) return <div style={{ textAlign: 'center', marginTop: '50px', color: '#000000', fontWeight: 'bold' }}>Carregando...</div>;

  return (
    <div style={{ maxWidth: '850px', margin: '30px auto', padding: '25px', backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #e2e8f0', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#005c33', textAlign: 'center', margin: '0 0 5px 0', fontWeight: 'bold' }}>Diário de Frequência Nominal</h2>
      <p style={{ color: '#64748b', textAlign: 'center', margin: '0 0 25px 0', fontSize: '14px', fontWeight: '500' }}>Armazenamento isolado por datas no banco de dados secundário</p>

      {mensagem.texto && (
        <div style={{ padding: '12px', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold', textAlign: 'center', backgroundColor: mensagem.tipo === 'sucesso' ? '#d1e7dd' : '#f8d7da', color: mensagem.tipo === 'sucesso' ? '#0f5132' : '#842029' }}>
          {mensagem.texto}
        </div>
      )}

      {/* PAINEL DE ENTRADAS - ORGANIZADO */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000000' }}>Data do Ensaio:</label>
          <input type="date" value={dataEnsaio} onChange={(e) => setDataEnsaio(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, minWidth: '140px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000000' }}>Presentes:</label>
          <input type="number" value={totalPresentesManual} onChange={(e) => setTotalPresentesManual(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, minWidth: '140px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000000' }}>Ausentes:</label>
          <input type="number" value={totalAusentesManual} onChange={(e) => setTotalAusentesManual(parseInt(e.target.value) || 0)} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* CAMPO DE BUSCA HIGIENIZADO */}
      <div style={{ marginBottom: '25px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 'bold', color: '#000000' }}>Pesquisar Componente:</label>
        <input type="text" placeholder="Digite nome ou ID do integrante..." value={termoBusca} onChange={(e) => setTermoBusca(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #005c33', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', boxSizing: 'border-box' }} />
        
        {termoBusca && (
          <div style={{ marginTop: '4px', border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', backgroundColor: '#FFFFFF' }}>
            {componentesBase.filter(c => !presentesNaQuadra.some(p => p.id === c.id) && (c.nome.toLowerCase().includes(termoBusca.toLowerCase()) || c.id === termoBusca)).map(comp => (
              <div key={comp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#000000', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '13px' }}>{comp.nome} <span style={{ color: '#64748b' }}>({comp.ala})</span></span>
                <button onClick={() => marcarPresente(comp)} style={{ padding: '6px 12px', backgroundColor: '#005c33', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>Confirmar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CONTAINER DE EXIBIÇÃO DA CHAMADA */}
      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px', marginBottom: '25px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Integrantes na Quadra ({presentesNaQuadra.length})</h4>
          <select value={alaFiltroVisuais} onChange={(e) => setAlaFiltroVisuais(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#000000', backgroundColor: '#FFFFFF', fontWeight: 'bold', fontSize: '13px' }}>
            <option value="TODAS">Visualizar Todas as Alas</option>
            {listaAlas.map(ala => <option key={ala} value={ala}>{ala.toUpperCase()}</option>)}
          </select>
        </div>

        <div style={{ maxHeight: '200px', overflowY: 'auto', backgroundColor: '#f8fafc', borderRadius: '4px', padding: '8px', border: '1px solid #f1f5f9' }}>
          {presentesNaQuadra.filter(p => alaFiltroVisuais === 'TODAS' || p.ala === alaFiltroVisuais).length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '15px', fontSize: '13px' }}>Nenhum integrante listado neste filtro.</div>
          ) : (
            presentesNaQuadra.filter(p => alaFiltroVisuais === 'TODAS' || p.ala === alaFiltroVisuais).map(p => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px', borderBottom: '1px solid #e2e8f0', alignItems: 'center' }}>
                <span style={{ color: '#000000', fontSize: '13px', fontWeight: 'bold' }}>#{p.id} - {p.nome} <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '10px', marginLeft: '5px' }}>{p.ala}</span></span>
                <button onClick={() => removerPresente(p.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>Remover</button>
              </div>
            ))
          )}
        </div>
      </div>

      <button onClick={salvarEnsaioCompleto} style={{ width: '100%', padding: '14px', backgroundColor: '#1e293b', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        💾 Encerrar Chamada e Criar Guia Temporal
      </button>
    </div>
  );
}

export default LancarPresencas;