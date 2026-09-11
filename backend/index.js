const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const multer = require('multer');
const stream = require('stream');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
// Protege todas as rotas com exceção do login e do proxy de imagens
// (o proxy é carregado via tag <img>, que não consegue enviar cabeçalho Authorization).
const ROTAS_PUBLICAS = ['/login', '/proxy-imagem'];

app.use((req, res, next) => {
  if (ROTAS_PUBLICAS.includes(req.path)) return next();

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login novamente.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, payload) => {
    if (error) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    req.usuario = payload.usuario;
    next();
  });
});

const upload = multer({ storage: multer.memoryStorage() });

// Em produção (Render), as credenciais vêm da variável de ambiente GOOGLE_CREDENTIALS_JSON
// (conteúdo integral do credentials.json colado como texto). Em desenvolvimento local,
// continua lendo o arquivo credentials.json normalmente.
const auth = new google.auth.GoogleAuth({
  ...(process.env.GOOGLE_CREDENTIALS_JSON
    ? { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) }
    : { keyFile: 'credentials.json' }),
  scopes: [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
  ],
});

// Instâncias das APIs
const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

// --- ROTA 0: Login (valida usuário/senha contra a aba "Usuarios" da planilha) ---
app.post('/login', async (req, res) => {
  try {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Usuarios!A2:B', // Colunas: Usuario | Senha
    });

    const linhas = response.data.values || [];
    const linhaUsuario = linhas.find(
      (linha) => (linha[0] || '').trim().toLowerCase() === usuario.trim().toLowerCase()
    );

    if (!linhaUsuario || (linhaUsuario[1] || '').trim() !== senha.trim()) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const nomeUsuario = linhaUsuario[0].trim();
    const token = jwt.sign({ usuario: nomeUsuario }, process.env.JWT_SECRET, { expiresIn: '8h' });

    res.json({ token, usuario: nomeUsuario });
  } catch (error) {
    console.error('Erro ao efetuar login:', error);
    res.status(500).json({ error: 'Erro interno ao efetuar login.' });
  }
});

// --- ROTA 1: Buscar o próximo ID sequencial ---
app.get('/proximo-id', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:A', // Lê apenas a coluna dos IDs
    });

    const linhas = response.data.values || [];

    // Calcula com base no maior ID numérico já usado, e não na quantidade de
    // linhas: se um cadastro for excluído ou um ID for digitado manualmente
    // fora de ordem, contar linhas pode gerar um número que já existe.
    const idsExistentes = linhas.slice(1)
      .map(row => parseInt(row[0], 10))
      .filter(numero => !isNaN(numero));

    const maiorId = idsExistentes.length > 0 ? Math.max(...idsExistentes) : 0;
    const proximoNumero = maiorId + 1;

    // Transforma em uma string de 8 dígitos (ex: 1 vira "00000001")
    const idFormatado = String(proximoNumero).padStart(8, '0');
    
    res.json({ proximoId: idFormatado });
  } catch (error) {
    console.error('Erro ao buscar ID:', error);
    res.status(500).json({ error: 'Erro ao gerar ID.' });
  }
});

// --- ROTA 2: Buscar a lista de Alas ---
app.get('/alas', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Alas!A2:A', // Lê a partir da linha 2 da aba Alas
    });

    const linhas = response.data.values || [];
    // Transforma a matriz do Google Sheets num array simples do JavaScript
    const alasLista = linhas.map(linha => linha[0]).filter(ala => ala !== undefined && ala.trim() !== '');

    res.json({ alas: alasLista });
  } catch (error) {
    console.error('Erro ao buscar alas:', error);
    res.status(500).json({ error: 'Erro ao carregar alas.' });
  }
});

