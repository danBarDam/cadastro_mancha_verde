// Transforma o link de visualização do Drive em link direto de imagem (API de Thumbnails do Google)
export const converterLinkDrive = (url) => {
  if (!url) return '';

  let idArquivo = null;

  // Tenta extrair o ID se o link for do tipo /file/d/ID/view
  if (url.includes('/d/')) {
    const match = url.match(/\/d\/([^/]+)/);
    if (match) idArquivo = match[1];
  }
  // Tenta extrair o ID se o link for do tipo ?id=ID
  else if (url.includes('id=')) {
    const match = url.match(/[?&]id=([^&]+)/);
    if (match) idArquivo = match[1];
  }

  // Se conseguiu achar o ID da foto, monta o link à prova de bloqueios
  if (idArquivo) {
    // sz=w800 garante que a foto venha com boa qualidade (800 pixels)
    return `https://drive.google.com/thumbnail?id=${idArquivo}&sz=w800`;
  }

  return url; // Se não for do drive ou der erro, retorna original
};

// Converte um dataURL (ex: captura da webcam ou canvas) em um arquivo para envio via FormData
export const dataURLParaArquivo = (dataurl, filename) => {
  let arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while (n--) { u8arr[n] = bstr.charCodeAt(n); }
  return new File([u8arr], filename, { type: mime });
};
