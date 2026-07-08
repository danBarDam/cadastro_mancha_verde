import JsBarcode from 'jsbarcode';
import { converterLinkDrive } from './imagem';
import { API_BASE_URL } from './config';

const VERDE = '#005c33';
const LARGURA = 640;
const ALTURA = 1000;

const carregarImagem = (src, crossOrigin) => new Promise((resolve, reject) => {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = crossOrigin;
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const quebrarTexto = (ctx, texto, maxWidth) => {
  const palavras = texto.split(' ');
  const linhas = [];
  let linhaAtual = '';

  palavras.forEach((palavra) => {
    const teste = linhaAtual ? `${linhaAtual} ${palavra}` : palavra;
    if (ctx.measureText(teste).width > maxWidth && linhaAtual) {
      linhas.push(linhaAtual);
      linhaAtual = palavra;
    } else {
      linhaAtual = teste;
    }
  });
  if (linhaAtual) linhas.push(linhaAtual);
  return linhas;
};

// Gera a imagem (dataURL PNG) da carteirinha padrão: foto, nome, ala, ID e código de barras
export async function gerarImagemCarteirinha({ id, nome, ala, data, fotoSrc, fotoUrl }) {
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = ALTURA;
  const ctx = canvas.getContext('2d');
  // Canvas começa transparente por padrão (sem fillRect de fundo) — só os
  // elementos desenhados abaixo (cabeçalho, foto, textos, código de barras) ficam opacos.

  // Cabeçalho verde
  ctx.fillStyle = VERDE;
  ctx.fillRect(0, 0, LARGURA, 170);

  try {
    const logo = await carregarImagem('/logo-mancha.png');
    ctx.drawImage(logo, 40, 50, 70, 70);
  } catch (e) {
    console.warn('Não foi possível carregar o logo do clube:', e);
  }

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.font = 'bold 13px Arial';
  ctx.fillText('G.R.C.E.S.', 130, 80);
  ctx.font = '900 26px Arial';
  ctx.fillText('MANCHA VERDE', 130, 112);

  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('CARTEIRINHA DE COMPONENTE', LARGURA / 2, 205);

  // Foto (recorte quadrado arredondado, tipo object-fit: cover)
  const TAM_FOTO = 260;
  const fotoX = (LARGURA - TAM_FOTO) / 2;
  const fotoY = 230;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(fotoX, fotoY, TAM_FOTO, TAM_FOTO, 16);
  ctx.clip();
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(fotoX, fotoY, TAM_FOTO, TAM_FOTO);

  try {
    const origemFoto = fotoSrc || `${API_BASE_URL}/proxy-imagem?url=${encodeURIComponent(converterLinkDrive(fotoUrl))}`;
    const foto = await carregarImagem(origemFoto, fotoSrc ? undefined : 'anonymous');
    const escala = Math.max(TAM_FOTO / foto.width, TAM_FOTO / foto.height);
    const larguraDesenho = foto.width * escala;
    const alturaDesenho = foto.height * escala;
    const offsetX = fotoX + (TAM_FOTO - larguraDesenho) / 2;
    const offsetY = fotoY + (TAM_FOTO - alturaDesenho) / 2;
    ctx.drawImage(foto, offsetX, offsetY, larguraDesenho, alturaDesenho);
  } catch (e) {
    console.warn('Não foi possível carregar a foto do componente:', e);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '80px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👤', LARGURA / 2, fotoY + TAM_FOTO / 2 + 25);
  }
  ctx.restore();

  ctx.lineWidth = 4;
  ctx.strokeStyle = VERDE;
  ctx.beginPath();
  ctx.roundRect(fotoX, fotoY, TAM_FOTO, TAM_FOTO, 16);
  ctx.stroke();

  // Nome
  let y = fotoY + TAM_FOTO + 55;
  ctx.fillStyle = '#1e293b';
  ctx.textAlign = 'center';
  ctx.font = '900 28px Arial';
  const linhasNome = quebrarTexto(ctx, (nome || '').toUpperCase(), LARGURA - 80);
  linhasNome.forEach((linha) => {
    ctx.fillText(linha, LARGURA / 2, y);
    y += 34;
  });

  // Selo da Ala
  y += 25;
  const textoAla = `ALA: ${ala || 'NÃO INFORMADA'}`;
  ctx.font = 'bold 18px Arial';
  const larguraTexto = ctx.measureText(textoAla).width;
  const larguraBadge = larguraTexto + 50;
  const alturaBadge = 40;
  const badgeX = (LARGURA - larguraBadge) / 2;

  ctx.fillStyle = '#e8f5e9';
  ctx.beginPath();
  ctx.roundRect(badgeX, y - alturaBadge + 12, larguraBadge, alturaBadge, 20);
  ctx.fill();

  ctx.fillStyle = VERDE;
  ctx.fillText(textoAla, LARGURA / 2, y);

  // Matrícula
  y += 55;
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('MATRÍCULA', LARGURA / 2, y);

  y += 34;
  ctx.fillStyle = '#1e293b';
  ctx.font = '900 30px Arial';
  ctx.fillText(String(id), LARGURA / 2, y);

  // Código de barras (Code128) representando o ID numérico
  const canvasBarras = document.createElement('canvas');
  JsBarcode(canvasBarras, String(id), {
    format: 'CODE128',
    displayValue: false,
    height: 70,
    margin: 0,
    background: '#ffffff',
    lineColor: '#1e293b'
  });

  const larguraBarras = 420;
  const alturaBarras = (canvasBarras.height / canvasBarras.width) * larguraBarras;
  const barrasX = (LARGURA - larguraBarras) / 2;
  const barrasY = y + 30;
  ctx.drawImage(canvasBarras, barrasX, barrasY, larguraBarras, alturaBarras);

  // Rodapé
  if (data) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Arial';
    ctx.fillText(`Cadastrado em: ${data}`, LARGURA / 2, ALTURA - 25);
  }

  return canvas.toDataURL('image/png');
}