// --- ROTA 3: Receber e salvar o Cadastro Completo ---
app.post('/cadastro', upload.single('foto'), async (req, res) => {
  try {
    const { id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, cidade, numero, complemento, ala, data } = req.body;
    const foto = req.file;

    if (!nome || !cpf) {
      return res.status(400).json({ error: 'Dados essenciais incompletos.' });
    }

    // Verifica se o CPF ou o telefone já estão cadastrados antes de gravar
    const responseExistentes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:N',
    });
    const linhasExistentes = (responseExistentes.data.values || []).slice(1);

    const cpfSemPontos = cpf.replace(/\D/g, '');
    const telefoneSemPontos = (telefone || '').replace(/\D/g, '');

    const idDuplicado = id && linhasExistentes.some(row => row[0] === id);
    const cpfDuplicado = linhasExistentes.some(row => row[3] && row[3].replace(/\D/g, '') === cpfSemPontos);
    const telefoneDuplicado = telefoneSemPontos && linhasExistentes.some(row => row[4] && row[4].replace(/\D/g, '') === telefoneSemPontos);

    if (idDuplicado) {
      return res.status(409).json({ error: 'Já existe um cadastro com este número de inscrição (ID).' });
    }
    if (cpfDuplicado) {
      return res.status(409).json({ error: 'Já existe um cadastro com este CPF.' });
    }
    if (telefoneDuplicado) {
      return res.status(409).json({ error: 'Já existe um cadastro com este número de WhatsApp.' });
    }

    let fotoUrl = '';

    // 1. Se uma foto foi enviada, converte em Base64 e sobe pro Microserviço no Apps Script
    if (foto) {
      const imageBase64 = foto.buffer.toString('base64');

      // Utiliza a API nativa fetch do Node.js
      // 1. VAMOS CHECAR SE O NODE ESTÁ LENDO O SEU .ENV CORRETAMENTE
      console.log("⚠️ ID DA PASTA NO ENV:", process.env.DRIVE_FOLDER_ID);

      const responseAppScript = await fetch(process.env.URL_WEB_APP, {
        method: 'POST',
        body: JSON.stringify({
          base64: imageBase64,
          mimeType: foto.mimetype,
          filename: `Inscricao_${id}_${nome}.jpg`,
          folderId: process.env.DRIVE_FOLDER_ID
        })
      });

      const scriptData = await responseAppScript.json();

      // 2. VAMOS CHECAR QUAL É A DESCRIÇÃO EXATA DO ERRO DO GOOGLE
      console.log("🚨 RETORNO DO APPS SCRIPT:", scriptData);

      if (!scriptData.sucesso) {
        // Se deu erro lá no Google, interrompe o código e manda o erro pro React
        return res.status(500).json({ error: 'Erro ao salvar no Drive: ' + scriptData.erro });
      }

      // ⚠️ ATENÇÃO: NÃO APAGUE o restante do seu código a partir daqui!
      // (A parte onde você salva na planilha e dá o res.json(sucesso) continua igualzinha).

      if (!scriptData.success) {
        throw new Error('Falha no Webhook do Drive: ' + scriptData.error);
      }

      fotoUrl = scriptData.url;
    }

    // 2. Salvar todos os dados na Planilha (mantido via Service Account)
    // A coluna N (renovado) já entra como "Sim" ao salvar, igual ao efeito do
    // botão "Marcar Renovação" da tela de Pesquisa. A coluna O guarda a cidade
    // (preenchida via ViaCEP na tela de cadastro). A coluna P marca se a
    // carteirinha já foi gerada — todo cadastro novo entra como "Não".
    const dadosParaSalvar = [
      id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data, fotoUrl, 'Sim', cidade || '', 'Não'
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:P',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [dadosParaSalvar],
      },
    });

    res.status(200).json({ message: 'Inscrição salva com sucesso!' });

  } catch (error) {
    console.error('Erro no processamento do cadastro:', error);
    res.status(500).json({ error: 'Erro interno no servidor ao salvar dados.' });
  }
});

const PORT = process.env.PORT || 5174;

