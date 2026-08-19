const axios = require('axios');
const { db } = require('../utils/firebase-admin');

async function sendNotificationEmail(payment, session) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.error('[Mercado Pago Webhook] RESEND_API_KEY não está configurada no ambiente.');
    return;
  }

  const paymentId = payment.id;
  const referenceId = payment.external_reference;
  const customer = session.customer || {};
  const shipping = session.shipping || {};

  const customerName = customer.name || 'Não informado';
  const customerEmail = customer.email || 'Não informado';
  const customerCpf = customer.cpf || 'Não informado';
  const customerPhone = customer.phone || 'Não informado';

  const addressStr = `${shipping.street || ''}, ${shipping.number || ''} ${shipping.complement ? `- ${shipping.complement}` : ''}, ${shipping.neighborhood || ''}, ${shipping.city || ''} - ${shipping.state || ''}, CEP: ${shipping.cep || ''}`;

  const items = session.items || [];

  let itemsHtml = '';
  items.forEach(item => {
    const unitPrice = parseFloat(item.unit_price || item.unit_amount || 0).toFixed(2).replace('.', ',');
    const totalItemPrice = (parseFloat(item.unit_price || item.unit_amount || 0) * (item.quantity || 1)).toFixed(2).replace('.', ',');
    
    itemsHtml += `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.title || item.name || 'Produto'}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity || 1}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">R$ ${unitPrice}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">R$ ${totalItemPrice}</td>
      </tr>
    `;
  });

  const totalPaid = payment.transaction_amount.toFixed(2).replace('.', ',');
  const paymentMethodType = payment.payment_method_id ? payment.payment_method_id.toUpperCase() : 'Não identificado';

  // Formatar HTML do e-mail
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
      <h2 style="color: #4CAF50; text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
        🎉 Nova Venda Confirmada! (Mercado Pago)
      </h2>
      <p style="font-size: 16px;">Olá,</p>
      <p style="font-size: 16px;">Uma nova compra foi finalizada e o pagamento foi confirmado com sucesso no site pelo Mercado Pago.</p>
      
      <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-top: 25px;">
        Detalhes do Pedido
      </h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 5px 0; font-weight: bold; width: 150px;">ID do Pagamento:</td>
          <td style="padding: 5px 0;">${paymentId}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Referência Externa:</td>
          <td style="padding: 5px 0;">${referenceId || 'N/A'}</td>
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
          <td style="padding: 5px 0;">${customerName}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">E-mail:</td>
          <td style="padding: 5px 0;">${customerEmail}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">CPF:</td>
          <td style="padding: 5px 0;">${customerCpf}</td>
        </tr>
        <tr>
          <td style="padding: 5px 0; font-weight: bold;">Telefone:</td>
          <td style="padding: 5px 0;">${customerPhone}</td>
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
      subject: `🎉 Nova Venda Confirmada! R$ ${totalPaid} (${customerName})`,
      html: emailHtml
    }, {
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 8000
    });
    
    console.log('[Mercado Pago Webhook Email] E-mail de notificação enviado com sucesso. Resend ID:', response.data.id);
  } catch (error) {
    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('[Mercado Pago Webhook Email Error] Falha ao enviar e-mail via Resend:', errorDetails);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('[Mercado Pago Webhook] Token de acesso MERCADO_PAGO_ACCESS_TOKEN ausente no servidor.');
    res.status(500).json({ error: 'Configuração interna pendente.' });
    return;
  }

  try {
    const topic = req.body.type || req.query.topic || req.body.topic;
    const paymentId = (req.body.data && req.body.data.id) || req.query.id || req.body.id;

    if (topic !== 'payment' || !paymentId) {
      res.status(200).json({ success: true, message: 'Notificação ignorada (não é de pagamento).' });
      return;
    }

    console.log(`[Mercado Pago Webhook] Notificação recebida. ID: ${paymentId}, Topic: ${topic}`);

    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`
      },
      timeout: 8000
    });

    const payment = response.data;
    const status = payment.status;

    console.log(`[Mercado Pago Webhook] Status do pagamento ${paymentId}: ${status}`);

    if (status === 'approved') {
      const referenceId = payment.external_reference || '';

      // Fallback mínimo caso a sessão de checkout não seja encontrada no Firestore
      let session = {
        customer: {
          name: (payment.payer && payment.payer.email) || 'Não informado',
          email: (payment.payer && payment.payer.email) || 'Não informado',
          cpf: (payment.payer && payment.payer.identification && payment.payer.identification.number) || '',
          phone: ''
        },
        shipping: {},
        items: []
      };

      if (db) {
        try {
          const docRef = db.collection('pedidos').doc(paymentId.toString());
          const docSnap = await docRef.get();

          if (docSnap.exists) {
            console.log(`[Mercado Pago Webhook] Pedido ${paymentId} já foi processado e salvo no Firestore anteriormente.`);
            res.status(200).json({ success: true, message: 'Pedido já processado.' });
            return;
          }

          // Recupera os dados completos do pedido (cliente, entrega, itens) que foram
          // salvos em /api/checkout antes do redirecionamento ao Checkout Pro.
          if (referenceId) {
            const sessionRef = db.collection('checkout_sessions').doc(referenceId);
            const sessionSnap = await sessionRef.get();
            if (sessionSnap.exists) {
              session = sessionSnap.data();
              sessionRef.update({ used: true }).catch(() => {});
            } else {
              console.warn(`[Mercado Pago Webhook] Sessão de checkout não encontrada para a referência ${referenceId}.`);
            }
          }

          const orderData = {
            id: paymentId.toString(),
            reference_id: referenceId,
            status: 'PAID',
            payment_type: payment.payment_method_id ? payment.payment_method_id.toUpperCase() : 'MERCADO_PAGO',
            created_at: new Date().toISOString(),
            admin_status: 'Aguardando Envio',

            customer: {
              name: (session.customer && session.customer.name) || 'Não informado',
              email: (session.customer && session.customer.email) || 'Não informado',
              tax_id: (session.customer && session.customer.cpf) || '',
              phone: (session.customer && session.customer.phone) || ''
            },

            shipping: {
              address: {
                street: (session.shipping && session.shipping.street) || '',
                number: (session.shipping && session.shipping.number) || '',
                complement: (session.shipping && session.shipping.complement) || '',
                locality: (session.shipping && session.shipping.neighborhood) || '',
                city: (session.shipping && session.shipping.city) || '',
                region_code: (session.shipping && session.shipping.state) || '',
                country: 'BRA',
                postal_code: (session.shipping && session.shipping.cep) || ''
              }
            },

            items: (session.items || []).map(item => ({
              reference_id: item.id,
              name: item.title || item.name,
              quantity: item.quantity,
              unit_amount: Math.round((item.unit_price || item.unit_amount || 0) * 100)
            })),

            total_amount: Math.round(payment.transaction_amount * 100)
          };

          await docRef.set(orderData);
          console.log(`[Firebase] Pedido ${paymentId} salvo no Firestore com sucesso.`);

          await sendNotificationEmail(payment, session);

        } catch (fbErr) {
          console.error('[Firebase Error] Erro ao registrar pedido:', fbErr.message);
        }
      } else {
        console.warn('[Firebase] db não configurado. Enviando apenas e-mail.');
        await sendNotificationEmail(payment, session);
      }
    }

    res.status(200).json({ success: true, message: 'Notificação processada com sucesso.' });

  } catch (error) {
    const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
    console.error('[Mercado Pago Webhook Error] Erro ao processar webhook:', errorDetails);
    res.status(error.response ? error.response.status : 500).json({ error: 'Erro no processamento da notificação.' });
  }
};
