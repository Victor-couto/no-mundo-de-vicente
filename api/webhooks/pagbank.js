const crypto = require('crypto');
const axios = require('axios');
const { db } = require('../utils/firebase-admin');

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

// Função para envio de e-mail de notificação de compra aprovada via Resend
async function sendNotificationEmail(payload) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[PagBank Webhook] RESEND_API_KEY não está configurada no ambiente.');
    return;
  }

  const orderId = payload.id;
  const referenceId = payload.reference_id;
  
  // Extrair comprador
  const customer = payload.customer || {};
  const phoneObj = customer.phones && customer.phones[0] ? customer.phones[0] : null;
  const phoneStr = phoneObj ? `(${phoneObj.area}) ${phoneObj.number}` : 'Não informado';

  // Extrair endereço
  const shipping = payload.shipping || {};
  const addr = shipping.address || {};
  const addressStr = `${addr.street || ''}, ${addr.number || ''} ${addr.complement ? `- ${addr.complement}` : ''}, ${addr.locality || ''}, ${addr.city || ''} - ${addr.region_code || ''}, CEP: ${addr.postal_code || ''}`;

  // Extrair itens
  const items = payload.items || [];
  let itemsHtml = '';
  let calculatedTotal = 0;
  
  items.forEach(item => {
    const unitPrice = (item.unit_amount / 100).toFixed(2).replace('.', ',');
    const totalItemPrice = ((item.unit_amount * item.quantity) / 100).toFixed(2).replace('.', ',');
    calculatedTotal += (item.unit_amount * item.quantity);
    
    itemsHtml += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.name || 'Produto'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">R$ ${unitPrice}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">R$ ${totalItemPrice}</td>
      </tr>
    `;
  });

  const totalPaid = payload.charges && payload.charges[0] && payload.charges[0].amount
    ? (payload.charges[0].amount.value / 100).toFixed(2).replace('.', ',')
    : (calculatedTotal / 100).toFixed(2).replace('.', ',');

  const paymentMethodType = payload.charges && payload.charges[0] && payload.charges[0].payment_method
    ? payload.charges[0].payment_method.type
    : 'Não identificado';

  // Formatar HTML do e-mail
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #4CAF50; text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
        🎉 Nova Venda Confirmada!
      </h2>
      <p style="font-size: 16px;">Olá,</p>
      <p style="font-size: 16px;">Uma nova compra foi finalizada e o pagamento foi confirmado com sucesso no site.</p>
      
      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">
        Detalhes do Pedido
      </h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; font-weight: bold; width: 150px;">ID do Pedido:</td>
          <td style="padding: 5px 0;">${orderId}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Referência:</td>
          <td style="padding: 5px 0;">${referenceId}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Método de Pagamento:</td>
          <td style="padding: 5px 0;">${paymentMethodType}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Valor Total Pago:</td>
          <td style="padding: 5px 0; font-size: 16px; color: #4CAF50; font-weight: bold;">R$ ${totalPaid}</td>
        </tr>
      </table>

      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">
        Dados do Comprador
      </h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; font-weight: bold; width: 150px;">Nome:</td>
          <td style="padding: 5px 0;">${customer.name || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">E-mail:</td>
          <td style="padding: 5px 0;">${customer.email || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">CPF:</td>
          <td style="padding: 5px 0;">${customer.tax_id || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Telefone:</td>
          <td style="padding: 5px 0;">${phoneStr}</td>
        </tr>
      </table>

      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">
        Endereço de Entrega
      </h3>
      <p style="background-color: #f9f9f9; padding: 10px; border-radius: 4px; line-height: 1.5; margin: 5px 0 0 0;">
        ${addressStr}
      </p>

      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">
        Itens Adquiridos
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Item</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: center; width: 60px;">Qtd</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right; width: 100px;">Unitário</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right; width: 100px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
        Este é um e-mail automático gerado pelo sistema de checkout do site No Mundo de Vicente.
      </p>
    </div>
  `;

  try {
    const response = await axios.post('https://api.resend.com/emails', {
      from: 'No Mundo de Vicente <onboarding@resend.dev>',
      to: 'nomundodevicente@gmail.com',
      subject: `🎉 Nova Venda Confirmada! R$ ${totalPaid} (${customer.name || ''})`,
      html: emailHtml
    }, {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });
    
    console.log('[PagBank Webhook Email] E-mail de notificação de venda enviado com sucesso. Resend ID:', response.data.id);
  } catch (error) {
    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('[PagBank Webhook Email Error] Falha ao enviar e-mail via Resend:', errorDetails);
  }
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

    // Disparar envio de e-mail de venda confirmada e salvar no Firestore
    if (status === 'PAID') {
      if (db) {
        try {
          await db.collection('pedidos').doc(orderId).set({
            ...payload,
            admin_status: 'Aguardando Envio',
            created_at: new Date().toISOString()
          }, { merge: true });
          console.log(`[Firebase] Pedido ${orderId} salvo no Firestore com sucesso.`);
        } catch (fbErr) {
          console.error('[Firebase Error] Erro ao salvar pedido:', fbErr.message);
        }
      } else {
        console.warn('[Firebase] db não configurado. Pedido não salvo no Firestore.');
      }

      await sendNotificationEmail(payload);
    }

    // Responder rapidamente ao PagBank com 200 OK para evitar retransmissões
    res.status(200).json({ success: true, message: 'Notificação processada com sucesso.' });

  } catch (error) {
    console.error('[PagBank Webhook Error] Erro ao processar webhook:', error.message);
    res.status(400).json({ error: 'Erro de processamento de dados.' });
  }
};