// --- ROTA 4: Buscar componentes por Nome ou CPF ---
app.get('/buscar', async (req, res) => {
  try {
    const { termo, campo } = req.query;

    if (!termo) return res.status(400).json({ error: 'Termo de busca não informado.' });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:P', // N = renovado (Sim/Não), O = cidade, P = carteirinha gerada (Sim/Não)
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return res.json([]);

    const termoTratado = termo.toLowerCase().trim();
    const termoSemPontos = termoTratado.replace(/\D/g, '');

    // Colunas que identificam a pessoa: id, nome, cpf, telefone.
    // Antes a busca comparava com a linha inteira, o que incluía cep, data e o
    // link da foto (uma string cheia de números/letras aleatórias), fazendo
    // qualquer termo "bater" com quase todo mundo.
    const colunasPorCampo = {
      id: [row => row[0]],
      nome: [row => row[2]],
      cpf: [row => row[3]],
    };
    const obterCelulas = colunasPorCampo[campo] || [row => row[0], row => row[2], row => row[3], row => row[4]];

    const resultados = rows.filter((row, index) => {
      if (index === 0) return false;
      const camposBusca = obterCelulas.map(obter => obter(row));
      return camposBusca.some(celula => {
        if (!celula) return false;
        const textoCelula = celula.toString().toLowerCase();
        const celulaSemPontos = textoCelula.replace(/\D/g, '');
        return textoCelula.includes(termoTratado) || (termoSemPontos && celulaSemPontos.includes(termoSemPontos));
      });
    });

    const dadosFormatados = resultados.map(row => ({
      id: row[0],
      tipoCadastro: row[1],
      nome: row[2],
      cpf: row[3],
      telefone: row[4], 
      cep: row[5],
      rua: row[6],
      bairro: row[7],
      numero: row[8],
      complemento: row[9],
      ala: row[10],
      data: row[11],
      fotoUrl: row[12],
      renovado: row[13] || 'Não',
      cidade: row[14] || '',
      carteirinhaGerada: row[15] || 'Não',
    }));

    res.json(dadosFormatados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno ao realizar a busca.' });
  }
});

// Converte "dd/mm/aaaa" num Date, para poder ordenar cronologicamente
const converterDataBR = (str) => {
  if (!str || !str.includes('/')) return new Date(0);
  const [dia, mes, ano] = str.split('/');
  return new Date(`${ano}-${mes}-${dia}`);
};

// Aceita "dd/mm/aaaa", "dd-mm-aaaa" e "aaaa-mm-dd" (o cadastro salva num, o
// nome das abas de ensaio noutro). Retorna null se não conseguir interpretar.
const parseDataFlex = (str) => {
  if (!str) return null;
  const s = String(str).trim();
  const partes = s.includes('/') ? s.split('/') : s.split('-');
  if (partes.length !== 3) return null;
  const [a, b, c] = partes;
  const iso = a.length === 4 ? `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`
                             : `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

// As abas de ensaio da planilha de presenças são as nomeadas pela data.
// "Geral" e "Alas" são de controle; "Ala - X" é a matriz nominal derivada.
const ehAbaDeEnsaio = (titulo) =>
  titulo !== 'Geral' && titulo !== 'Alas' && !titulo.startsWith('Ala - ');

// Reconstrói as abas "Ala - <ala>" (matriz ID x data, células P / A / vazio) a
// partir das abas de ensaio (verdade sobre quem esteve presente) e do cadastro
// (roster de renovados + data de cadastro). Idempotente: roda a cada chamada.
// `ensaioAtual` (opcional) injeta o ensaio recém-gravado mesmo que a leitura da
// aba nova ainda não o retorne. { label: "dd/mm/aaaa", ids: Set<string> }
// `opcoes.reconstruirResumos`: também refaz as abas "Geral" e "Alas" a partir
// das abas por data (base de ausentes = componentes renovados).
async function reconstruirMatrizesPorAla(ensaioAtual = null, opcoes = {}) {
  const idPresencas = process.env.PRESENCAS_SPREADSHEET_ID;

  const [infoPlanilha, respInscritos] = await Promise.all([
    sheets.spreadsheets.get({ spreadsheetId: idPresencas }),
    sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:P' }),
  ]);

  const titulos = (infoPlanilha.data.sheets || []).map(a => a.properties.title);
  const abasEnsaio = titulos.filter(ehAbaDeEnsaio);

  let presentesPorData = [];
  if (abasEnsaio.length > 0) {
    const respLote = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: idPresencas,
      ranges: abasEnsaio.map(t => `${t}!A2:A`),
    });
    presentesPorData = abasEnsaio.map((t, i) => ({
      label: t.replaceAll('-', '/'),
      ids: new Set((respLote.data.valueRanges?.[i]?.values || []).map(l => l[0]).filter(Boolean)),
    }));
  }

  if (ensaioAtual) {
    const existente = presentesPorData.find(p => p.label === ensaioAtual.label);
    if (existente) ensaioAtual.ids.forEach(id => existente.ids.add(id));
    else presentesPorData.push({ label: ensaioAtual.label, ids: new Set(ensaioAtual.ids) });
  }

  if (presentesPorData.length === 0) return;
  presentesPorData.sort((x, y) => (parseDataFlex(x.label) || 0) - (parseDataFlex(y.label) || 0));
  const colunasData = presentesPorData.map(p => p.label);

  const renovados = (respInscritos.data.values || []).slice(1)
    .filter(r => (r[13] || '') === 'Sim')
    .map(r => ({ id: r[0], nome: r[2] || '', ala: (r[10] || 'Sem Ala').trim(), cadastro: parseDataFlex(r[11]) }));

  const porAla = {};
  renovados.forEach(c => { (porAla[c.ala] = porAla[c.ala] || []).push(c); });
  if (Object.keys(porAla).length === 0) return;

  // Cria as abas "Ala - X" que ainda não existem
  const existentes = new Set(titulos);
  const aCriar = Object.keys(porAla).map(ala => `Ala - ${ala}`).filter(nome => !existentes.has(nome));
  if (aCriar.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: idPresencas,
      requestBody: { requests: aCriar.map(title => ({ addSheet: { properties: { title } } })) },
    });
  }

  // Monta cada matriz e grava tudo em lote (limpa antes, pois o roster pode encolher)
  const dados = Object.entries(porAla).map(([ala, comps]) => {
    comps.sort((a, b) => a.nome.localeCompare(b.nome));
    const corpo = comps.map(c => {
      const celulas = presentesPorData.map(p => {
        if (p.ids.has(c.id)) return 'P';
        const dataEnsaio = parseDataFlex(p.label);
        return (!c.cadastro || !dataEnsaio || dataEnsaio >= c.cadastro) ? 'A' : '';
      });
      return [c.id, c.nome, ...celulas];
    });
    return { range: `Ala - ${ala}!A1`, values: [['ID', 'Nome', ...colunasData], ...corpo] };
  });

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId: idPresencas,
    requestBody: { ranges: Object.keys(porAla).map(ala => `Ala - ${ala}`) },
  });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: idPresencas,
    requestBody: { valueInputOption: 'RAW', data: dados },
  });

  if (opcoes.reconstruirResumos) {
    const alaPorId = new Map(renovados.map(c => [c.id, c.ala]));
    const totalPorAla = {};
    renovados.forEach(c => { totalPorAla[c.ala] = (totalPorAla[c.ala] || 0) + 1; });
    const totalRenovados = renovados.length;

    const linhasGeral = [['Data', 'Presentes', 'Ausentes']];
    const linhasAlas = [['Data', 'Ala', 'Presentes', 'Ausentes']];

    presentesPorData.forEach(p => {
      const presPorAla = {};
      let presRenov = 0;
      p.ids.forEach(id => {
        const ala = alaPorId.get(id);
        if (ala !== undefined) { presRenov += 1; presPorAla[ala] = (presPorAla[ala] || 0) + 1; }
      });
      linhasGeral.push([p.label, presRenov, totalRenovados - presRenov]);
      Object.keys(totalPorAla).sort().forEach(ala => {
        linhasAlas.push([p.label, ala, presPorAla[ala] || 0, totalPorAla[ala] - (presPorAla[ala] || 0)]);
      });
    });

    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: idPresencas,
      requestBody: { ranges: ['Geral!A:C', 'Alas!A:D'] },
    });
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: idPresencas,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: 'Geral!A1', values: linhasGeral },
          { range: 'Alas!A1', values: linhasAlas },
        ],
      },
    });
  }
}

// --- ROTA 5: Busca Dados Cadastrais e Histórico ---
app.get('/dados-relatorio', async (req, res) => {
  try {
    const [responseInscritos, responseLimites] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:N' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'ConfigAlas!A:B' }).catch(() => ({ data: { values: [] } }))
    ]);

    const linhasInscritos = responseInscritos.data.values || [];
    const linhasLimites = responseLimites.data.values || [];

    const componentes = linhasInscritos.length > 1 ? linhasInscritos.slice(1).map(row => ({
      id: row[0] || '', tipoCadastro: row[1] || '', nome: row[2] || '', cpf: row[3] || '', telefone: row[4] || 'Não informado', ala: row[10] || 'Sem Ala', data: row[11] || '', fotoUrl: row[12] || '', renovado: row[13] || 'Não'
    })) : [];

    const limitesAlas = {};
    if (linhasLimites.length > 1) {
      linhasLimites.slice(1).forEach(row => { if (row[0]) limitesAlas[row[0].trim()] = parseInt(row[1] || '0', 10); });
    }

    // --- Monta os gráficos de frequência considerando SÓ quem está com renovado = "Sim" ---
    // A aba "Geral" e "Alas" guardam totais já somados na hora do ensaio (sem distinguir
    // renovado ou não). Pra filtrar de verdade, recalculamos a partir da lista nominal de
    // presentes de cada ensaio, cruzando com quem hoje está marcado como renovado.
    const idArquivoPresencas = process.env.PRESENCAS_SPREADSHEET_ID;

    const renovadosPorId = new Map();
    const totalRenovadosPorAla = {};
    linhasInscritos.slice(1).forEach(row => {
      if ((row[13] || '') === 'Sim') {
        const ala = row[10] || 'Sem Ala';
        renovadosPorId.set(row[0], ala);
        totalRenovadosPorAla[ala] = (totalRenovadosPorAla[ala] || 0) + 1;
      }
    });

    const planilhaPresencasInfo = await sheets.spreadsheets.get({ spreadsheetId: idArquivoPresencas });
    const abasDeEnsaio = (planilhaPresencasInfo.data.sheets || [])
      .map(aba => aba.properties.title)
      .filter(ehAbaDeEnsaio);

    let dadosPresencas = [];
    let historicoAlas = [];

    if (abasDeEnsaio.length > 0 && renovadosPorId.size > 0) {
      const respostaLote = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: idArquivoPresencas,
        ranges: abasDeEnsaio.map(titulo => `${titulo}!A2:A`),
      });

      const totalRenovados = renovadosPorId.size;

      dadosPresencas = abasDeEnsaio.map((titulo, indice) => {
        const idsPresentes = (respostaLote.data.valueRanges?.[indice]?.values || []).map(linha => linha[0]);
        const presentesPorAla = {};
        let presentesRenovados = 0;

        idsPresentes.forEach(id => {
          if (renovadosPorId.has(id)) {
            presentesRenovados += 1;
            const ala = renovadosPorId.get(id);
            presentesPorAla[ala] = (presentesPorAla[ala] || 0) + 1;
          }
        });

        Object.keys(totalRenovadosPorAla).forEach(ala => {
          historicoAlas.push({
            data: titulo.replaceAll('-', '/'),
            ala,
            presentes: presentesPorAla[ala] || 0,
            ausentes: totalRenovadosPorAla[ala] - (presentesPorAla[ala] || 0),
          });
        });

        return {
          data: titulo.replaceAll('-', '/'),
          presentes: presentesRenovados,
          ausentes: totalRenovados - presentesRenovados,
        };
      });

      dadosPresencas.sort((a, b) => converterDataBR(a.data) - converterDataBR(b.data));
      historicoAlas.sort((a, b) => converterDataBR(a.data) - converterDataBR(b.data));
    }

    res.json({ componentes, limitesAlas, dadosPresencas, historicoAlas });
  } catch (error) {
    console.error('Erro crítico ao consolidar relatórios:', error);
    res.status(500).json({ error: 'Erro ao processar dados gerenciais.' });
  }
});

// --- ROTA 6: Salvar Nova Frequência de Ensaio na Planilha ---
app.post('/registrar-presenca', async (req, res) => {
  try {
    const { data, presentes, ausentes } = req.body;

    // Validação simples dos dados recebidos
    if (!data || presentes === undefined || ausentes === undefined) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    // Adiciona os dados como uma nova linha na aba 'Presencas'
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Presencas!A:C',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[data, presentes, ausentes]], // Alinha com as colunas Data, Presentes e Ausentes
      },
    });

    res.json({ success: true, message: 'Presença gravada com sucesso!' });

  } catch (error) {
    console.error('Erro ao registrar presença no Sheets:', error);
    res.status(500).json({ error: 'Erro interno ao salvar frequência.' });
  }
});

// --- ROTA 7: Registro Individual (Soma +1 na data especificada) ---
app.post('/marcar-presenca-individual', async (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({ error: 'A data do ensaio é obrigatória.' });
    }

    // 1. Puxa todos os dados atuais da aba Presencas
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Presencas!A:C',
    });

    const linhas = response.data.values || [];
    let linhaEncontradaIndex = -1;
    let presentesAtuais = 0;

    // 2. Procura se a data já existe (ignorando o cabeçalho)
    for (let i = 1; i < linhas.length; i++) {
      if (linhas[i][0] === data) {
        linhaEncontradaIndex = i;
        presentesAtuais = parseInt(linhas[i][1] || '0', 10);
        break;
      }
    }

    if (linhaEncontradaIndex !== -1) {
      // 3A. Se a data existe, atualiza SÓ a célula de Presentes daquela linha
      // O Google Sheets começa a contar do 1. Linha do array + 1 = Linha exata na planilha
      const celulaExata = `Presencas!B${linhaEncontradaIndex + 1}`; 
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: celulaExata,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[presentesAtuais + 1]],
        },
      });
    } else {
      // 3B. Se a data não existe, cria uma nova linha com 1 presente e 0 ausentes
      await sheets.spreadsheets.values.append({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Presencas!A:C',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [[data, 1, 0]],
        },
      });
    }

    res.json({ success: true, message: 'Presença computada com sucesso!' });

  } catch (error) {
    console.error('Erro ao somar presença individual:', error);
    res.status(500).json({ error: 'Erro interno ao salvar frequência.' });
  }
});

// --- ROTA 8: Grava Presenças e Ausências por Ala ---
app.post('/registrar-ensaio-completo', async (req, res) => {
  try {
    const { data, presentes, ausentes, listaNominal, estatisticasAlas } = req.body;
    if (!data) return res.status(400).json({ error: 'A data é obrigatória.' });

    const idArquivoPresencas = process.env.PRESENCAS_SPREADSHEET_ID;
    const nomeNovaAba = data.replaceAll('/', '-');

    await sheets.spreadsheets.values.append({
      spreadsheetId: idArquivoPresencas, range: 'Geral!A:C', valueInputOption: 'USER_ENTERED',
      resource: { values: [[data, presentes, ausentes]] },
    });

    // GRAVA AS ESTATÍSTICAS DETALHADAS POR ALA (Incluindo Ausentes)
    if (estatisticasAlas && estatisticasAlas.length > 0) {
      const linhasAlas = estatisticasAlas.map(est => [data, est.ala, est.presentes, est.ausentes]);
      await sheets.spreadsheets.values.append({
        spreadsheetId: idArquivoPresencas, range: 'Alas!A:D', valueInputOption: 'USER_ENTERED',
        resource: { values: linhasAlas },
      });
    }

    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: idArquivoPresencas,
        resource: { requests: [{ addSheet: { properties: { title: nomeNovaAba } } }] }
      });
    } catch (e) { }

    if (listaNominal && listaNominal.length > 0) {
      const linhasNominais = listaNominal.map(comp => [comp.id, comp.nome, comp.ala]);
      await sheets.spreadsheets.values.append({
        spreadsheetId: idArquivoPresencas, range: `${nomeNovaAba}!A:C`, valueInputOption: 'USER_ENTERED',
        resource: { values: [['ID do Componente', 'Nome do Componente', 'Ala'], ...linhasNominais] },
      });
    }

    // Reconstrói as abas "Ala - X" (matriz nominal de presenças/ausências).
    // Falha aqui não invalida o ensaio: os registros principais já foram gravados.
    try {
      const idsPresentes = new Set((listaNominal || []).map(comp => comp.id).filter(Boolean));
      await reconstruirMatrizesPorAla({ label: data, ids: idsPresentes });
    } catch (e) {
      console.error('Falha ao reconstruir matrizes por ala:', e);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar ensaio completo:', error);
    res.status(500).json({ error: 'Erro interno ao salvar os registros.' });
  }
});

// --- ROTA 8b: Importa uma lista de IDs como presentes numa data ---
// Resolve nome/ala pelo cadastro, mescla (ou substitui) a aba da data,
// reconstrói a matriz por ala e os resumos Geral/Alas.
app.post('/importar-presencas', async (req, res) => {
  try {
    const { data, ids, modo } = req.body;
    if (!data) return res.status(400).json({ error: 'A data é obrigatória.' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Informe ao menos um ID.' });

    const dataObj = parseDataFlex(data);
    if (!dataObj) return res.status(400).json({ error: 'Data inválida.' });
    const dd = String(dataObj.getDate()).padStart(2, '0');
    const mm = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dataLabel = `${dd}/${mm}/${dataObj.getFullYear()}`;
    const nomeAba = `${dd}-${mm}-${dataObj.getFullYear()}`;

    const idPresencas = process.env.PRESENCAS_SPREADSHEET_ID;
    const normId = (x) => {
      const d = String(x).replace(/\D/g, '');
      return d ? d.padStart(8, '0') : '';
    };

    const idsEntrada = [...new Set(ids.map(normId).filter(Boolean))];

    // Resolve nome/ala pelo cadastro
    const respInscritos = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:N',
    });
    const mapaInscritos = new Map();
    (respInscritos.data.values || []).slice(1).forEach(r => {
      if (r[0]) mapaInscritos.set(normId(r[0]), { id: r[0], nome: r[2] || '', ala: (r[10] || 'Sem Ala').trim() });
    });

    const encontrados = [];
    const naoEncontrados = [];
    idsEntrada.forEach(id => {
      const info = mapaInscritos.get(id);
      if (info) encontrados.push(info);
      else naoEncontrados.push(id);
    });

    // Garante a aba da data
    const infoPlanilha = await sheets.spreadsheets.get({ spreadsheetId: idPresencas });
    const abaExiste = (infoPlanilha.data.sheets || []).some(s => s.properties.title === nomeAba);
    if (!abaExiste) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: idPresencas,
        requestBody: { requests: [{ addSheet: { properties: { title: nomeAba } } }] },
      });
    }

    // Lista final = (existentes, se mesclar) + encontrados, sem duplicar
    const porId = new Map();
    if ((modo || 'mesclar') !== 'substituir' && abaExiste) {
      const respAba = await sheets.spreadsheets.values.get({ spreadsheetId: idPresencas, range: `${nomeAba}!A2:C` });
      (respAba.data.values || []).filter(r => r[0]).forEach(r => {
        porId.set(normId(r[0]), { id: r[0], nome: r[1] || '', ala: (r[2] || 'Sem Ala').trim() });
      });
    }
    encontrados.forEach(c => porId.set(normId(c.id), c));
    const listaFinal = [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome));

    // Reescreve a aba da data
    await sheets.spreadsheets.values.clear({ spreadsheetId: idPresencas, range: nomeAba });
    await sheets.spreadsheets.values.update({
      spreadsheetId: idPresencas, range: `${nomeAba}!A1`, valueInputOption: 'RAW',
      requestBody: {
        values: [['ID do Componente', 'Nome do Componente', 'Ala'], ...listaFinal.map(c => [c.id, c.nome, c.ala])],
      },
    });

    // Matriz por ala + resumos Geral/Alas
    await reconstruirMatrizesPorAla(
      { label: dataLabel, ids: new Set(listaFinal.map(c => c.id)) },
      { reconstruirResumos: true }
    );

    res.json({
      success: true,
      data: dataLabel,
      adicionados: encontrados.length,
      totalPresentesNaData: listaFinal.length,
      naoEncontrados,
    });
  } catch (error) {
    console.error('Erro ao importar presenças:', error);
    res.status(500).json({ error: 'Erro interno ao importar presenças.' });
  }
});

// --- ROTA 8c: Consulta a chamada de uma data (presentes/ausentes + lista) ---
app.get('/presencas-da-data', async (req, res) => {
  try {
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'Data não informada.' });

    const dataObj = parseDataFlex(data);
    if (!dataObj) return res.status(400).json({ error: 'Data inválida.' });
    const dd = String(dataObj.getDate()).padStart(2, '0');
    const mm = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dataLabel = `${dd}/${mm}/${dataObj.getFullYear()}`;
    const nomeAba = `${dd}-${mm}-${dataObj.getFullYear()}`;

    const idPresencas = process.env.PRESENCAS_SPREADSHEET_ID;
    const normId = (x) => { const d = String(x).replace(/\D/g, ''); return d ? d.padStart(8, '0') : ''; };

    const [infoPlanilha, respInscritos] = await Promise.all([
      sheets.spreadsheets.get({ spreadsheetId: idPresencas }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:N' }),
    ]);

    const renovados = (respInscritos.data.values || []).slice(1).filter(r => (r[13] || '') === 'Sim');
    const totalRenovados = renovados.length;
    const idsRenovados = new Set(renovados.map(r => normId(r[0])));

    const abaExiste = (infoPlanilha.data.sheets || []).some(s => s.properties.title === nomeAba);
    if (!abaExiste) {
      return res.json({ existe: false, data: dataLabel, presentes: 0, presentesRenovados: 0, ausentes: totalRenovados, listaPresentes: [] });
    }

    const respAba = await sheets.spreadsheets.values.get({ spreadsheetId: idPresencas, range: `${nomeAba}!A2:C` });
    const listaPresentes = (respAba.data.values || [])
      .filter(r => r[0])
      .map(r => ({ id: r[0], nome: r[1] || '', ala: (r[2] || 'Sem Ala').trim() }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    const idsPresentesSet = new Set(listaPresentes.map(c => normId(c.id)));
    const presentesRenovados = listaPresentes.filter(c => idsRenovados.has(normId(c.id))).length;

    // Ausentes = componentes renovados que não constam como presentes nessa data
    const listaAusentes = renovados
      .filter(r => !idsPresentesSet.has(normId(r[0])))
      .map(r => ({ id: r[0], nome: r[2] || '', ala: (r[10] || 'Sem Ala').trim() }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    res.json({
      existe: true,
      data: dataLabel,
      presentes: listaPresentes.length,
      presentesRenovados,
      ausentes: totalRenovados - presentesRenovados,
      listaPresentes,
      listaAusentes,
    });
  } catch (error) {
    console.error('Erro ao consultar presenças da data:', error);
    res.status(500).json({ error: 'Erro interno ao consultar a data.' });
  }
});

// --- ROTA 9 - DE EXCLUSÃO ---
app.delete('/excluir-cadastro/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Localiza a linha do cadastro pelo ID (coluna A)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:A',
    });

    const linhas = response.data.values || [];
    const indiceLinha = linhas.findIndex((linha) => linha[0] === id);

    if (indiceLinha === -1) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    // 2. Descobre o ID numérico interno da aba "Inscricoes" (necessário para o batchUpdate)
    const planilhaInfo = await sheets.spreadsheets.get({ spreadsheetId: process.env.SPREADSHEET_ID });
    const abaInscricoes = planilhaInfo.data.sheets.find((s) => s.properties.title === 'Inscricoes');

    if (!abaInscricoes) {
      return res.status(500).json({ error: 'Aba "Inscricoes" não encontrada na planilha.' });
    }

    // 3. Remove a linha inteira da planilha
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: process.env.SPREADSHEET_ID,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: abaInscricoes.properties.sheetId,
              dimension: 'ROWS',
              startIndex: indiceLinha,
              endIndex: indiceLinha + 1,
            },
          },
        }],
      },
    });

    res.json({ success: true, message: 'Cadastro excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir cadastro:', error);
    res.status(500).json({ error: 'Erro interno ao excluir cadastro.' });
  }
});

// --- ROTA 11: Proxy de imagens do Drive (evita bloqueio de CORS no canvas) ---
app.get('/proxy-imagem', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL não informada.');

    const respostaImagem = await fetch(url);
    if (!respostaImagem.ok) return res.status(502).send('Erro ao buscar imagem.');

    const buffer = Buffer.from(await respostaImagem.arrayBuffer());
    res.set('Content-Type', respostaImagem.headers.get('content-type') || 'image/jpeg');
    res.send(buffer);
  } catch (error) {
    console.error('Erro no proxy de imagem:', error);
    res.status(500).send('Erro interno ao buscar imagem.');
  }
});

// --- ROTA 12: Salvar a carteirinha gerada (imagem) no Drive ---
app.post('/salvar-carteirinha', upload.single('imagem'), async (req, res) => {
  try {
    const { id, nome } = req.body;
    const imagem = req.file;

    if (!id || !nome || !imagem) {
      return res.status(400).json({ error: 'Dados incompletos para gerar a carteirinha.' });
    }

    const imageBase64 = imagem.buffer.toString('base64');

    const responseAppScript = await fetch(process.env.URL_WEB_APP, {
      method: 'POST',
      body: JSON.stringify({
        base64: imageBase64,
        mimeType: imagem.mimetype,
        filename: `Carteirinha_${id}_${nome}.png`,
        folderId: process.env.CARTEIRINHAS_FOLDER_ID
      })
    });

    const scriptData = await responseAppScript.json();

    if (!scriptData.sucesso && !scriptData.success) {
      return res.status(500).json({ error: 'Erro ao salvar carteirinha no Drive: ' + (scriptData.erro || scriptData.error) });
    }

    // Marca a coluna P (carteirinha gerada) da linha correspondente ao ID.
    // Falha aqui não invalida o upload: a imagem já está no Drive.
    try {
      const respLinhas = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: 'Inscricoes!A:A',
      });
      const linhas = respLinhas.data.values || [];
      const indiceLinha = linhas.findIndex(linha => linha[0] === id);
      if (indiceLinha !== -1) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: process.env.SPREADSHEET_ID,
          range: `Inscricoes!P${indiceLinha + 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['Sim']] },
        });
      }
    } catch (e) {
      console.error('Falha ao marcar carteirinha como gerada na planilha:', e);
    }

    res.json({ success: true, message: 'Carteirinha salva com sucesso!', url: scriptData.url });
  } catch (error) {
    console.error('Erro ao salvar carteirinha:', error);
    res.status(500).json({ error: 'Erro interno ao salvar a carteirinha.' });
  }
});

