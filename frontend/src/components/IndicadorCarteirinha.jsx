import React from 'react';

// Indicador visual (somente leitura) do status da carteirinha do componente:
// "Carteirinha ✅" quando já foi gerada (coluna P = "Sim"), "Carteirinha ❌" caso contrário.
function IndicadorCarteirinha({ componente }) {
  const gerada = componente.carteirinhaGerada === 'Sim';

  return (
    <span
      title={gerada ? 'Carteirinha gerada' : 'Carteirinha ainda não gerada'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontSize: '14px',
        fontWeight: 'bold',
        color: gerada ? '#005c33' : '#ef4444',
      }}
    >
      Carteirinha {gerada ? '✅' : '❌'}
    </span>
  );
}

export default IndicadorCarteirinha;
