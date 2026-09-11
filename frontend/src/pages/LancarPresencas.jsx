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
        // A chamada considera apenas os componentes renovados (coluna N = "Sim"):
        // é esse o total usado para o número de ausentes e as estatísticas por ala.
        const comp = (res.data.componentes || []).filter(c => c.renovado === 'Sim');
        setComponentesBase(comp);
        setTotalAusentesManual(comp.length);
        const alasUnicas = [...new Set(comp.map(c => c.ala))].filter(Boolean).sort();
        setListaAlas(alasUnicas);
      })
      .catch(err => console.error(err))
      .finally(() => setCarregando(false));
  }, []);

  // Busca por nome (parcial) ou por ID. O ID é salvo com 8 dígitos e zeros à
  // esquerda ("00000012"), então aceitamos tanto o número digitado ("12")
  // quanto trechos do ID completo.
  const filtrarComponentes = (termo) => {
    const t = termo.trim().toLowerCase();
    if (!t) return [];
    const tNum = t.replace(/\D/g, '');
    return componentesBase.filter(c => {
      if (presentesNaQuadra.some(p => p.id === c.id)) return false;
      if (c.nome.toLowerCase().includes(t)) return true;
      const id = String(c.id).toLowerCase();
      if (id.includes(t)) return true;
      return tNum !== '' && id.replace(/^0+/, '') === tNum.replace(/^0+/, '');
    });
  };

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

  const gerarPdfFrequencia = async () => {
    try {
      const { data } = await api.get('/frequencia-geral');
      const totalEnsaios = data.totalEnsaios || 0;
      const componentes = (data.componentes || [])
        .filter(c => c.renovado === 'Sim')
        .sort((a, b) => a.nome.localeCompare(b.nome));

      // Agrupa os componentes por ala
      const porAla = {};
      componentes.forEach(c => {
        const ala = c.ala || 'Sem Ala';
        if (!porAla[ala]) porAla[ala] = [];
        porAla[ala].push(c);
      });

      const blocosAla = Object.keys(porAla).sort().map(ala => {
        const lista = porAla[ala];
        const totalPres = lista.reduce((s, c) => s + c.presencas, 0);
        const totalAus = lista.reduce((s, c) => s + c.ausencias, 0);
        const linhas = lista.map((c, i) => `
          <tr>
            <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center;color:#000;">${i + 1}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;text-transform:uppercase;font-weight:bold;color:#000;">${c.nome}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center;color:#005c33;font-weight:bold;">${c.presencas}</td>
            <td style="padding:6px;border-bottom:1px solid #ddd;text-align:center;color:#ef4444;font-weight:bold;">${c.ausencias}</td>
          </tr>`).join('');
        return `
          <div style="margin-bottom:28px;page-break-inside:avoid;">
            <h3 style="color:#005c33;margin:0 0 6px 0;text-transform:uppercase;border-bottom:2px solid #005c33;padding-bottom:4px;">
              Ala: ${ala} <span style="font-size:13px;color:#666;font-weight:normal;">(${lista.length} componente(s))</span>
            </h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr>
                  <th style="background:#005c33;color:#fff;padding:8px;width:6%;text-align:center;">Nº</th>
                  <th style="background:#005c33;color:#fff;padding:8px;width:54%;text-align:left;">Nome Completo</th>
                  <th style="background:#005c33;color:#fff;padding:8px;width:20%;text-align:center;">Presenças</th>
                  <th style="background:#005c33;color:#fff;padding:8px;width:20%;text-align:center;">Ausências</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding:8px;text-align:right;font-weight:bold;color:#000;border-top:2px solid #000;">Total da Ala:</td>
                  <td style="padding:8px;text-align:center;font-weight:bold;color:#005c33;border-top:2px solid #000;">${totalPres}</td>
                  <td style="padding:8px;text-align:center;font-weight:bold;color:#ef4444;border-top:2px solid #000;">${totalAus}</td>
                </tr>
              </tfoot>
            </table>
          </div>`;
      }).join('');

      const janela = window.open('', '_blank');
      janela.document.write(`
        <html>
          <head>
            <title>Relatório de Frequência por Ala - Mancha Verde</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
              .header { text-align:center; border-bottom:2px solid #005c33; padding-bottom:10px; margin-bottom:20px; }
              .title { color:#005c33; margin:0; font-size:22px; text-transform:uppercase; }
              .barra-acoes { text-align:center; margin-bottom:25px; }
              .barra-acoes button { padding:10px 22px; margin:0 6px; border:none; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; }
              .btn-imprimir { background:#005c33; color:#fff; }
              .btn-fechar { background:#e2e8f0; color:#1e293b; }
              @media print { .barra-acoes { display:none; } body { margin:0; } }
            </style>
          </head>
          <body>
            <div class="barra-acoes">
              <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir</button>
              <button class="btn-fechar" onclick="window.close()">Fechar</button>
            </div>
            <div class="header">
              <h1 class="title">G.R.C.E.S. Mancha Verde</h1>
              <h2>Relatório de Frequência por Ala</h2>
              <div style="font-size:12px;color:#666;">
                Emitido em: ${new Date().toLocaleDateString('pt-BR')} | Total de ensaios: ${totalEnsaios} | Componentes renovados: ${componentes.length}
              </div>
              <div style="font-size:11px;color:#888;margin-top:4px;">
                As ausências de cada componente são contadas a partir da data de cadastro dele.
              </div>
            </div>
            ${blocosAla || '<p style="text-align:center;color:#666;">Nenhum componente renovado encontrado.</p>'}
          </body>
        </html>
      `);
      janela.document.close();
    } catch (err) {
      console.error('Erro ao gerar PDF de frequência:', err);
      setMensagem({ texto: 'Falha ao gerar o PDF de frequência.', tipo: 'erro' });
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
    }
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
            {filtrarComponentes(termoBusca).map(comp => (
              <div key={comp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ color: '#000000', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '13px' }}>#{comp.id} - {comp.nome} <span style={{ color: '#64748b' }}>({comp.ala})</span></span>
                <button onClick={() => marcarPresente(comp)} style={{ padding: '6px 12px', backgroundColor: '#005c33', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>Confirmar</button>
              </div>
            ))}
            {filtrarComponentes(termoBusca).length === 0 && (
              <div style={{ padding: '10px 15px', color: '#64748b', fontSize: '13px' }}>Nenhum componente encontrado.</div>
            )}
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

      <button onClick={gerarPdfFrequencia} style={{ width: '100%', marginTop: '12px', padding: '14px', backgroundColor: '#005c33', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        📄 Ver Relatório de Frequência por Ala
      </button>
    </div>
  );
}

export default LancarPresencas;