// --- ROTA 15: Lista os componentes de uma ala (para geração de carteirinhas em lote) ---
app.get('/componentes-por-ala', async (req, res) => {
  try {
    const { ala } = req.query;
    if (!ala) return res.status(400).json({ error: 'Ala não informada.' });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:P',
    });

    const rows = response.data.values || [];
    const alaTratada = ala.trim().toLowerCase();

    const componentes = rows.slice(1)
      .filter(row => (row[10] || '').trim().toLowerCase() === alaTratada)
      .map(row => ({
        id: row[0],
        nome: row[2],
        ala: row[10],
        data: row[11],
        fotoUrl: row[12],
        renovado: row[13] || 'Não',
        carteirinhaGerada: row[15] || 'Não',
      }));

    res.json(componentes);
  } catch (error) {
    console.error('Erro ao listar componentes por ala:', error);
    res.status(500).json({ error: 'Erro interno ao listar componentes da ala.' });
  }
});

// --- ROTA 10 - DE ATUALIZAÇÃO ---
app.put('/atualizar-cadastro/:id', upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tipoCadastro, nome, cpf, telefone, cep, rua, bairro, cidade, numero, complemento, ala, data } = req.body;
    const novaFoto = req.file;

    if (!nome || !cpf) {
      return res.status(400).json({ error: 'Dados essenciais incompletos.' });
    }

    // 1. Localiza a linha do cadastro pelo ID (coluna A)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:P',
    });

    const linhas = response.data.values || [];
    const indiceLinha = linhas.findIndex(row => row[0] === id);

    if (indiceLinha === -1) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    let fotoUrl = linhas[indiceLinha][12] || '';
    const renovado = linhas[indiceLinha][13] || 'Não'; // Edição não mexe na renovação
    const carteirinhaGerada = linhas[indiceLinha][15] || 'Não'; // Edição não mexe no status da carteirinha

    // 2. Se uma nova foto foi enviada, sobe pro Drive via o mesmo Web App do cadastro
    if (novaFoto) {
      const imageBase64 = novaFoto.buffer.toString('base64');
      const responseAppScript = await fetch(process.env.URL_WEB_APP, {
        method: 'POST',
        body: JSON.stringify({
          base64: imageBase64,
          mimeType: novaFoto.mimetype,
          filename: `Inscricao_${id}_${nome}.jpg`,
          folderId: process.env.DRIVE_FOLDER_ID
        })
      });
      const scriptData = await responseAppScript.json();

      if (!scriptData.sucesso && !scriptData.success) {
        return res.status(500).json({ error: 'Erro ao salvar nova foto no Drive: ' + (scriptData.erro || scriptData.error) });
      }
      fotoUrl = scriptData.url;
    }

    // 3. Atualiza a linha inteira na planilha
    const linhaPlanilha = indiceLinha + 1; // Sheets é 1-indexado
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `Inscricoes!A${linhaPlanilha}:P${linhaPlanilha}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data, fotoUrl, renovado, cidade || '', carteirinhaGerada]],
      },
    });

    res.json({ success: true, message: 'Cadastro atualizado com sucesso!', fotoUrl });
  } catch (error) {
    console.error('Erro ao atualizar cadastro:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar cadastro.' });
  }
});

// --- ROTA 13: Marcar/Desmarcar a renovação do cadastro (coluna N) ---
app.put('/marcar-renovacao/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { renovado } = req.body;

    if (renovado !== 'Sim' && renovado !== 'Não') {
      return res.status(400).json({ error: 'Valor de renovado inválido. Use "Sim" ou "Não".' });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:A',
    });

    const linhas = response.data.values || [];
    const indiceLinha = linhas.findIndex(row => row[0] === id);

    if (indiceLinha === -1) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    const linhaPlanilha = indiceLinha + 1; // Sheets é 1-indexado
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: `Inscricoes!N${linhaPlanilha}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[renovado]],
      },
    });

    res.json({ success: true, renovado });
  } catch (error) {
    console.error('Erro ao marcar renovação:', error);
    res.status(500).json({ error: 'Erro interno ao marcar renovação.' });
  }
});

