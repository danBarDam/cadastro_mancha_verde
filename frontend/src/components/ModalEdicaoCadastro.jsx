import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import api from '../utils/api';
import { converterLinkDrive, dataURLParaArquivo } from '../utils/imagem';

// Cores mais claras para os campos de texto da área de edição
const inputEdicaoStyle = {
  width: '100%',
  padding: '8px',
  marginTop: '5px',
  borderRadius: '4px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  color: '#1e293b',
  boxSizing: 'border-box'
};
const labelEdicaoStyle = { display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: 'bold', color: '#1e293b' };

// Modal reutilizável de edição de cadastro (usado em Pesquisa e Carteirinhas)
function ModalEdicaoCadastro({ componente, aoFechar, aoSalvar }) {
  const [formEdicao, setFormEdicao] = useState({});
  const [alasLista, setAlasLista] = useState([]);
  const [carregandoCepEdicao, setCarregandoCepEdicao] = useState(false);
  const [novaFotoEdicao, setNovaFotoEdicao] = useState(null);
  const [cameraEdicaoAtiva, setCameraEdicaoAtiva] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState('');

  const webcamRefEdicao = useRef(null);

  useEffect(() => {
    async function carregarAlas() {
      try {
        const resposta = await api.get('/alas');
        setAlasLista(resposta.data.alas || []);
      } catch (error) {
        console.error('Erro ao carregar alas:', error);
      }
    }
    carregarAlas();
  }, []);

  useEffect(() => {
    if (!componente) return;
    setFormEdicao({
      tipoCadastro: componente.tipoCadastro || 'Novo',
      nome: componente.nome || '',
      cpf: componente.cpf || '',
      telefone: componente.telefone || '',
      cep: componente.cep || '',
      rua: componente.rua || '',
      bairro: componente.bairro || '',
      numero: componente.numero || '',
      complemento: componente.complemento || '',
      ala: componente.ala || '',
      data: componente.data || '',
    });
    setNovaFotoEdicao(null);
    setCameraEdicaoAtiva(false);
    setErroEdicao('');
  }, [componente]);

  const handleCampoEdicao = (campo, valor) => {
    setFormEdicao((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleCpfEdicaoChange = (e) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      value = value.replace(/(\d{3})(\d)/, '$1.$2');
      value = value.replace(/(\d{3})(\d)/, '$1.$2');
      value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      handleCampoEdicao('cpf', value);
    }
  };

  const handleCepEdicaoChange = async (e) => {
    const value = e.target.value.replace(/\D/g, '');
    handleCampoEdicao('cep', value);

    if (value.length === 8) {
      setCarregandoCepEdicao(true);
      try {
        const response = await axios.get(`https://viacep.com.br/ws/${value}/json/`);
        if (!response.data.erro) {
          handleCampoEdicao('rua', response.data.logradouro.toUpperCase());
          handleCampoEdicao('bairro', response.data.bairro.toUpperCase());
        }
      } catch (error) {
        console.error('Erro no CEP:', error);
      } finally {
        setCarregandoCepEdicao(false);
      }
    }
  };

  const alternarCameraEdicao = () => {
    setCameraEdicaoAtiva(!cameraEdicaoAtiva);
  };

  const capturarFotoEdicao = useCallback(() => {
    const imageSrc = webcamRefEdicao.current.getScreenshot();
    setNovaFotoEdicao(imageSrc);
    setCameraEdicaoAtiva(false);
  }, [webcamRefEdicao]);

  const salvarEdicao = async () => {
    if (!formEdicao.nome || !formEdicao.cpf) {
      setErroEdicao('Nome e CPF são obrigatórios.');
      return;
    }

    setSalvando(true);
    setErroEdicao('');

    try {
      const formData = new FormData();
      formData.append('tipoCadastro', formEdicao.tipoCadastro);
      formData.append('nome', formEdicao.nome);
      formData.append('cpf', formEdicao.cpf);
      formData.append('telefone', formEdicao.telefone);
      formData.append('cep', formEdicao.cep);
      formData.append('rua', formEdicao.rua);
      formData.append('bairro', formEdicao.bairro);
      formData.append('numero', formEdicao.numero);
      formData.append('complemento', formEdicao.complemento);
      formData.append('ala', formEdicao.ala);
      formData.append('data', formEdicao.data);

      if (novaFotoEdicao) {
        const arquivoFoto = dataURLParaArquivo(novaFotoEdicao, `${componente.id}-foto.jpg`);
        formData.append('foto', arquivoFoto);
      }

      const resposta = await api.put(
        `/atualizar-cadastro/${componente.id}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      aoSalvar({ ...componente, ...formEdicao, fotoUrl: resposta.data.fotoUrl || componente.fotoUrl });
    } catch (err) {
      console.error(err);
      setErroEdicao('Erro ao salvar alterações. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  };

  if (!componente) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px', overflowY: 'auto' }}>
      <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <h2 style={{ marginTop: 0, color: '#005c33' }}>Editar Cadastro #{componente.id}</h2>

        <div style={{ display: 'flex', gap: '15px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <label style={{ ...labelEdicaoStyle, flex: '1 1 150px' }}>
            Tipo de Inscrição:
            <select
              value={formEdicao.tipoCadastro || 'Novo'}
              onChange={(e) => handleCampoEdicao('tipoCadastro', e.target.value)}
              style={inputEdicaoStyle}
            >
              <option value="Novo">Cadastro Novo</option>
              <option value="Renovação">Renovação</option>
            </select>
          </label>

          <label style={{ ...labelEdicaoStyle, flex: '1 1 150px' }}>
            Data:
            <input
              type="date"
              value={formEdicao.data || ''}
              onChange={(e) => handleCampoEdicao('data', e.target.value)}
              style={inputEdicaoStyle}
            />
          </label>
        </div>

        <label style={labelEdicaoStyle}>
          Nome:
          <input
            type="text"
            value={formEdicao.nome || ''}
            onChange={(e) => handleCampoEdicao('nome', e.target.value.toUpperCase())}
            style={inputEdicaoStyle}
          />
        </label>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ ...labelEdicaoStyle, flex: '1 1 200px' }}>
            CPF:
            <input
              type="text"
              value={formEdicao.cpf || ''}
              onChange={handleCpfEdicaoChange}
              style={inputEdicaoStyle}
            />
          </label>

          <label style={{ ...labelEdicaoStyle, flex: '1 1 200px' }}>
            Telefone / WhatsApp:
            <input
              type="tel"
              value={formEdicao.telefone || ''}
              onChange={(e) => handleCampoEdicao('telefone', e.target.value)}
              style={inputEdicaoStyle}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ ...labelEdicaoStyle, flex: '1 1 120px' }}>
            CEP:
            <input
              type="text"
              value={formEdicao.cep || ''}
              onChange={handleCepEdicaoChange}
              maxLength="8"
              style={inputEdicaoStyle}
            />
            {carregandoCepEdicao && <span style={{ fontSize: '12px', color: '#64748b' }}>Buscando...</span>}
          </label>

          <label style={{ ...labelEdicaoStyle, flex: '2 1 250px' }}>
            Rua / Logradouro:
            <input
              type="text"
              value={formEdicao.rua || ''}
              onChange={(e) => handleCampoEdicao('rua', e.target.value.toUpperCase())}
              style={inputEdicaoStyle}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <label style={{ ...labelEdicaoStyle, flex: '1 1 150px' }}>
            Bairro:
            <input
              type="text"
              value={formEdicao.bairro || ''}
              onChange={(e) => handleCampoEdicao('bairro', e.target.value.toUpperCase())}
              style={inputEdicaoStyle}
            />
          </label>

          <label style={{ ...labelEdicaoStyle, flex: '1 1 100px' }}>
            Número:
            <input
              type="text"
              value={formEdicao.numero || ''}
              onChange={(e) => handleCampoEdicao('numero', e.target.value)}
              style={inputEdicaoStyle}
            />
          </label>

          <label style={{ ...labelEdicaoStyle, flex: '1 1 150px' }}>
            Complemento:
            <input
              type="text"
              value={formEdicao.complemento || ''}
              onChange={(e) => handleCampoEdicao('complemento', e.target.value)}
              style={inputEdicaoStyle}
            />
          </label>
        </div>

        <label style={labelEdicaoStyle}>
          Ala do Desfile:
          <select
            value={formEdicao.ala || ''}
            onChange={(e) => handleCampoEdicao('ala', e.target.value)}
            style={inputEdicaoStyle}
          >
            <option value="">Selecione a Ala...</option>
            {alasLista.map((nomeAla, idx) => (
              <option key={idx} value={nomeAla}>{nomeAla}</option>
            ))}
            {formEdicao.ala && !alasLista.includes(formEdicao.ala) && (
              <option value={formEdicao.ala}>{formEdicao.ala}</option>
            )}
          </select>
        </label>

        {/* Foto do Cadastro */}
        <div style={{ marginTop: '15px', marginBottom: '15px' }}>
          <span style={labelEdicaoStyle}>Foto:</span>

          {cameraEdicaoAtiva ? (
            <div>
              <Webcam
                audio={false}
                ref={webcamRefEdicao}
                screenshotFormat="image/jpeg"
                width="100%"
                style={{ borderRadius: '6px', marginBottom: '10px' }}
                videoConstraints={{ facingMode: "user" }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={capturarFotoEdicao} style={{ flex: 1, padding: '10px', backgroundColor: '#005c33', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Capturar Imagem
                </button>
                <button type="button" onClick={alternarCameraEdicao} style={{ flex: 1, padding: '10px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#f1f5f9', flexShrink: 0 }}>
                <img
                  src={novaFotoEdicao || converterLinkDrive(componente.fotoUrl)}
                  alt="Foto do cadastro"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  referrerPolicy="no-referrer"
                />
              </div>
              <button type="button" onClick={alternarCameraEdicao} style={{ padding: '8px 12px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                {novaFotoEdicao ? 'Tirar Outra Foto' : 'Tirar Nova Foto'}
              </button>
            </div>
          )}
        </div>

        {erroEdicao && <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '10px' }}>{erroEdicao}</div>}

        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button onClick={aoFechar} disabled={salvando} style={{ flex: 1, padding: '10px', backgroundColor: '#e2e8f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={salvarEdicao} disabled={salvando} style={{ flex: 1, padding: '10px', backgroundColor: '#005c33', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalEdicaoCadastro;
