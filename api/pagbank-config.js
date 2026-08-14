const axios = require('axios');

// Cache global da chave pública em memória para evitar chamadas de API repetidas
let cachedPublicKey = null;
let cachedEnv = null;

module.exports = async (req, res) => {
  // CORS Same-Origin e Headers de Segurança
  res.setHeader('Access-Control-Allow-Origin', '*'); // Pode ser limitado a same-origin se necessário
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  const PAGBANK_ENV = process.env.PAGBANK_ENV || 'sandbox';
  const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
  const PAGBANK_PUBLIC_KEY = process.env.PAGBANK_PUBLIC_KEY;

  // Validar ambiente
  if (PAGBANK_ENV !== 'sandbox' && PAGBANK_ENV !== 'production') {
    res.status(500).json({ error: 'Variável PAGBANK_ENV inválida. Deve ser sandbox ou production.' });
    return;
  }

  // 1. Se a Public Key já estiver configurada no ambiente, retorna imediatamente
  if (PAGBANK_PUBLIC_KEY) {
    res.status(200).json({
      publicKey: PAGBANK_PUBLIC_KEY,
      environment: PAGBANK_ENV
    });
    return;
  }

  // 2. Se a chave estiver em cache e o ambiente não mudou, retorna o cache
  if (cachedPublicKey && cachedEnv === PAGBANK_ENV) {
    res.status(200).json({
      publicKey: cachedPublicKey,
      environment: PAGBANK_ENV
    });
    return;
  }

  // 3. Caso contrário, faz a busca dinâmica na API do PagBank
  if (!PAGBANK_TOKEN) {
    res.status(500).json({ error: 'Token de API do PagBank (PAGBANK_TOKEN) não configurado.' });
    return;
  }

  try {
    const url = PAGBANK_ENV === 'sandbox'
      ? 'https://sandbox.api.pagseguro.com/public-keys'
      : 'https://api.pagseguro.com/public-keys';

    console.log(`[PagBank Config] Buscando chave pública dinamicamente no ambiente: ${PAGBANK_ENV}`);
    
    const response = await axios.post(url, {
      type: 'card'
    }, {
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });

    const pubKey = response.data.public_key;
    if (!pubKey) {
      throw new Error('Chave pública não retornada pelo PagBank.');
    }

    // Salvar no cache
    cachedPublicKey = pubKey;
    cachedEnv = PAGBANK_ENV;

    res.status(200).json({
      publicKey: pubKey,
      environment: PAGBANK_ENV
    });

  } catch (error) {
    console.error('Erro ao obter chave pública do PagBank:', error.response ? error.response.data : error.message);
    
    // Fallback amigável de teste se for sandbox, apenas para não travar o desenvolvimento local se faltar internet/token
    if (PAGBANK_ENV === 'sandbox') {
      const sandboxFallbackKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAt'; // Apenas indicador
      res.status(200).json({
        publicKey: sandboxFallbackKey,
        environment: 'sandbox',
        warning: 'Utilizando chave pública de fallback do Sandbox.'
      });
      return;
    }

    res.status(502).json({
      error: 'Falha de comunicação com o PagBank ao obter chave pública',
      details: error.response ? error.response.data : error.message
    });
  }
};