// --- ROTA 14: Frequência histórica de um componente (presenças e faltas) ---
// Ausência só conta a partir da data de cadastro do componente.
app.get('/frequencia/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idArquivoPresencas = process.env.PRESENCAS_SPREADSHEET_ID;

    const [planilhaInfo, respInscritos] = await Promise.all([
      sheets.spreadsheets.get({ spreadsheetId: idArquivoPresencas }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:L' }),
    ]);

    const linhaComp = (respInscritos.data.values || []).find(row => row[0] === id);
    const dataCadastro = linhaComp ? parseDataFlex(linhaComp[11]) : null;

    const abasDeEnsaio = (planilhaInfo.data.sheets || [])
      .map(aba => aba.properties.title)
      .filter(ehAbaDeEnsaio);

    if (abasDeEnsaio.length === 0) {
      return res.json({ presencas: 0, ausencias: 0, totalEnsaios: 0 });
    }

    const respostaLote = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: idArquivoPresencas,
      ranges: abasDeEnsaio.map(titulo => `${titulo}!A2:A`),
    });

    let presencas = 0;
    let ausencias = 0;
    abasDeEnsaio.forEach((titulo, indice) => {
      const idsPresentes = (respostaLote.data.valueRanges?.[indice]?.values || []).map(linha => linha[0]);
      if (idsPresentes.includes(id)) {
        presencas += 1;
      } else {
        const dataEnsaio = parseDataFlex(titulo.replaceAll('-', '/'));
        if (!dataCadastro || !dataEnsaio || dataEnsaio >= dataCadastro) ausencias += 1;
      }
    });

    res.json({ presencas, ausencias, totalEnsaios: presencas + ausencias });
  } catch (error) {
    console.error('Erro ao calcular frequência:', error);
    res.status(500).json({ error: 'Erro interno ao calcular frequência.' });
  }
});

