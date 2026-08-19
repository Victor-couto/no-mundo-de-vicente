const axios = require('axios');
const { db } = require('./utils/firebase-admin');

// Tabela de Preços Oficiais Server-Side
const PRODUTOS_OFICIAIS = {
  'entendendo-como-sou': {
    name: 'Livro Entendendo Como Sou',
    price: 38.90 // R$ 38,90
  }
};

module.exports = async (req, res) => {
  // CORS Same-Origin de Segurança
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Idempotency-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método não permitido.' });
    return;
  }

  // Obter e validar variáveis de ambiente
  const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  // Domínio onde a API/webhook está hospedada (Vercel)
  const API_BASE_URL = (process.env.APP_BASE_URL || 'https://no-mundo-de-vicente.vercel.app').replace(/\/$/, '');
  // Domínio público do site que o cliente navega (Netlify) — usado nos back_urls do Checkout Pro
  const SITE_BASE_URL = (process.env.SITE_BASE_URL || 'https://nomundodevicente.com.br').replace(/\/$/, '');

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('[Mercado Pago Checkout] Credencial MERCADO_PAGO_ACCESS_TOKEN ausente.');
    res.status(500).json({ success: false, error: 'Credenciais de pagamento não configuradas no servidor.' });
    return;
  }

  try {
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, error: 'Corpo da requisição inválido.' });
      return;
    }

    const { items, customer, shipping, idempotency_key } = req.body;

    // Validação de campos obrigatórios
    if (!items || !customer || !shipping || !idempotency_key) {
      res.status(400).json({ success: false, error: 'Dados da requisição incompletos.' });
      return;
    }

    // Validação de CPF, E-mail e Telefone
    const cleanCpf = customer.cpf ? customer.cpf.replace(/\D/g, '') : '';
    if (cleanCpf.length !== 11) {
      res.status(400).json({ success: false, error: 'CPF inválido. Deve conter 11 dígitos.' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!customer.email || !emailRegex.test(customer.email)) {
      res.status(400).json({ success: false, error: 'Endereço de e-mail inválido.' });
      return;
    }

    const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';
    if (cleanPhone.length < 10 || cleanPhone.length > 11) {
      res.status(400).json({ success: false, error: 'Telefone inválido. Deve conter DDD + número.' });
      return;
    }

    // Validação Server-Side do Preço dos Produtos
    let totalCalculado = 0;
    const formattedItems = [];

    for (const item of items) {
      const itemOficial = PRODUTOS_OFICIAIS[item.id];

      if (!itemOficial) {
        res.status(400).json({ success: false, error: `Produto não identificado ou inválido: ${item.id}` });
        return;
      }

      const quantity = parseInt(item.quantity);
      if (isNaN(quantity) || quantity <= 0) {
        res.status(400).json({ success: false, error: `Quantidade inválida para o produto ${item.id}.` });
        return;
      }

      const itemPrice = itemOficial.price;
      const subtotalItem = itemPrice * quantity;

      totalCalculado += subtotalItem;

      formattedItems.push({
        id: item.id,
        title: itemOficial.name,
        quantity: quantity,
        unit_price: itemPrice,
        currency_id: 'BRL'
      });
    }

    if (totalCalculado <= 0) {
      res.status(400).json({ success: false, error: 'O valor total do pedido deve ser maior que zero.' });
      return;
    }

    // Preparar dados do comprador e endereço
    const areaCode = cleanPhone.substring(0, 2);
    const phoneNumber = cleanPhone.substring(2);

    const externalReference = `ref-${Date.now()}-${idempotency_key.substring(0, 6)}`;

    // Guarda os dados completos do pedido (cliente + entrega + itens) numa sessão no
    // Firestore, identificada pelo external_reference. O Checkout Pro não garante o
    // retorno desses dados no pagamento final, então o Webhook os recupera daqui
    // assim que o pagamento é aprovado.
    if (db) {
      try {
        await db.collection('checkout_sessions').doc(externalReference).set({
          idempotency_key,
          customer: {
            name: customer.name,
            email: customer.email.trim(),
            cpf: cleanCpf,
            phone: cleanPhone
          },
          shipping: {
            cep: shipping.cep.replace(/\D/g, ''),
            street: shipping.street,
            number: shipping.number,
            complement: shipping.complement || '',
            neighborhood: shipping.neighborhood,
            city: shipping.city,
            state: shipping.state ? shipping.state.toUpperCase().trim() : ''
          },
          items: formattedItems,
          total: totalCalculado,
          created_at: new Date().toISOString(),
          used: false
        });
      } catch (fbErr) {
        console.error('[Firebase Error] Falha ao salvar sessão de checkout:', fbErr.message);
      }
    } else {
      console.warn('[Firebase] db não configurado. O webhook não conseguirá recuperar os dados completos do pedido.');
    }

    // Montar o payload da Preferência de Pagamento (Checkout Pro)
    const payload = {
      items: formattedItems,
      payer: {
        name: customer.name,
        email: customer.email.trim(),
        identification: {
          type: 'CPF',
          number: cleanCpf
        },
        phone: {
          area_code: areaCode,
          number: phoneNumber
        },
        address: {
          zip_code: shipping.cep.replace(/\D/g, ''),
          street_name: shipping.street,
          street_number: parseInt(shipping.number) || 0
        }
      },
      back_urls: {
        success: `${SITE_BASE_URL}/checkout.html`,
        pending: `${SITE_BASE_URL}/checkout.html`,
        failure: `${SITE_BASE_URL}/checkout.html`
      },
      auto_return: 'approved',
      statement_descriptor: 'NOMUNDODEVICENTE',
      external_reference: externalReference,
      notification_url: `${API_BASE_URL}/api/webhooks/mercadopago`
    };

    // Chamar API de Preferências do Mercado Pago (Checkout Pro)
    const url = 'https://api.mercadopago.com/checkout/preferences';
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotency_key
      },
      timeout: 12000
    });

    const preference = response.data;
    console.log(`[Mercado Pago Checkout Pro] Preferência criada com sucesso. ID: ${preference.id}, Ref: ${externalReference}`);

    res.status(200).json({
      success: true,
      preferenceId: preference.id,
      initPoint: preference.init_point,
      externalReference: externalReference
    });

  } catch (error) {
    const apiError = error.response ? error.response.data : null;

    console.error('[Mercado Pago Checkout Pro Error] Erro ao criar preferência:',
      apiError ? JSON.stringify(apiError) : error.message
    );

    const clientErrorMessage = apiError && apiError.message
      ? apiError.message
      : 'Ocorreu um erro ao iniciar o pagamento com o Mercado Pago. Tente novamente.';

    res.status(error.response ? error.response.status : 500).json({
      success: false,
      error: clientErrorMessage
    });
  }
};
