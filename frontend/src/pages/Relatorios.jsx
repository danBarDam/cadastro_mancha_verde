import React, { useState, useEffect } from 'react';
import api from '../utils/api';

function Relatorios() {
  const [componentes, setComponentes] = useState([]);
  const [todasAlas, setTodasAlas] = useState([]);
  const [limites, setLimites] = useState({});
  const [presencas, setPresencas] = useState([]);
  const [historicoAlas, setHistoricoAlas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [alaFiltro, setAlaFiltro] = useState('TODAS'); // Filtro da Tabela e PDFs
  const [alaSelecionadaGrafico, setAlaSelecionadaGrafico] = useState('TODAS'); // Filtro do Gráfico Detalhado
  const [alaFiltroEvolucao, setAlaFiltroEvolucao] = useState('TODAS'); // Filtro do Novo Gráfico de Inscrições

  useEffect(() => {
    puxarDados();
  }, []);

  const puxarDados = async () => {
    try {
      const [resposta, respostaAlas] = await Promise.all([
        api.get('/dados-relatorio'),
        api.get('/alas'),
      ]);
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

  // Une a lista oficial de alas com qualquer ala presente nos dados mas ausente da aba "Alas"
  const listaAlas = Array.from(new Set([...todasAlas, ...Object.keys(contagemPorAla)])).sort();

  const componentesFiltrados = componentes.filter(comp => 
    alaFiltro === 'TODAS' || comp.ala === alaFiltro
  );

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


  // =========================================================================
  // 2. FUNÇÕES DE EXPORTAÇÃO (PDFs)
  // =========================================================================

  const gerarPdfInscritos = () => {
    const janelaImpressao = window.open('', '_blank');
    const obterLinkDireto = (url) => {
      if (!url) return '';
      const match = url.match(/\/d\/(.*?)\//);
      return match && match[1] ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200` : url;
    };

    let linhasTabela = componentesFiltrados.map((c, i) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">${i + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle;">
          ${c.fotoUrl ? `<img src="${obterLinkDireto(c.fotoUrl)}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 50%; border: 1px solid #ccc;" />` : '<div style="width: 45px; height: 45px; border-radius: 50%; background-color: #eee; display: inline-block; line-height: 45px; font-size: 10px; color: #999;">Sem Foto</div>'}
        </td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">#${c.id}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; vertical-align: middle; font-weight: bold; color: #000000;">${c.nome}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center; vertical-align: middle; color: #000000;">${c.cpf}</td>
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
                <th style="width: 5%; text-align: center;">Nº</th>
                <th style="width: 8%; text-align: center;">Foto</th>
                <th style="width: 8%; text-align: center;">Insc.</th>
                <th style="width: 33%;">Nome Completo</th>
                <th style="width: 15%; text-align: center;">CPF</th>
                <th style="width: 15%; text-align: center;">Ala</th>
                <th style="width: 16%; text-align: center;">WhatsApp</th>
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
    let lines = componentesFiltrados.map((c, i) => `
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
            {listaAlas.map(ala => {
              const qtdAtual = contagemPorAla[ala] || 0;
              const limiteDefinido = limites[ala] || qtdAtual; 
              const pctOcupacao = limiteDefinido > 0 ? ((qtdAtual / limiteDefinido) * 100).toFixed(1) : 0;
              const corBarra = pctOcupacao >= 100 ? '#ef4444' : pctOcupacao >= 85 ? '#eab308' : '#10b981';

              return (
                <div key={ala} style={{ fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 'bold', textTransform: 'uppercase', color: '#000000' }}>{ala}</span>
                    <span style={{ color: '#000000', fontWeight: 'bold' }}>{qtdAtual} / {limites[ala] ? limites[ala] : '∞'} ({pctOcupacao}%)</span>
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

      {/* ======================= LINHA 3: GRÁFICO DE EVOLUÇÃO DE INSCRIÇÕES EM LINHA ======================= */}
      <div style={{ display: 'flex', width: '100%', marginBottom: '40px' }}>
        <div style={{ flex: 1, width: '100%', backgroundColor: 'white', padding: '25px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)', boxSizing: 'border-box' }}>
          
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
              <tr style={{ borderBottom: '2px solid #000000', textAlign: 'left' }}>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>ID</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>Nome</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>CPF</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>Ala</span></th>
                <th style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>WhatsApp</span></th>
              </tr>
            </thead>
            <tbody>
              {componentesFiltrados.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #999999' }}>
                  <td style={{ padding: '10px 5px' }}><span style={{ color: '#000000', fontWeight: 'bold' }}>#{c.id}</span></td>
                  <td style={{ padding: '10px 5px', textTransform: 'uppercase' }}><span style={{ color: '#000000', fontWeight: 'bold' }}>{c.nome}</span></td>
                  <td style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>{c.cpf}</span></td>
                  <td style={{ padding: '10px 5px' }}><span style={{ backgroundColor: '#cccccc', color: '#000000', padding: '3px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}>{c.ala}</span></td>
                  <td style={{ padding: '10px 5px' }}><span style={{ color: '#000000' }}>{c.telefone}</span></td>
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