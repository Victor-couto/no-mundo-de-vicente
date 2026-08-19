const axios = require('axios');
const { auth, db } = require('../utils/firebase-admin');

module.exports = async (req, res) => {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  // Verificar Autenticação via Token do Firebase
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autorizado. Token ausente.' });
  }

  if (!auth) {
    console.error('[Send Tracking] Firebase Admin não configurado no servidor.');
    return res.status(500).json({ error: 'Configuração interna pendente (Firebase).' });
  }

  const idToken = authHeader.split('Bearer ')[1];
  try {
    await auth.verifyIdToken(idToken);
    // Usuário autenticado
  } catch (error) {
    console.error('Erro na validação do token Firebase:', error);
    return res.status(401).json({ error: 'Não autorizado. Token inválido.' });
  }

  const { orderId, trackingCode } = req.body;

  if (!orderId || !trackingCode) {
    return res.status(400).json({ error: 'Parâmetros orderId e trackingCode são obrigatórios.' });
  }

  try {
    // 1. Atualizar no Firestore
    if (db) {
      await db.collection('pedidos').doc(orderId).update({
        admin_status: 'Enviado',
        tracking_code: trackingCode,
        shipped_at: new Date().toISOString()
      });
    }

    // 2. Buscar o pedido para pegar o e-mail e nome do cliente
    let customerEmail = '';
    let customerName = '';
    
    if (db) {
      const orderDoc = await db.collection('pedidos').doc(orderId).get();
      if (orderDoc.exists) {
        const orderData = orderDoc.data();
        customerEmail = orderData.customer?.email || '';
        customerName = orderData.customer?.name || '';
      }
    }

    if (!customerEmail) {
      return res.status(404).json({ error: 'Pedido não encontrado ou sem e-mail cadastrado.' });
    }

    // 3. Enviar e-mail via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (RESEND_API_KEY) {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 5px;">
          <h2 style="color: #4CAF50; text-align: center; border-bottom: 2px solid #4CAF50; padding-bottom: 10px;">
            📦 Seu pedido foi enviado!
          </h2>
          <p style="font-size: 16px;">Olá ${customerName},</p>
          <p style="font-size: 16px;">Excelente notícia! Seu pedido (ID: <strong>${orderId}</strong>) acabou de ser enviado.</p>
          <p style="font-size: 16px;">Você pode acompanhar a entrega utilizando o código de rastreamento abaixo:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; text-align: center; margin: 25px 0; border-radius: 8px;">
            <span style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #333;">${trackingCode}</span>
          </div>
          
          <p style="text-align: center; margin-top: 30px; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 10px;">
            Atenciosamente,<br>Equipe No Mundo de Vicente
          </p>
        </div>
      `;

      await axios.post('https://api.resend.com/emails', {
        from: 'No Mundo de Vicente <onboarding@resend.dev>',
        to: customerEmail,
        subject: `Oba! Seu pedido foi enviado! 📦`,
        html: emailHtml
      }, {
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 8000
      });
    }

    res.status(200).json({ success: true, message: 'Rastreio salvo e e-mail enviado com sucesso.' });
  } catch (error) {
    console.error('Erro ao enviar rastreio:', error);
    res.status(500).json({ error: 'Erro interno ao processar o envio de rastreio.' });
  }
};
