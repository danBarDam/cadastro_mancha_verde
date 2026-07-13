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
    // O número da próxima inscrição é a quantidade de linhas atuais (descontando o cabeçalho) + 1
    let proximoNumero = linhas.length === 0 ? 1 : linhas.length;
    
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
    const { id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data } = req.body;
    const foto = req.file;

    if (!nome || !cpf || !foto) {
      return res.status(400).json({ error: 'Dados essenciais incompletos.' });
    }

    // 1. Converter a imagem em Base64 e enviar para o Microserviço no Apps Script
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

    const fotoUrl = scriptData.url;

    // 2. Salvar todos os dados na Planilha (mantido via Service Account)
    // A coluna N (depois da foto) começa sempre como "Não" - a renovação é
    // marcada manualmente depois, pela tela de Pesquisa.
    const dadosParaSalvar = [
      id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data, fotoUrl, 'Não'
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:N',
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
    const { termo } = req.query;

    if (!termo) return res.status(400).json({ error: 'Termo de busca não informado.' });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:N', // Coluna N = renovado (Sim/Não)
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) return res.json([]);

    const termoTratado = termo.toLowerCase().trim();
    const termoSemPontos = termoTratado.replace(/\D/g, '');

    const resultados = rows.filter((row, index) => {
      if (index === 0) return false;
      return row.some(celula => {
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
    }));

    res.json(dadosFormatados);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro interno ao realizar a busca.' });
  }
});

// --- ROTA 5: Busca Dados Cadastrais e Histórico ---
app.get('/dados-relatorio', async (req, res) => {
  try {
    const [responseInscritos, responseLimites] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'Inscricoes!A:N' }),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.SPREADSHEET_ID, range: 'ConfigAlas!A:B' }).catch(() => ({ data: { values: [] } }))
    ]);

    const [responseGeral, responseAlas] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.PRESENCAS_SPREADSHEET_ID, range: 'Geral!A:C' }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({ spreadsheetId: process.env.PRESENCAS_SPREADSHEET_ID, range: 'Alas!A:D' }).catch(() => ({ data: { values: [] } }))
    ]);

    const linhasInscritos = responseInscritos.data.values || [];
    const linhasLimites = responseLimites.data.values || [];
    const linhasGeral = responseGeral.data.values || [];
    const linhasAlas = responseAlas.data.values || [];

    const componentes = linhasInscritos.length > 1 ? linhasInscritos.slice(1).map(row => ({
      id: row[0] || '', nome: row[2] || '', cpf: row[3] || '', telefone: row[4] || 'Não informado', ala: row[10] || 'Sem Ala', fotoUrl: row[12] || '', renovado: row[13] || 'Não'
    })) : [];

    const limitesAlas = {};
    if (linhasLimites.length > 1) {
      linhasLimites.slice(1).forEach(row => { if (row[0]) limitesAlas[row[0].trim()] = parseInt(row[1] || '0', 10); });
    }

    const dadosPresencas = linhasGeral.length > 1 ? linhasGeral.slice(1).map(row => ({
      data: row[0] || '', presentes: parseInt(row[1] || '0', 10), ausentes: parseInt(row[2] || '0', 10)
    })) : [];

    // AGORA LÊ A COLUNA DE AUSENTES DA ALA (row[3])
    const historicoAlas = linhasAlas.length > 1 ? linhasAlas.slice(1).map(row => ({
      data: row[0] || '', ala: row[1] || '', presentes: parseInt(row[2] || '0', 10), ausentes: parseInt(row[3] || '0', 10)
    })) : [];

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

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar ensaio completo:', error);
    res.status(500).json({ error: 'Erro interno ao salvar os registros.' });
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

    res.json({ success: true, message: 'Carteirinha salva com sucesso!', url: scriptData.url });
  } catch (error) {
    console.error('Erro ao salvar carteirinha:', error);
    res.status(500).json({ error: 'Erro interno ao salvar a carteirinha.' });
  }
});

// --- ROTA 10 - DE ATUALIZAÇÃO ---
app.put('/atualizar-cadastro/:id', upload.single('foto'), async (req, res) => {
  try {
    const { id } = req.params;
    const { tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data } = req.body;
    const novaFoto = req.file;

    if (!nome || !cpf) {
      return res.status(400).json({ error: 'Dados essenciais incompletos.' });
    }

    // 1. Localiza a linha do cadastro pelo ID (coluna A)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'Inscricoes!A:N',
    });

    const linhas = response.data.values || [];
    const indiceLinha = linhas.findIndex(row => row[0] === id);

    if (indiceLinha === -1) {
      return res.status(404).json({ error: 'Cadastro não encontrado.' });
    }

    let fotoUrl = linhas[indiceLinha][12] || '';
    const renovado = linhas[indiceLinha][13] || 'Não'; // Edição não mexe na renovação

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
      range: `Inscricoes!A${linhaPlanilha}:N${linhaPlanilha}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, tipoCadastro, nome, cpf, telefone, cep, rua, bairro, numero, complemento, ala, data, fotoUrl, renovado]],
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
app.get('/frequencia/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const idArquivoPresencas = process.env.PRESENCAS_SPREADSHEET_ID;

    // 1. Lista as abas de ensaio já registradas (cada ensaio vira uma aba com o nome da data;
    // "Geral" e "Alas" são abas de controle, não contam como ensaios individuais)
    const planilhaInfo = await sheets.spreadsheets.get({ spreadsheetId: idArquivoPresencas });
    const abasDeEnsaio = (planilhaInfo.data.sheets || [])
      .map(aba => aba.properties.title)
      .filter(titulo => titulo !== 'Geral' && titulo !== 'Alas');

    if (abasDeEnsaio.length === 0) {
      return res.json({ presencas: 0, ausencias: 0, totalEnsaios: 0 });
    }

    // 2. Busca a lista nominal (coluna A = ID do componente presente) de todas as abas de uma vez
    const respostaLote = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: idArquivoPresencas,
      ranges: abasDeEnsaio.map(titulo => `${titulo}!A2:A`),
    });

    let presencas = 0;
    (respostaLote.data.valueRanges || []).forEach(intervalo => {
      const idsPresentes = (intervalo.values || []).map(linha => linha[0]);
      if (idsPresentes.includes(id)) presencas += 1;
    });

    const totalEnsaios = abasDeEnsaio.length;
    const ausencias = totalEnsaios - presencas;

    res.json({ presencas, ausencias, totalEnsaios });
  } catch (error) {
    console.error('Erro ao calcular frequência:', error);
    res.status(500).json({ error: 'Erro interno ao calcular frequência.' });
  }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
// O sistema utilizará a variável PORT que já foi declarada no topo do arquivo
app.listen(PORT, () => {
  console.log(`Servidor rodando e aguardando conexões na porta ${PORT}`);
});