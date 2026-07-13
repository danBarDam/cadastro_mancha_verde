import React, { useState, useEffect, useRef, useCallback } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import api from '../utils/api';
import '../App.css'; //Importando o CSS que acabamos de criar
import { dataURLParaArquivo } from '../utils/imagem';
import { gerarImagemCarteirinha } from '../utils/carteirinha';

function Cadastro() {
  const [id, setId] = useState('');
  const [idAutoGuardado, setIdAutoGuardado] = useState(''); // Guarda o ID automático para não perdê-lo
  const [tipoCadastro, setTipoCadastro] = useState('Novo');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [bairro, setBairro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [ala, setAla] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [fotoSrc, setFotoSrc] = useState(null);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [telefone, setTelefone] = useState('');
  
  const [alasLista, setAlasLista] = useState([]);
  const [status, setStatus] = useState('');
  const [carregandoCep, setCarregandoCep] = useState(false);

  const [ultimoCadastro, setUltimoCadastro] = useState(null);
  const [gerandoCarteirinha, setGerandoCarteirinha] = useState(false);
  const [statusCarteirinha, setStatusCarteirinha] = useState('');

  const webcamRef = useRef(null);

  useEffect(() => {
    async function inicializarDados() {
      try {
        const resAlas = await api.get('/alas');
        setAlasLista(resAlas.data.alas || []);

        const resId = await api.get('/proximo-id');
        setIdAutoGuardado(resId.data.proximoId);
        setId(resId.data.proximoId); // Define o ID inicial
      } catch (error) {
        console.error('Erro ao inicializar dados:', error);
      }
    }
    inicializarDados();
  }, []);

  // Lógica para alternar entre ID Automático ou Digitação Manual
  const handleTipoCadastro = (tipo) => {
    setTipoCadastro(tipo);
    if (tipo === 'Novo') {
      setId(idAutoGuardado); // Volta para o ID automático
    } else {
      setId(''); // Limpa o campo para a pessoa digitar a carteirinha antiga
    }
  };

  const handleNomeChange = (e) => setNome(e.target.value.toUpperCase());

  const handleCpfChange = (e) => {
    let value = e.target.value.replace(/\D/g, '').slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    setCpf(value);
  };

  const handleCepChange = async (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
    setCep(value);

    if (value.length === 8) {
      setCarregandoCep(true);
      try {
        const response = await axios.get(`https://viacep.com.br/ws/${value}/json/`);
        if (!response.data.erro) {
          setRua(response.data.logradouro.toUpperCase());
          setBairro(response.data.bairro.toUpperCase());
        }
      } catch (error) {
        console.error('Erro no CEP:', error);
      } finally {
        setCarregandoCep(false);
      }
    }
  };

  const alternarCamera = () => {
    setCameraAtiva(!cameraAtiva);
    // Se estiver desligando a câmera, não apaga a foto já tirada (caso a pessoa queira manter)
  };

  const capturarFoto = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    setFotoSrc(imageSrc);
    setCameraAtiva(false); // Desliga a câmera automaticamente após o clique
  }, [webcamRef]);

  const enviarCadastro = async (e) => {
    e.preventDefault();
    setStatus('Processando inscrição...');

    try {
      const formData = new FormData();
      formData.append('id', id);
      formData.append('tipoCadastro', tipoCadastro);
      formData.append('nome', nome);
      formData.append('cpf', cpf);
      formData.append('telefone', telefone);
      formData.append('cep', cep);
      formData.append('rua', rua);
      formData.append('bairro', bairro);
      formData.append('numero', numero);
      formData.append('complemento', complemento);
      formData.append('ala', ala);
      formData.append('data', data);
      if (fotoSrc) {
        const arquivoFoto = dataURLParaArquivo(fotoSrc, `${id}-foto.jpg`);
        formData.append('foto', arquivoFoto);
      }

      await api.post('/cadastro', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setStatus('Inscrição realizada com sucesso!');

      // Guarda uma cópia dos dados para permitir gerar a carteirinha depois de limpar o formulário
      setUltimoCadastro({ id, nome, ala, data, fotoSrc });
      setStatusCarteirinha('');

      // Limpa os campos
      setNome(''); setCpf(''); setCep(''); setRua(''); setBairro('');
      setNumero(''); setComplemento(''); setAla(''); setFotoSrc(null);

      // Se for cadastro novo, atualiza o ID automático para o próximo
      if (tipoCadastro === 'Novo') {
        const resId = await api.get('/proximo-id');
        setIdAutoGuardado(resId.data.proximoId);
        setId(resId.data.proximoId);
      } else {
        setId('');
      }

    } catch (error) {
      console.error('Erro:', error);
      setStatus('Erro ao salvar. Verifique o console.');
    }
  };

  const fazerCarteirinha = async () => {
    if (!ultimoCadastro) return;

    setGerandoCarteirinha(true);
    setStatusCarteirinha('');

    try {
      const imagemDataUrl = await gerarImagemCarteirinha(ultimoCadastro);
      const arquivoCarteirinha = dataURLParaArquivo(imagemDataUrl, `carteirinha-${ultimoCadastro.id}.png`);

      const formData = new FormData();
      formData.append('id', ultimoCadastro.id);
      formData.append('nome', ultimoCadastro.nome);
      formData.append('imagem', arquivoCarteirinha);

      await api.post('/salvar-carteirinha', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setStatusCarteirinha('Carteirinha salva no Drive com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar carteirinha:', error);
      setStatusCarteirinha('Erro ao gerar/salvar a carteirinha.');
    } finally {
      setGerandoCarteirinha(false);
    }
  };

  return (
    <div className="container">
      <h2 className="titulo">Ficha de Inscrição</h2>
      
      <form onSubmit={enviarCadastro}>
        
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Tipo de Inscrição:</label>
            <div className="radio-group">
              <label className="radio-label">
                <input type="radio" name="tipoCadastro" value="Novo" 
                  checked={tipoCadastro === 'Novo'} 
                  onChange={() => handleTipoCadastro('Novo')} />
                Cadastro Novo
              </label>
              <label className="radio-label">
                <input type="radio" name="tipoCadastro" value="Renovação" 
                  checked={tipoCadastro === 'Renovação'} 
                  onChange={() => handleTipoCadastro('Renovação')} />
                Renovação
              </label>
            </div>
          </div>
          
          <div className="form-group">
            <label className="form-label">Número de Matrícula (ID):</label>
            <input 
              type="text" 
              className="form-input" 
              value={id} 
              onChange={(e) => setId(e.target.value)}
              readOnly={tipoCadastro === 'Novo'} 
              placeholder={tipoCadastro === 'Renovação' ? "Digite a matrícula antiga" : "Gerado automaticamente"}
              required 
            />
          </div>
        </div>

                
                
        <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#1e293b' }}>
            Nome Completo:
        </label>
        <input
            type="text"
            className="form-input"
            placeholder="Digite o nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ 
            width: '100%', 
            padding: '12px', 
            borderRadius: '6px', 
            border: '1px solid #cbd5e1',
            boxSizing: 'border-box' /* Impede que a caixa vaze do limite da tela */
            }}
            required
        />
        </div>

        
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
        
        
        <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#1e293b' }}>
            CPF:
            </label>
            <input
            type="text"
            className="form-input"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={handleCpfChange}
            style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box'
            }}
            required
            />
        </div>

        
        <div className="form-group" style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#1e293b' }}>
            Telefone / WhatsApp:
            </label>
            <input
            type="tel"
            className="form-input"
            placeholder="(11) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            style={{ 
                width: '100%', 
                padding: '12px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1',
                boxSizing: 'border-box'
            }}
            required
            />
        </div>

        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">CEP:</label>
            <input type="text" className="form-input" value={cep} onChange={handleCepChange} required />
            {carregandoCep && <span className="erro-texto">Buscando...</span>}
          </div>
          <div className="form-group flex-2">
            <label className="form-label">Rua / Logradouro:</label>
            <input type="text" className="form-input" value={rua} onChange={(e) => setRua(e.target.value.toUpperCase())} required />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Bairro:</label>
            <input type="text" className="form-input" value={bairro} onChange={(e) => setBairro(e.target.value.toUpperCase())} required />
          </div>
          <div className="form-group">
            <label className="form-label">Número:</label>
            <input type="text" className="form-input" value={numero} onChange={(e) => setNumero(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Complemento:</label>
            <input type="text" className="form-input" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group flex-2">
            <label className="form-label">Ala do Desfile:</label>
            <select className="form-input" value={ala} onChange={(e) => setAla(e.target.value)} required>
              <option value="">Selecione a Ala...</option>
              {alasLista.length > 0 ? (
                alasLista.map((nomeAla, idx) => (
                  <option key={idx} value={nomeAla}>{nomeAla}</option>
                ))
              ) : (
                <option value="" disabled>Carregando alas ou planilha vazia...</option>
              )}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data:</label>
            <input type="date" className="form-input" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>
        </div>

        <div className="foto-container">
          <label className="form-label" style={{display: 'block', marginBottom: '15px'}}>Captura de Foto</label>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            
            {/* CENÁRIO 1: Foto já foi tirada */}
            {fotoSrc ? (
              <div style={{ width: '100%', maxWidth: '400px' }}>
                <img src={fotoSrc} alt="Captura" style={{ width: '100%', borderRadius: '6px', marginBottom: '10px' }} />
                <button type="button" className="btn-secundario" onClick={() => { setFotoSrc(null); setCameraAtiva(true); }}>
                  Tirar Outra Foto
                </button>
              </div>
            ) : 
            
            /* CENÁRIO 2: Câmera Ativa para tirar a foto */
            cameraAtiva ? (
              <div style={{ width: '100%', maxWidth: '400px' }}>
                <Webcam 
                  audio={false} 
                  ref={webcamRef} 
                  screenshotFormat="image/jpeg" 
                  width="100%" 
                  style={{ borderRadius: '6px', marginBottom: '10px' }} 
                  videoConstraints={{ facingMode: "user" }} 
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button type="button" className="btn-secundario" style={{ backgroundColor: '#005c33', color: 'white' }} onClick={capturarFoto}>
                    Capturar Imagem
                  </button>
                  <button type="button" className="btn-secundario" onClick={alternarCamera}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : 
            
            /* CENÁRIO 3: Câmera Desativada (Tela Inicial) */
            (
              <div style={{ 
                width: '100%', 
                maxWidth: '500px', 
                backgroundColor: '#0f172a', 
                color: 'white', 
                padding: '40px 20px', 
                borderRadius: '8px', 
                border: '2px dashed #334155' 
              }}>
                <div style={{ fontSize: '40px', marginBottom: '15px' }}>📷</div>
                <h4 style={{ margin: '0 0 10px 0', letterSpacing: '1px' }}>PRÉ-VISUALIZAÇÃO DA CÂMERA DESATIVADA</h4>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '25px', lineHeight: '1.5' }}>
                  A câmera está desligada para economizar recursos e memória. <br/>
                  Clique no botão abaixo para ativar a lente e tirar a foto.
                </p>
                <button type="button" className="btn-secundario" style={{ backgroundColor: '#005c33', color: 'white', border: 'none' }} onClick={alternarCamera}>
                  ATIVAR WEBCAM
                </button>
              </div>
            )}

          </div>
        </div>

        <button type="submit" className="btn-primary">Finalizar Inscrição</button>
      </form>

      {status && (
        <div className="status-box">
          <strong>Aviso:</strong> {status}
        </div>
      )}

      {ultimoCadastro && (
        <div style={{ textAlign: 'center', marginTop: '15px' }}>
          <button
            type="button"
            className="btn-secundario"
            style={{ backgroundColor: '#005c33', color: 'white', border: 'none' }}
            onClick={fazerCarteirinha}
            disabled={gerandoCarteirinha}
          >
            {gerandoCarteirinha ? 'Gerando carteirinha...' : '🪪 Fazer Carteirinha'}
          </button>
          {statusCarteirinha && (
            <p style={{ marginTop: '10px', color: statusCarteirinha.includes('sucesso') ? '#005c33' : '#ef4444', fontWeight: 'bold' }}>
              {statusCarteirinha}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Cadastro;