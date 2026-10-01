import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function Relatorios() {
  const [componentes, setComponentes] = useState([]);
  const [todasAlas, setTodasAlas] = useState([]);
  const [limites, setLimites] = useState({});
  const [presencas, setPresencas] = useState([]);
  const [historicoAlas, setHistoricoAlas] = useState([]);
  const [frequenciaPorId, setFrequenciaPorId] = useState({});
  const [ensaiosPorTipo, setEnsaiosPorTipo] = useState({ comuns: 0, especiais: 0 });
  const [resumoQuadra, setResumoQuadra] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [alaFiltro, setAlaFiltro] = useState('TODAS'); // Filtro da Tabela e PDFs
  const [alaSelecionadaGrafico, setAlaSelecionadaGrafico] = useState('TODAS'); // Filtro do Gráfico Detalhado
  const [alaFiltroEvolucao, setAlaFiltroEvolucao] = useState('TODAS'); // Filtro do Novo Gráfico de Inscrições
  const [alaFiltroNovosRenovacoes, setAlaFiltroNovosRenovacoes] = useState('TODAS'); // Filtro do Gráfico Novos x Renovações
  const [filtroPizzaQuadra, setFiltroPizzaQuadra] = useState('alas'); // 'alas' | 'especiais' | 'todos'
  const [fatiaEmFoco, setFatiaEmFoco] = useState(null); // índice da fatia com hover, p/ destaque + centro do donut

  useEffect(() => {
    puxarDados();
  }, []);

  const puxarDados = async () => {
    try {
      const [resposta, respostaAlas, respostaFreq, respostaQuadra] = await Promise.all([
        api.get('/dados-relatorio'),
        api.get('/alas'),
        api.get('/frequencia-geral'),
        api.get('/ultimo-ensaio-resumo'),
      ]);
      setResumoQuadra(respostaQuadra.data);
      const mapaFreq = {};
      (respostaFreq.data.componentes || []).forEach((c) => {
        mapaFreq[c.id] = { presencas: c.presencas, ausencias: c.ausencias };
      });
      setFrequenciaPorId(mapaFreq);
      setEnsaiosPorTipo({
        comuns: respostaFreq.data.totalEnsaiosComuns || 0,
        especiais: respostaFreq.data.totalEnsaiosEspeciais || 0,
      });
      // Relatórios e PDFs consideram apenas os cadastros marcados como renovados
      const componentesRenovados = (resposta.data.componentes || []).filter((c) => c.renovado === 'Sim');
      setComponentes(componentesRenovados);
      // Lista oficial de alas (independe de quantos já renovaram, senão uma ala sem
      // nenhum renovado ainda some dos filtros e do painel de ocupação)
      setTodasAlas(respostaAlas.data.alas || []);
      setLimites(resposta.data.limitesAlas || {});
      setPresencas(resposta.data.dadosPresencas || []);
      setHistoricoAlas(resposta.data.historicoAlas || []);
    } catch (err) {
      console.error('Erro ao carregar relatórios:', err);
    } finally {
      setCarregando(false);
    }
  };

  // =========================================================================
  // 1. ÁREA DE MATEMÁTICA E PROCESSAMENTO (ANTES DO RETURN)
  // =========================================================================

  const totalInscritos = componentes.length;
  const totalVagasGeral = Object.values(limites).reduce((acc, valor) => acc + (parseInt(valor) || 0), 0);

  const contagemPorAla = componentes.reduce((acc, comp) => {
    const nomeAla = comp.ala || 'Sem Ala';
    acc[nomeAla] = (acc[nomeAla] || 0) + 1;
    return acc;
  }, {});

  // --- PROCESSAMENTO: GRÁFICO DE PIZZA "QUEM ESTÁ NA QUADRA" (último ensaio) ---
  // Paleta categórica fixa (8 tons, ordem validada p/ distinção sob daltonismo).
  const PALETA_CATEGORICA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
  const COR_OUTROS = '#898781';
  // Diretoria/Convidados/Crianças mantêm sempre a mesma cor, em qualquer filtro
  // onde apareçam (identidade não muda ao trocar de visão) — alas usam o resto
  // da paleta por ordem de presença, já que são até ~25 e mudam a cada ensaio.
  const CORES_ESPECIAIS = { Diretoria: PALETA_CATEGORICA[0], Convidados: PALETA_CATEGORICA[1], 'Crianças': PALETA_CATEGORICA[2] };

  const alasPresentesOrdenadas = resumoQuadra
    ? Object.entries(resumoQuadra.presentesPorAla || {})
        .map(([ala, valor]) => ({ ala, valor, totalAla: contagemPorAla[ala] || valor }))
        .sort((a, b) => b.valor - a.valor)
    : [];

  // Agrupa o rabo em "Outras alas" para não estourar o teto de fatias legíveis numa pizza.
  const montarFatiasAlas = (maxIndividuais, slotsPaleta) => {
    const top = alasPresentesOrdenadas.slice(0, maxIndividuais);
    const resto = alasPresentesOrdenadas.slice(maxIndividuais);
    const fatias = top.map((e, i) => {
      const pctAla = e.totalAla > 0 ? ((e.valor / e.totalAla) * 100).toFixed(1) : '0';
      return { label: e.ala, valor: e.valor, cor: slotsPaleta[i % slotsPaleta.length], detalhe: `${e.valor}/${e.totalAla} componentes da ala (${pctAla}%)` };
    });
    if (resto.length > 0) {
      const valorResto = resto.reduce((acc, e) => acc + e.valor, 0);
      const totalResto = resto.reduce((acc, e) => acc + e.totalAla, 0);
      const pctResto = totalResto > 0 ? ((valorResto / totalResto) * 100).toFixed(1) : '0';
      fatias.push({ label: `Outras alas (${resto.length})`, valor: valorResto, cor: COR_OUTROS, detalhe: `${valorResto}/${totalResto} componentes dessas alas (${pctResto}%)` });
    }
    return fatias;
  };

  const montarFatiasEspeciais = () => {
    if (!resumoQuadra) return [];
    const esp = resumoQuadra.especiais || {};
    const totalEspeciais = (esp.diretoria || 0) + (esp.convidados || 0) + (esp.criancas || 0);
    return [
      { label: 'Diretoria', valor: esp.diretoria || 0 },
      { label: 'Convidados', valor: esp.convidados || 0 },
      { label: 'Crianças', valor: esp.criancas || 0 },
    ]
      .filter(c => c.valor > 0)
      .map(c => ({ ...c, cor: CORES_ESPECIAIS[c.label], detalhe: totalEspeciais > 0 ? `${((c.valor / totalEspeciais) * 100).toFixed(1)}% das categorias extras` : '' }));
  };

  let fatiasPizzaQuadra = [];
  if (filtroPizzaQuadra === 'especiais') {
    fatiasPizzaQuadra = montarFatiasEspeciais();
  } else if (filtroPizzaQuadra === 'todos') {
    // Slots 3-7 p/ alas aqui — não colide com as cores fixas das especiais (slots 0-2)
    fatiasPizzaQuadra = [...montarFatiasAlas(4, PALETA_CATEGORICA.slice(3)), ...montarFatiasEspeciais()];
  } else {
    fatiasPizzaQuadra = montarFatiasAlas(6, PALETA_CATEGORICA);
  }

  const totalPizzaQuadra = fatiasPizzaQuadra.reduce((acc, f) => acc + f.valor, 0);
  let anguloAcumuladoQuadra = 0;
  const fatiasComAnguloQuadra = fatiasPizzaQuadra.map((f, indice) => {
    const pct = totalPizzaQuadra > 0 ? (f.valor / totalPizzaQuadra) * 100 : 0;
    const anguloInicio = anguloAcumuladoQuadra;
    const anguloFim = anguloInicio + (pct / 100) * 360;
    anguloAcumuladoQuadra = anguloFim;
    return { ...f, pct, anguloInicio, anguloFim, indice };
  });

  const polarParaCartesiano = (cx, cy, r, anguloGraus) => {
    const anguloRad = ((anguloGraus - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(anguloRad), y: cy + r * Math.sin(anguloRad) };
  };

  const descreverFatiaDonut = (cx, cy, rExterno, rInterno, anguloInicio, anguloFim) => {
    // Clampa fatias que fecham o círculo inteiro (1 categoria = 100%) — um sweep
    // de exatos 360° faz início e fim coincidirem e o arco SVG some.
    const fimAjustado = (anguloFim - anguloInicio) >= 359.99 ? anguloInicio + 359.99 : anguloFim;
    const inicioExt = polarParaCartesiano(cx, cy, rExterno, fimAjustado);
    const fimExt = polarParaCartesiano(cx, cy, rExterno, anguloInicio);
    const inicioInt = polarParaCartesiano(cx, cy, rInterno, anguloInicio);
    const fimInt = polarParaCartesiano(cx, cy, rInterno, fimAjustado);
    const arcoGrande = fimAjustado - anguloInicio <= 180 ? '0' : '1';
    return [
      'M', inicioExt.x, inicioExt.y,
      'A', rExterno, rExterno, 0, arcoGrande, 0, fimExt.x, fimExt.y,
      'L', fimInt.x, fimInt.y,
      'A', rInterno, rInterno, 0, arcoGrande, 1, inicioInt.x, inicioInt.y,
      'Z',
    ].join(' ');
  };

  // Une a lista oficial de alas com qualquer ala presente nos dados mas ausente da aba "Alas"
  const listaAlas = Array.from(new Set([...todasAlas, ...Object.keys(contagemPorAla)])).sort();

  const componentesFiltrados = componentes
    .filter(comp => alaFiltro === 'TODAS' || comp.ala === alaFiltro)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const maiorFrequencia = Math.max(...presencas.map(p => Math.max(p.presentes, p.ausentes)), 1);

  // --- PROCESSAMENTO DO GRÁFICO 2: DETALHADO POR SETOR ---
  const isTodasAsAlas = alaSelecionadaGrafico === 'TODAS' || alaSelecionadaGrafico === '';
  let dadosGraficoAlas = [];

  if (isTodasAsAlas) {
    const agrupado = {};
    historicoAlas.forEach(h => {
      if (!agrupado[h.ala]) agrupado[h.ala] = { presentes: 0, ausentes: 0 };
      agrupado[h.ala].presentes += h.presentes;
      agrupado[h.ala].ausentes += h.ausentes;
    });
    dadosGraficoAlas = Object.keys(agrupado).sort().map(ala => ({
      label: ala,
      presentes: agrupado[ala].presentes,
      ausentes: agrupado[ala].ausentes
    }));
  } else {
    dadosGraficoAlas = historicoAlas
      .filter(h => h.ala === alaSelecionadaGrafico)
      .map(h => ({
        label: h.data,
        presentes: h.presentes,
        ausentes: h.ausentes
      }));
  }

  const maxValAlas = Math.max(...dadosGraficoAlas.map(d => Math.max(d.presentes, d.ausentes)), 1);


  // --- PROCESSAMENTO DO GRÁFICO 3: EVOLUÇÃO DE INSCRIÇÕES ---
  const componentesEvolucao = alaFiltroEvolucao === 'TODAS' 
    ? componentes 
    : componentes.filter(c => c.ala === alaFiltroEvolucao);

  const agrupamentoInscricoes = componentesEvolucao.reduce((acc, comp) => {
    // Extrai apenas a data, ignorando a hora se existir (ex: "15/07/2026 14:30" vira "15/07/2026")
    const dataCurta = (comp.data || 'Sem Data').split(' ')[0];
    acc[dataCurta] = (acc[dataCurta] || 0) + 1;
    return acc;
  }, {});

  const parseDataBR = (str) => {
    if (!str || !str.includes('/')) return new Date(0);
    const parts = str.split('/');
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    return new Date(0);
  };

  const dadosEvolucaoInscricoes = Object.keys(agrupamentoInscricoes).map(data => ({
    data: data,
    quantidade: agrupamentoInscricoes[data]
  })).sort((a, b) => parseDataBR(a.data) - parseDataBR(b.data));

  const maxInscricoesData = Math.max(...dadosEvolucaoInscricoes.map(d => d.quantidade), 1);

  // --- PROCESSAMENTO DO GRÁFICO 4: NOVOS CADASTROS x RENOVAÇÕES (entre os renovados) ---
  const componentesNovosRenovacoes = alaFiltroNovosRenovacoes === 'TODAS'
    ? componentes
    : componentes.filter(c => c.ala === alaFiltroNovosRenovacoes);

  const totalCadastrosNovos = componentesNovosRenovacoes.filter(c => c.tipoCadastro === 'Novo').length;
  const totalRenovacoes = componentesNovosRenovacoes.filter(c => c.tipoCadastro === 'Renovação').length;
  const totalNovosOuRenovacoes = totalCadastrosNovos + totalRenovacoes;


  // =========================================================================
  // 2. FUNÇÕES DE EXPORTAÇÃO (PDFs)
  // =========================================================================

  // Padroniza o CPF no formato 000.000.000-00, independente de como foi salvo na planilha
  const formatarCpf = (cpf) => {
    const digitos = (cpf || '').replace(/\D/g, '').slice(0, 11);
    if (digitos.length !== 11) return cpf || '';
    return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  // Converte o link de compartilhamento do Drive em um link direto de miniatura (usado no PDF e na pré-visualização)
  const obterLinkDireto = (url) => {
    if (!url) return '';
    const match = url.match(/\/d\/(.*?)\//);
    return match && match[1] ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200` : url;
  };

  const gerarPdfInscritos = () => {
    const janelaImpressao = window.open('', '_blank');

    let linhasTabela = [...componentesFiltrados].sort((a, b) => a.nome.localeCompare(b.nome)).map((c, i) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">${i + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle;">
          ${c.fotoUrl ? `<img src="${obterLinkDireto(c.fotoUrl)}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%; border: 1px solid #ccc;" />` : '<div style="width: 45px; height: 45px; border-radius: 50%; background-color: #eee; display: inline-block; line-height: 45px; font-size: 10px; color: #999;">Sem Foto</div>'}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">#${c.id}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; vertical-align: middle; font-weight: bold; color: #000000;">${c.nome}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">${c.ala}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">${c.telefone}</td>
      </tr>
    `).join('');

    janelaImpressao.document.write(`
      <html>
        <head>
          <title>Relatório de Inscritos - Mancha Verde</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #005c33; padding-bottom: 10px; margin-bottom: 20px; }
            .title { color: #005c33; margin: 0; font-size: 24px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background-color: #005c33; color: white; padding: 10px; text-align: left; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">G.R.C.E.S. Mancha Verde</h1>
            <h2>Listagem Oficial de Componentes - Ala: ${alaFiltro}</h2>
            <div style="font-size: 12px; color: #666;">Emitido em: ${new Date().toLocaleDateString('pt-BR')} | Total: ${componentesFiltrados.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">Nº</th>
                <th style="width: 10%; text-align: center;">Foto</th>
                <th style="width: 10%; text-align: center;">Insc.</th>
                <th style="width: 40%;">Nome Completo</th>
                <th style="width: 17%; text-align: center;">Ala</th>
                <th style="width: 17%; text-align: center;">WhatsApp</th>
              </tr>
            </thead>
            <tbody>${linhasTabela}</tbody>
          </table>
          <script>setTimeout(() => { window.print(); window.close(); }, 1500);</script>
        </body>
      </html>
    `);
    janelaImpressao.document.close();
  };

  const gerarPdfAssinatura = () => {
    const janelaImpressao = window.open('', '_blank');
    let lines = [...componentesFiltrados].sort((a, b) => a.nome.localeCompare(b.nome)).map((c, i) => `
      <tr style="height: 45px;">
        <td style="padding: 5px; border-bottom: 1px solid #999; text-align: center; color: #000000;">${i + 1}</td>
        <td style="padding: 5px; border-bottom: 1px solid #999; text-transform: uppercase; font-size: 12px; color: #000000;"><b>${c.nome}</b><br><span style="color:#555; font-size:10px;">CPF: ${c.cpf} | Ala: ${c.ala}</span></td>
        <td style="padding: 5px; border-bottom: 1px solid #999; position: relative;">
          <div style="position: absolute; bottom: 8px; left: 10px; right: 10px; border-bottom: 1px dashed #bbb;"></div>
        </td>
      </tr>
    `).join('');

    janelaImpressao.document.write(`
      <html>
        <head>
          <title>Lista de Assinatura - Mancha Verde</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #005c33; padding-bottom: 10px; margin-bottom: 20px; }
            .title { color: #005c33; margin: 0; font-size: 22px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #334155; color: white; padding: 10px; text-align: left; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">Folha de Presença e Assinatura</h1>
            <h3>Controle de Ensaio / Entrega - Ala: ${alaFiltro}</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 6%; text-align: center;">Item</th>
                <th style="width: 44%;">Identificação do Componente</th>
                <th style="width: 50%; text-align: center;">Assinatura / Rubrica</th>
              </tr>
            </thead>
            <tbody>${lines}</tbody>
          </table>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `);
    janelaImpressao.document.close();
  };

  if (carregando) {
    return <div style={{ textAlign: 'center', marginTop: '50px', color: '#000000', fontWeight: 'bold' }}>Carregando dados estatísticos...</div>;
  }

  // =========================================================================
  // 3. ÁREA DE DESENHO DA TELA (VISUAL / JSX)
  // =========================================================================

  return (
    <div className="container" style={{ maxWidth: '1100px', margin: '30px auto', padding: '0 20px', fontFamily: 'sans-serif' }}>
      
      {/* TÍTULO */}
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h2 style={{ color: '#005c33', margin: '0 0 5px 0', fontWeight: 'bold' }}>Painel Gerencial e Relatórios</h2>
        <p style={{ color: '#000000', margin: 0, fontWeight: '500' }}>Dados consolidados e exportação de listagens oficiais</p>
      </div>

      {/* KPIs SUPERIORES */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '6px solid #005c33' }}>
          <div style={{ fontSize: '14px', color: '#000000', fontWeight: 'bold' }}>TOTAL DE INSCRITOS</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', marginTop: '5px' }}>
            <span style={{ color: '#000000' }}>{totalInscritos} / {totalVagasGeral > 0 ? totalVagasGeral : '∞'}</span>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: '200px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '6px solid #eab308' }}>
          <div style={{ fontSize: '14px', color: '#000000', fontWeight: 'bold' }}>ALAS ATIVAS NO SISTEMA</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#000000', marginTop: '5px' }}>{listaAlas.length}</div>
        </div>
        <div style={{ flex: 1, minWidth: '200px', backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderLeft: '6px solid #2563eb' }}>
          <div style={{ fontSize: '14px', color: '#000000', fontWeight: 'bold' }}>ENSAIOS REALIZADOS</div>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#000000', marginTop: '5px' }}>{ensaiosPorTipo.comuns + ensaiosPorTipo.especiais}</div>
          <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '6px', display: 'flex', gap: '12px' }}>
            <span style={{ color: '#005c33' }}>Comuns: {ensaiosPorTipo.comuns}</span>
            <span style={{ color: '#16a34a' }}>Especiais: {ensaiosPorTipo.especiais}</span>
          </div>
        </div>
      </div>

      {/* ======================= QUEM ESTÁ NA QUADRA (pizza, último ensaio) ======================= */}
      <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Quem Está na Quadra</h4>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              {resumoQuadra?.data ? `Último ensaio lançado: ${resumoQuadra.data} (${resumoQuadra.tipo})` : 'Nenhum ensaio lançado ainda'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#000000' }}>Filtro:</label>
            <select
              value={filtroPizzaQuadra}
              onChange={(e) => { setFiltroPizzaQuadra(e.target.value); setFatiaEmFoco(null); }}
              style={{ padding: '10px 15px', borderRadius: '6px', border: '2px solid #005c33', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              <option value="alas">Alas</option>
              <option value="especiais">Especiais</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>

        {!resumoQuadra?.data ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 'bold', padding: '40px 0' }}>
            Nenhum ensaio lançado ainda — lance uma chamada em "Presenças" para ver o gráfico.
          </div>
        ) : totalPizzaQuadra === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 'bold', padding: '40px 0' }}>
            Nenhum registro nesta categoria para o último ensaio.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '30px', flexWrap: 'wrap', alignItems: 'center' }}>
            <svg width="260" height="260" viewBox="0 0 260 260" style={{ flexShrink: 0 }}>
              {fatiasComAnguloQuadra.map((f) => (
                <path
                  key={f.label}
                  d={descreverFatiaDonut(130, 130, 120, 66, f.anguloInicio, f.anguloFim)}
                  fill={f.cor}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  opacity={fatiaEmFoco === null || fatiaEmFoco === f.indice ? 1 : 0.35}
                  style={{ cursor: 'pointer', transition: 'opacity 0.15s ease' }}
                  onMouseEnter={() => setFatiaEmFoco(f.indice)}
                  onMouseLeave={() => setFatiaEmFoco(null)}
                >
                  <title>{`${f.label}: ${f.valor} (${f.pct.toFixed(1)}%)`}</title>
                </path>
              ))}
              <text x="130" y="122" textAnchor="middle" fontSize="30" fontWeight="bold" fill="#000000">
                {fatiaEmFoco !== null ? fatiasComAnguloQuadra[fatiaEmFoco].valor : totalPizzaQuadra}
              </text>
              <text x="130" y="144" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#64748b">
                {(fatiaEmFoco !== null ? fatiasComAnguloQuadra[fatiaEmFoco].label : 'NA QUADRA').toUpperCase()}
              </text>
            </svg>

            <div style={{ flex: 1, minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {fatiasComAnguloQuadra.map((f) => (
                <div
                  key={f.label}
                  onMouseEnter={() => setFatiaEmFoco(f.indice)}
                  onMouseLeave={() => setFatiaEmFoco(null)}
                  style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '6px 8px', borderRadius: '4px', backgroundColor: fatiaEmFoco === f.indice ? '#f1f5f9' : 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                    <span style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: f.cor, flexShrink: 0 }}></span>
                    <span style={{ fontWeight: 'bold', color: '#000000', flex: 1 }}>{f.label}</span>
                    <span style={{ fontWeight: 'bold', color: '#000000' }}>{f.valor} ({f.pct.toFixed(1)}%)</span>
                  </div>
                  {f.detalhe && <div style={{ marginLeft: '22px', color: '#64748b', fontSize: '12px' }}>{f.detalhe}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ======================= LINHA 1: GRÁFICO GERAL ======================= */}
      <div style={{ display: 'flex', width: '100%', marginBottom: '30px' }}>
        <div style={{ flex: 1, width: '100%', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
            <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Frequência Geral da Escola</h4>
            <div style={{ display: 'flex', gap: '15px', fontSize: '12px' }}>
              <span style={{ color: '#000000', fontWeight: 'bold' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#005c33', borderRadius: '2px', marginRight: '5px' }}></span>Presentes</span>
              <span style={{ color: '#000000', fontWeight: 'bold' }}><span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: '#ef4444', borderRadius: '2px', marginRight: '5px' }}></span>Ausentes</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: presencas.length < 6 ? 'space-around' : 'flex-start', width: '100%', height: '220px', gap: '20px', paddingBottom: '10px', borderBottom: '2px solid #cbd5e1', overflowX: 'auto' }}>
            {presencas.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#64748b', paddingBottom: '80px', fontWeight: 'bold' }}>Nenhum ensaio geral registrado.</div>
            ) : (
              presencas.map((ensaio, index) => {
                const altP = (ensaio.presentes / maiorFrequencia) * 100;
                const altA = (ensaio.ausentes / maiorFrequencia) * 100;
                return (
                  <div key={index} style={{ flex: presencas.length < 6 ? 1 : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: '80px', maxWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100%', width: '100%', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: '32px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#005c33', marginBottom: '4px' }}>{ensaio.presentes}</span>
                        <div style={{ width: '100%', height: `${altP}%`, backgroundColor: '#005c33', borderRadius: '3px 3px 0 0', minHeight: '2px' }}></div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: '32px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ef4444', marginBottom: '4px' }}>{ensaio.ausentes}</span>
                        <div style={{ width: '100%', height: `${altA}%`, backgroundColor: '#ef4444', borderRadius: '3px 3px 0 0', minHeight: '2px' }}></div>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', color: '#000000', fontWeight: 'bold', marginTop: '10px' }}>{ensaio.data}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ======================= LINHA 2: DISTRIBUIÇÃO LADO A LADO ======================= */}
      <div style={{ display: 'flex', gap: '30px', marginBottom: '30px', flexWrap: 'wrap', width: '100%' }}>
        
        {/* GRÁFICO: FREQUÊNCIA DETALHADA POR SETOR */}
        <div style={{ flex: 2, minWidth: '350px', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Frequência Detalhada por Setor</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                {isTodasAsAlas ? 'Comparativo global de presenças e faltas' : `Evolução de presenças e faltas - Ala ${alaSelecionadaGrafico.toUpperCase()}`}
              </p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#000000' }}>Filtro:</label>
              <select 
                value={alaSelecionadaGrafico} 
                onChange={(e) => setAlaSelecionadaGrafico(e.target.value)}
                style={{ padding: '10px 15px', borderRadius: '6px', border: '2px solid #005c33', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
              >
                <option value="TODAS">TODAS AS ALAS</option>
                {listaAlas.map(ala => (
                  <option key={ala} value={ala}>{ala.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: dadosGraficoAlas.length < 6 ? 'space-around' : 'flex-start', width: '100%', height: '220px', gap: '25px', paddingBottom: '10px', borderBottom: '2px solid #334155', overflowX: 'auto' }}>
            {dadosGraficoAlas.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#64748b', paddingBottom: '80px', fontWeight: 'bold' }}>
                Nenhum dado registrado neste filtro.
              </div>
            ) : (
              dadosGraficoAlas.map((registro, idx) => {
                const altP = (registro.presentes / maxValAlas) * 100;
                const altA = (registro.ausentes / maxValAlas) * 100;
                return (
                  <div key={idx} style={{ flex: dadosGraficoAlas.length < 6 ? 1 : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: '80px', maxWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '100%', width: '100%', justifyContent: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: '32px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#005c33', marginBottom: '4px' }}>{registro.presentes}</span>
                        <div style={{ width: '100%', height: `${altP}%`, backgroundColor: '#005c33', borderRadius: '3px 3px 0 0', minHeight: '2px', transition: 'height 0.3s ease' }}></div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', width: '32px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#ef4444', marginBottom: '4px' }}>{registro.ausentes}</span>
                        <div style={{ width: '100%', height: `${altA}%`, backgroundColor: '#ef4444', borderRadius: '3px 3px 0 0', minHeight: '2px', transition: 'height 0.3s ease' }}></div>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#000000', fontWeight: 'bold', marginTop: '10px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                      {registro.label}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* GRÁFICO: OCUPAÇÃO DE VAGAS */}
        <div style={{ flex: 1, minWidth: '280px', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>
          <h4 style={{ margin: '0 0 25px 0', color: '#000000', fontWeight: 'bold' }}>Ocupação de Vagas (Alas)</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {listaAlas
              .filter(ala => (contagemPorAla[ala] || 0) > 0)
              .sort((a, b) => (contagemPorAla[b] || 0) - (contagemPorAla[a] || 0) || a.localeCompare(b))
              .map(ala => {
              const qtdAtual = contagemPorAla[ala] || 0;
              const limiteDefinido = limites[ala] || qtdAtual;
              const pctOcupacao = limiteDefinido > 0 ? ((qtdAtual / limiteDefinido) * 100).toFixed(1) : 0;
              const corBarra = '#10b981';

              return (
                <div key={ala} style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ala}</span>
                    <span style={{ color: '#000000', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>{qtdAtual} / {limites[ala] ? limites[ala] : '∞'} ({pctOcupacao}%)</span>
                  </div>
                  <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pctOcupacao, 100)}%`, backgroundColor: corBarra, height: '100%' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ======================= LINHA 3: GRÁFICO DE EVOLUÇÃO DE INSCRIÇÕES + NOVOS x RENOVAÇÕES ======================= */}
      <div style={{ display: 'flex', gap: '30px', marginBottom: '40px', flexWrap: 'wrap', width: '100%' }}>
        <div style={{ flex: 2, minWidth: '350px', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', flexWrap: 'wrap', gap: '15px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Evolução de Cadastros (Frequência Diária)</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                Acompanhamento contínuo do ritmo de novas inscrições de componentes por data
              </p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label style={{ fontSize: '14px', fontWeight: 'bold', color: '#000000' }}>Filtro Setorial:</label>
              <select 
                value={alaFiltroEvolucao} 
                onChange={(e) => setAlaFiltroEvolucao(e.target.value)}
                style={{ padding: '10px 15px', borderRadius: '6px', border: '2px solid #2563eb', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
              >
                <option value="TODAS">TODAS AS ALAS (GERAL)</option>
                {listaAlas.map(ala => (
                  <option key={ala} value={ala}>{ala.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ width: '100%', height: '240px', borderBottom: '2px solid #334155', overflowX: 'auto', position: 'relative' }}>
            {dadosEvolucaoInscricoes.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#64748b', paddingBottom: '80px', fontWeight: 'bold' }}>
                Nenhuma data de inscrição processada para esta ala.
              </div>
            ) : (
              <div style={{ display: 'flex', height: '100%', minWidth: '100%', width: `${Math.max(dadosEvolucaoInscricoes.length * 75, 100)}px`, position: 'relative' }}>
                
                {/* Linha conectora do gráfico (Vetor SVG) */}
                <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '180px', overflow: 'visible', zIndex: 1 }}>
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    points={dadosEvolucaoInscricoes.map((registro, idx) => {
                      const x = idx * 75 + 37;
                      const altPercentual = (registro.quantidade / maxInscricoesData) * 100;
                      const y = 160 - (altPercentual * 120 / 100); 
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                </svg>

                {/* Marcadores visuais sobrepostos (Bolinhas e Textos) */}
                {dadosEvolucaoInscricoes.map((registro, idx) => {
                  const altPercentual = (registro.quantidade / maxInscricoesData) * 100;
                  const yPoint = 160 - (altPercentual * 120 / 100);

                  return (
                    <div key={idx} style={{ width: '75px', height: '180px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      
                      {/* Quantidade numérica sobre a bolinha */}
                      <span style={{ position: 'absolute', top: `${yPoint - 22}px`, fontSize: '12px', fontWeight: 'bold', color: '#2563eb', zIndex: 3 }}>
                        {registro.quantidade}
                      </span>
                      
                      {/* Vértice indicador (Bolinha) */}
                      <div style={{ position: 'absolute', top: `${yPoint - 5}px`, width: '10px', height: '10px', backgroundColor: '#2563eb', borderRadius: '50%', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.15)', zIndex: 3 }} />
                      
                      {/* Legenda cronológica no rodapé */}
                      <div style={{ position: 'absolute', bottom: '-40px', fontSize: '12px', color: '#000000', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {registro.data}
                      </div>
                      
                    </div>
                  );
                })}

              </div>
            )}
          </div>
        </div>

        {/* GRÁFICO: NOVOS CADASTROS x RENOVAÇÕES */}
        <div style={{ flex: 1, minWidth: '260px', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px', marginBottom: '25px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#000000', fontWeight: 'bold' }}>Novos Cadastros x Renovações</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
                Entre os componentes marcados como renovados
              </p>
            </div>

            <select
              value={alaFiltroNovosRenovacoes}
              onChange={(e) => setAlaFiltroNovosRenovacoes(e.target.value)}
              style={{ padding: '10px 15px', borderRadius: '6px', border: '2px solid #2563eb', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              <option value="TODAS">TODAS AS ALAS (GERAL)</option>
              {listaAlas.map(ala => (
                <option key={ala} value={ala}>{ala.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {totalNovosOuRenovacoes === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', fontWeight: 'bold', paddingTop: '30px' }}>
              Nenhum dado disponível para este filtro.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { label: 'Cadastros Novos', valor: totalCadastrosNovos, cor: '#2563eb' },
                { label: 'Renovações', valor: totalRenovacoes, cor: '#005c33' },
              ].map(item => {
                const pct = ((item.valor / totalNovosOuRenovacoes) * 100).toFixed(1);
                return (
                  <div key={item.label} style={{ fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 'bold', color: '#000000' }}>{item.label}</span>
                      <span style={{ fontWeight: 'bold', color: '#000000' }}>{item.valor} ({pct}%)</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f1f5f9', height: '14px', borderRadius: '7px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, backgroundColor: item.cor, height: '100%' }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ======================= TABELA E PDF ======================= */}
      <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#000000', fontWeight: 'bold' }}>Filtros de Exportação (Listas de Chamada)</h4>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '25px', borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#000000', marginBottom: '6px' }}>Filtrar por Ala:</label>
            <select 
              value={alaFiltro} 
              onChange={(e) => setAlaFiltro(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#FFFFFF', color: '#000000', fontWeight: 'bold' }}
            >
              <option value="TODAS">Todas as Alas (Geral)</option>
              {listaAlas.map(ala => (
                <option key={ala} value={ala}>{ala.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '10px', paddingTop: '20px' }}>
            <button onClick={gerarPdfInscritos} style={{ padding: '11px 20px', backgroundColor: '#005c33', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>📄 Listagem de Inscritos</button>
            <button onClick={gerarPdfAssinatura} style={{ padding: '11px 20px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>✍️ Folha de Assinaturas</button>
          </div>
        </div>

        <h5 style={{ margin: '0 0 10px 0', color: '#000000', fontWeight: 'bold' }}>Pré-visualização da Lista ({componentesFiltrados.length})</h5>
        
        <div style={{ overflowX: 'auto', backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '4px', border: '1px solid #cccccc' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', backgroundColor: '#FFFFFF' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #000000', textAlign: 'center' }}>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>Foto</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>ID</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>Nome</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>CPF</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>Ala</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>WhatsApp</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#005c33' }}>Presenças</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#ef4444' }}>Ausências</span></th>
              </tr>
            </thead>
            <tbody>
              {componentesFiltrados.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #999999' }}>
                  <td style={{ padding: '10px 5px', textAlign: 'center' }}>
                    {c.fotoUrl ? (
                      <img src={obterLinkDireto(c.fotoUrl)} alt={c.nome} style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '50%', border: '1px solid #ccc' }} />
                    ) : (
                      <div style={{ width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#eee', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', color: '#999' }}>Sem Foto</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 5px' }}><span style={{ color: '#000000', fontWeight: 'bold' }}>#{c.id}</span></td>
                  <td style={{ padding: '10px 5px', textTransform: 'uppercase' }}><span style={{ color: '#000000', fontWeight: 'bold' }}>{c.nome}</span></td>
                  <td style={{ padding: '10px 5px', whiteSpace: 'nowrap' }}><span style={{ color: '#000000' }}>{formatarCpf(c.cpf)}</span></td>
                  <td style={{ padding: '10px 5px' }}><span style={{ backgroundColor: '#cccccc', color: '#000000', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>{c.ala}</span></td>
                  <td style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>{c.telefone}</span></td>
                  <td style={{ padding: '10px 5px', textAlign: 'center' }}><span style={{ color: '#005c33', fontWeight: 'bold' }}>{frequenciaPorId[c.id] ? frequenciaPorId[c.id].presencas : '—'}</span></td>
                  <td style={{ padding: '10px 5px', textAlign: 'center' }}><span style={{ color: '#ef4444', fontWeight: 'bold' }}>{frequenciaPorId[c.id] ? frequenciaPorId[c.id].ausencias : '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default Relatorios;