// --- ROTA 16: Frequência de TODOS os componentes (lê as abas "Ala - X") ---
// presenças = nº de "P" na linha do componente; ausências = nº de "A".
app.get('/frequencia-geral', async (req, res) => {
  try {
    const idArquivoPresencas = process.env.PRESENCAS_SPREADSHEET_ID;

    const [planilhaInfo, respInscritos] = await Promise.all([
      sheets.spreadsheets.get({ spreadsheetId: idArquivoPresencas }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:N' }),
    ]);

    const renovadoPorId = new Map();
    (respInscritos.data.values || []).slice(1).forEach(row => renovadoPorId.set(row[0], row[13] || 'Não'));

    const titulos = (planilhaInfo.data.sheets || []).map(aba => aba.properties.title);
    const abasAla = titulos.filter(t => t.startsWith('Ala - '));
    const totalEnsaios = titulos.filter(ehAbaDeEnsaio).length;

    const componentes = [];
    if (abasAla.length > 0) {
      const respostaLote = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: idArquivoPresencas,
        ranges: abasAla.map(t => `${t}!A2:ZZZ`),
      });
      (respostaLote.data.valueRanges || []).forEach((intervalo, indice) => {
        const ala = abasAla[indice].replace(/^Ala - /, '');
        (intervalo.values || []).forEach(row => {
          const id = row[0];
          if (!id) return;
          const marcas = row.slice(2);
          componentes.push({
            id,
            nome: row[1] || '',
            ala,
            renovado: renovadoPorId.get(id) || 'Não',
            presencas: marcas.filter(m => m === 'P').length,
            ausencias: marcas.filter(m => m === 'A').length,
          });
        });
      });
    }

    res.json({ totalEnsaios, componentes });
  } catch (error) {
    console.error('Erro ao calcular frequência geral:', error);
    res.status(500).json({ error: 'Erro interno ao calcular frequência geral.' });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
// O sistema utilizará a variável PORT que já foi declarada no topo do arquivo
app.listen(PORT, () => {
  console.log(`Servidor rodando e aguardando conexões na porta ${PORT}`);
});