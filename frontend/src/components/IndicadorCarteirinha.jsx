import React, { useState } from 'react';
import api from '../utils/api';
import { dataURLParaArquivo } from '../utils/imagem';
import { gerarImagemCarteirinha } from '../utils/carteirinha';

// Mostra o status da carteirinha do componente ("Carteirinha ✅ / ❌").
// Se ainda não foi gerada, o texto vira um botão: ao clicar, gera a carteirinha
// individual (PNG transparente), salva no Drive e marca a coluna P como "Sim".
function IndicadorCarteirinha({ componente, aoGerar }) {
  const [gerando, setGerando] = useState(false);
  const gerada = componente.carteirinhaGerada === 'Sim';

  const gerar = async () => {
    if (gerando || gerada) return;
    setGerando(true);
    try {
      const imagemDataUrl = await gerarImagemCarteirinha({
        id: componente.id,
        nome: componente.nome,
        ala: componente.ala,
        data: componente.data,
        fotoUrl: componente.fotoUrl,
      });
      const arquivo = dataURLParaArquivo(imagemDataUrl, `carteirinha-${componente.id}.png`);

      const formData = new FormData();
      formData.append('id', componente.id);
      formData.append('nome', componente.nome);
      formData.append('imagem', arquivo);

      await api.post('/salvar-carteirinha', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      aoGerar?.(componente.id);
    } catch (err) {
      console.error('Erro ao gerar carteirinha individual:', err);
      alert('Erro ao gerar a carteirinha. Tente novamente.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <span
      onClick={gerada ? undefined : gerar}
      title={gerada ? 'Carteirinha gerada' : 'Clique para gerar a carteirinha'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '14px',
        fontWeight: 'bold',
        color: gerada ? '#005c33' : '#ef4444',
        cursor: gerada ? 'default' : 'pointer',
      }}
    >
      Carteirinha {gerando ? '⏳' : gerada ? '✅' : '❌'}
    </span>
  );
}

export default IndicadorCarteirinha;
