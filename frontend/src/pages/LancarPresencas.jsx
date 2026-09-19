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

  const [idsImportar, setIdsImportar] = useState('');
  const [substituirImportacao, setSubstituirImportacao] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultadoImportacao, setResultadoImportacao] = useState(null);
  const [consultandoData, setConsultandoData] = useState(false);
  const [consultaData, setConsultaData] = useState(null);
  const [recalculando, setRecalculando] = useState(false);

  useEffect(() => {
    api.get('/dados-relatorio')
      .then(res => {
        // A chamada considera apenas os componentes renovados (coluna N = "Sim"):
        // é esse o total usado para o número de ausentes e as estatísticas por ala.
        const comp = (res.data.componentes || []).filter(c => c.renovado === 'Sim');
        setComponentesBase(comp);
        setTotalAusentesManual(0);
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

    try {
      // O servidor recalcula presentes/ausentes (geral e por ala) a partir da
      // lista nominal — ela é a fonte de verdade da chamada. Um ensaio sem
      // nenhum presente é rejeitado (não vira uma data fantasma nos relatórios).
      await api.post('/registrar-ensaio-completo', {
        data: dataEnsaio.split('-').reverse().join('/'),
        listaNominal: presentesNaQuadra,
      });

      setMensagem({ texto: 'Dados salvos com sucesso na planilha exclusiva!', tipo: 'sucesso' });

      // Reseta a tela perfeitamente sem travar
      setPresentesNaQuadra([]);
      setTotalPresentesManual(0);
      setTotalAusentesManual(componentesBase.length);
      setDataEnsaio(hoje);
    } catch (err) {
      setMensagem({ texto: err.response?.data?.error || 'Falha ao salvar ensaio.', tipo: 'erro' });
    }
    setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
  };

  const consultarData = async () => {
    if (!dataEnsaio) {
      setMensagem({ texto: 'Selecione uma data para consultar.', tipo: 'erro' });
      return;
    }
    setConsultandoData(true);
    setConsultaData(null);
    try {
      const { data } = await api.get(`/presencas-da-data?data=${encodeURIComponent(dataEnsaio)}`);
      setConsultaData(data);
      setTotalPresentesManual(data.presentes);
      setTotalAusentesManual(data.ausentes);
    } catch (err) {
      console.error(err);
      setMensagem({ texto: err.response?.data?.error || 'Falha ao consultar a data.', tipo: 'erro' });
    } finally {
      setConsultandoData(false);
    }
  };

  const importarPresencas = async () => {
    const listaIds = idsImportar.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    if (!dataEnsaio) {
      setMensagem({ texto: 'Selecione a data do ensaio antes de importar.', tipo: 'erro' });
      return;
    }
    if (listaIds.length === 0) {
      setMensagem({ texto: 'Cole ao menos um ID na caixa de importação.', tipo: 'erro' });
      return;
    }

    setImportando(true);
    setResultadoImportacao(null);
    try {
      const { data } = await api.post('/importar-presencas', {
        data: dataEnsaio,
        ids: listaIds,
        modo: substituirImportacao ? 'substituir' : 'mesclar',
      });
      setResultadoImportacao(data);
      setMensagem({
        texto: `Importação concluída para ${data.data}: ${data.adicionados} ID(s) do cadastro processado(s), ${data.totalPresentesNaData} presente(s) no total nessa data.`,
        tipo: 'sucesso',
      });
      setIdsImportar('');
    } catch (err) {
      console.error(err);
      setMensagem({ texto: err.response?.data?.error || 'Falha ao importar a lista de IDs.', tipo: 'erro' });
    } finally {
      setImportando(false);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 6000);
    }
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

  const recalcularPresencas = async () => {
    if (!window.confirm('Isso vai recalcular os resumos de presença (Geral, Alas e matrizes por ala) a partir das chamadas reais, removendo datas sem nenhuma presença registrada. Continuar?')) return;

    setRecalculando(true);
    try {
      await api.post('/recalcular-presencas');
      setMensagem({ texto: 'Resumos de presença recalculados com sucesso. Datas sem presença registrada foram removidas da contagem.', tipo: 'sucesso' });
    } catch (err) {
      console.error('Erro ao recalcular presenças:', err);
      setMensagem({ texto: err.response?.data?.error || 'Falha ao recalcular os resumos de presença.', tipo: 'erro' });
    } finally {
      setRecalculando(false);
      setTimeout(() => setMensagem({ texto: '', tipo: '' }), 6000);
    }
  };

  const gerarRelatorioMatrizPresencas = async () => {
    try {
      const { data } = await api.get('/matriz-presencas');
      const { datas, componentes } = data;

      if (!datas || datas.length === 0) {
        setMensagem({ texto: 'Ainda não há nenhum ensaio registrado para montar o relatório.', tipo: 'erro' });
        setTimeout(() => setMensagem({ texto: '', tipo: '' }), 4000);
        return;
      }

      const celula = (marca) => {
        if (marca === 'P') return '<td style="padding:6px;text-align:center;background:#e8f5e9;color:#005c33;font-weight:bold;border:1px solid #cbd5e1;">P</td>';
        if (marca === 'A') return '<td style="padding:6px;text-align:center;background:#fdeaea;color:#ef4444;font-weight:bold;border:1px solid #cbd5e1;">A</td>';
        return '<td style="padding:6px;text-align:center;color:#cbd5e1;border:1px solid #cbd5e1;">—</td>';
      };

      const linhasHtml = componentes.map((c, i) => `
        <tr>
          <td style="padding:6px;text-align:center;border:1px solid #cbd5e1;color:#000;">${i + 1}</td>
          <td style="padding:6px;border:1px solid #cbd5e1;color:#000;white-space:nowrap;">#${c.id}</td>
          <td style="padding:6px;border:1px solid #cbd5e1;text-transform:uppercase;font-weight:bold;color:#000;white-space:nowrap;">${c.nome}</td>
          <td style="padding:6px;border:1px solid #cbd5e1;text-align:center;color:#000;white-space:nowrap;">${c.ala}</td>
          ${datas.map(d => celula(c.marcas[d])).join('')}
        </tr>`).join('');

      const colunasData = datas.map(d => `<th style="background:#005c33;color:#fff;padding:8px;text-align:center;white-space:nowrap;">${d}</th>`).join('');

      const janela = window.open('', '_blank');
      janela.document.write(`
        <html>
          <head>
            <title>Relatório de Presenças por Data - Mancha Verde</title>
            <style>
              @page { size: landscape; margin: 12mm; }
              body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
              .header { text-align:center; border-bottom:2px solid #005c33; padding-bottom:10px; margin-bottom:20px; }
              .title { color:#005c33; margin:0; font-size:22px; text-transform:uppercase; }
              .barra-acoes { text-align:center; margin-bottom:25px; }
              .barra-acoes button { padding:10px 22px; margin:0 6px; border:none; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; }
              .btn-imprimir { background:#005c33; color:#fff; }
              .btn-fechar { background:#e2e8f0; color:#1e293b; }
              table { border-collapse: collapse; width: 100%; font-size: 12px; }
              th { border: 1px solid #cbd5e1; }
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
              <h2>Relatório de Presenças e Ausências por Data</h2>
              <div style="font-size:12px;color:#666;">
                Emitido em: ${new Date().toLocaleDateString('pt-BR')} | Ensaios: ${datas.length} | Componentes: ${componentes.length}
              </div>
              <div style="font-size:11px;color:#888;margin-top:4px;">
                P = presente · A = ausente · — = ainda não cadastrado nessa data
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="background:#005c33;color:#fff;padding:8px;">Nº</th>
                  <th style="background:#005c33;color:#fff;padding:8px;">ID</th>
                  <th style="background:#005c33;color:#fff;padding:8px;text-align:left;">Nome Completo</th>
                  <th style="background:#005c33;color:#fff;padding:8px;">Ala</th>
                  ${colunasData}
                </tr>
              </thead>
              <tbody>${linhasHtml}</tbody>
            </table>
          </body>
        </html>
      `);
      janela.document.close();
    } catch (err) {
      console.error('Erro ao gerar relatório de presenças por data:', err);
      setMensagem({ texto: 'Falha ao gerar o relatório de presenças por data.', tipo: 'erro' });
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
          <input type="date" value={dataEnsaio} onChange={(e) => { setDataEnsaio(e.target.value); setConsultaData(null); }} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', boxSizing: 'border-box' }} />
          <button
            type="button"
            onClick={consultarData}
            disabled={consultandoData}
            style={{ marginTop: '6px', width: '100%', padding: '8px', backgroundColor: '#334155', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
          >
            {consultandoData ? 'Consultando...' : '🔍 Consultar esta data'}
          </button>
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

      {consultaData && (
        <div style={{ marginBottom: '25px', padding: '12px 15px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '14px', color: '#000000' }}>
          {consultaData.existe ? (
            <>
              <strong>Data {consultaData.data}:</strong>{' '}
              <span style={{ color: '#005c33', fontWeight: 'bold' }}>{consultaData.presentes} presente(s)</span>
              {' · '}
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>{consultaData.ausentes} ausente(s)</span>
              <span style={{ color: '#64748b' }}> (base: componentes renovados)</span>
            </>
          ) : (
            <span style={{ color: '#64748b', fontWeight: 'bold' }}>Nenhuma chamada registrada para {consultaData.data}.</span>
          )}
        </div>
      )}

      {consultaData && consultaData.existe && (
        <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Chamada de {consultaData.data} — lista nominal</h4>
            <select value={alaFiltroVisuais} onChange={(e) => setAlaFiltroVisuais(e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1', color: '#000000', backgroundColor: '#FFFFFF', fontWeight: 'bold', fontSize: '13px' }}>
              <option value="TODAS">Visualizar Todas as Alas</option>
              {listaAlas.map(ala => <option key={ala} value={ala}>{ala.toUpperCase()}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: '280px', overflowY: 'auto', backgroundColor: '#f8fafc', borderRadius: '4px', padding: '8px', border: '1px solid #f1f5f9' }}>
            {[
              ...(consultaData.listaPresentes || []).map(c => ({ ...c, presente: true })),
              ...(consultaData.listaAusentes || []).map(c => ({ ...c, presente: false })),
            ]
              .filter(c => alaFiltroVisuais === 'TODAS' || c.ala === alaFiltroVisuais)
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
                  <span style={{ color: '#000000', fontSize: '13px', fontWeight: 'bold' }}>#{c.id} - {c.nome} <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', padding: '2px 6px', borderRadius: '10px', marginLeft: '5px' }}>{c.ala}</span></span>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', color: c.presente ? '#005c33' : '#ef4444' }}>
                    {c.presente ? '✅ Presente' : '❌ Ausente'}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

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

      {/* IMPORTAÇÃO DE LISTA DE IDs */}
      <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', padding: '15px', marginBottom: '25px', backgroundColor: '#f8fafc' }}>
        <h4 style={{ margin: '0 0 6px 0', color: '#000000', fontWeight: 'bold' }}>Importar lista de IDs</h4>
        <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#64748b' }}>
          Cole os IDs (um por linha ou separados por vírgula/espaço). O sistema busca nome e ala pelo cadastro
          e contabiliza como presença na data <strong>{dataEnsaio.split('-').reverse().join('/')}</strong>.
        </p>
        <textarea
          value={idsImportar}
          onChange={(e) => setIdsImportar(e.target.value)}
          placeholder={'00000012\n00000034\n45'}
          rows={5}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontFamily: 'monospace', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
          <label style={{ fontSize: '13px', color: '#000000', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <input type="checkbox" checked={substituirImportacao} onChange={(e) => setSubstituirImportacao(e.target.checked)} />
            Substituir a lista do dia (em vez de mesclar)
          </label>
          <button
            onClick={importarPresencas}
            disabled={importando}
            style={{ padding: '10px 18px', backgroundColor: '#005c33', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
          >
            {importando ? 'Importando...' : 'Importar e contabilizar'}
          </button>
        </div>
        {resultadoImportacao && resultadoImportacao.naoEncontrados && resultadoImportacao.naoEncontrados.length > 0 && (
          <div style={{ marginTop: '10px', padding: '10px', borderRadius: '6px', backgroundColor: '#fff4e5', border: '1px solid #f59e0b', fontSize: '13px', color: '#000000' }}>
            <strong>{resultadoImportacao.naoEncontrados.length} ID(s) não encontrado(s) no cadastro</strong> (não contabilizados):
            <div style={{ marginTop: '4px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {resultadoImportacao.naoEncontrados.join(', ')}
            </div>
          </div>
        )}
      </div>

      <button onClick={salvarEnsaioCompleto} style={{ width: '100%', padding: '14px', backgroundColor: '#1e293b', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        💾 Encerrar Chamada e Criar Guia Temporal
      </button>

      <button onClick={gerarPdfFrequencia} style={{ width: '100%', marginTop: '12px', padding: '14px', backgroundColor: '#005c33', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        📄 Ver Relatório de Frequência por Ala
      </button>

      <button onClick={gerarRelatorioMatrizPresencas} style={{ width: '100%', marginTop: '12px', padding: '14px', backgroundColor: '#2563eb', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        📊 Ver Relatório de Presenças por Data (Paisagem)
      </button>

      <button onClick={recalcularPresencas} disabled={recalculando} style={{ width: '100%', marginTop: '12px', padding: '14px', backgroundColor: '#64748b', color: '#FFFFFF', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
        {recalculando ? 'Recalculando...' : '🔄 Corrigir Contagem (remover datas sem presença)'}
      </button>
    </div>
  );
}

export default LancarPresencas;