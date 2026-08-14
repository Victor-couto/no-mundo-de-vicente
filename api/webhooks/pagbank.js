const crypto = require('crypto');

// Configuração para desabilitar o bodyParser padrão da Vercel
// permitindo a leitura do raw body para verificação correta de assinatura
module.exports = {
  config: {
    api: {
      bodyParser: false,
    },
  }
};

// Helper para consumir a stream do request e obter o body bruto (raw body)
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Comparação em tempo constante para evitar Timing Attacks
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
  if (!PAGBANK_TOKEN) {
    console.error('[PagBank Webhook] Token privado ausente no servidor.');
    res.status(500).json({ error: 'Configuração interna pendente.' });
    return;
  }

  try {
    const rawBody = await getRawBody(req);
    const authenticityToken = req.headers['x-authenticity-token'] || req.headers['X-Authenticity-Token'];

    if (!authenticityToken) {
      console.warn('[PagBank Webhook] Cabeçalho x-authenticity-token ausente.');
      res.status(401).json({ error: 'Não autorizado. Assinatura ausente.' });
      return;
    }

    // Calcular as possibilidades de assinatura para compatibilidade e resiliência
    // Opção A: token-payload (especificado pelo usuário)
    const hashA = crypto.createHash('sha256')
      .update(`${PAGBANK_TOKEN}-${rawBody}`)
      .digest('hex');

    // Opção B: tokenpayload (padrão de outras APIs do PagSeguro)
    const hashB = crypto.createHash('sha256')
      .update(`${PAGBANK_TOKEN}${rawBody}`)
      .digest('hex');

    // Validar usando comparação em tempo constante
    const isValidA = safeCompare(hashA, authenticityToken);
    const isValidB = safeCompare(hashB, authenticityToken);

    if (!isValidA && !isValidB) {
      console.warn('[PagBank Webhook] Falha na validação de assinatura do token de autenticidade.');
      res.status(401).json({ error: 'Assinatura de notificação inválida.' });
      return;
    }

    // Converter para JSON com segurança
    const payload = JSON.parse(rawBody);

    // Mapeamento e extração de dados do pedido
    const orderId = payload.id;
    const referenceId = payload.reference_id;
    const status = payload.charges && payload.charges[0] ? payload.charges[0].status : 'UNKNOWN';

    // Registros de logs seguros desprovidos de chaves privadas ou dados de cartão (Fase 12)
    console.log(`[PagBank Webhook] Notificação recebida com sucesso. OrderID: ${orderId}, Ref: ${referenceId}, Status: ${status}`);

    // Responder rapidamente ao PagBank com 200 OK para evitar retransmissões
    res.status(200).json({ success: true, message: 'Notificação processada com sucesso.' });

  } catch (error) {
    console.error('[PagBank Webhook Error] Erro ao processar webhook:', error.message);
    res.status(400).json({ error: 'Erro de processamento de dados.' });
  }
};
