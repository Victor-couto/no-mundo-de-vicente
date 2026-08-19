const axios = require('axios');

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
  const APP_BASE_URL = process.env.APP_BASE_URL || 'https://no-mundo-de-vicente.vercel.app';

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

    const { items, customer, shipping, idempotency_key, token, payment_method_id, installments, issuer_id, device_id } = req.body;

    // Validação de campos obrigatórios
    if (!items || !customer || !shipping || !idempotency_key || !payment_method_id) {
      res.status(400).json({ success: false, error: 'Dados da requisição incompletos (checkout transparente).' });
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

    // Separar primeiro e último nome
    const nameParts = customer.name.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Comprador';
    const lastName = nameParts.slice(1).join(' ') || 'Silva';

    const payerObj = {
      email: customer.email.trim(),
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: 'CPF',
        number: cleanCpf
      },
      address: {
        zip_code: shipping.cep.replace(/\D/g, ''),
        street_name: shipping.street,
        street_number: parseInt(shipping.number) || 0,
        neighborhood: shipping.neighborhood,
        city: shipping.city,
        federal_unit: shipping.state ? shipping.state.toUpperCase().trim() : 'SP'
      }
    };

    // Configurar URLs de retorno e webhook
    const baseDomain = APP_BASE_URL.replace(/\/$/, '');
    const notificationUrl = `${baseDomain}/api/webhooks/mercadopago`;

    // Armazenar detalhes de entrega e identificação nos metadados para recuperação no Webhook
    const metadata = {
      idempotency_key: idempotency_key,
      customer_name: customer.name,
      customer_email: customer.email,
      customer_cpf: cleanCpf,
      customer_phone: cleanPhone,
      shipping_cep: shipping.cep.replace(/\D/g, ''),
      shipping_street: shipping.street,
      shipping_number: shipping.number,
      shipping_complement: shipping.complement || '',
      shipping_neighborhood: shipping.neighborhood,
      shipping_city: shipping.city,
      shipping_state: shipping.state ? shipping.state.toUpperCase().trim() : '',
      items_json: JSON.stringify(formattedItems)
    };

    // Montar o payload do pagamento transparente (/v1/payments)
    const payload = {
      transaction_amount: parseFloat(totalCalculado.toFixed(2)),
      description: 'Compra No Mundo de Vicente',
      payment_method_id: payment_method_id,
      payer: payerObj,
      notification_url: notificationUrl,
      external_reference: `ref-${Date.now()}-${idempotency_key.substring(0, 6)}`,
      metadata: metadata
    };

    // Adicionar campos específicos para cartão se fornecidos
    if (token) {
      payload.token = token;
      payload.installments = parseInt(installments) || 1;
      if (issuer_id) {
        payload.issuer_id = parseInt(issuer_id);
      }
    }

    // Chamar API de Pagamentos do Mercado Pago
    const url = 'https://api.mercadopago.com/v1/payments';
    const requestHeaders = {
      'Authorization': `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotency_key
    };
    // Device ID gerado pelo security.js do Mercado Pago no front-end.
    // Obrigatório para a análise antifraude da API de pagamentos — sem ele o
    // Mercado Pago pode recusar a transação com erro de política (UNAUTHORIZED).
    if (device_id) {
      requestHeaders['X-meli-session-id'] = device_id;
    }
    const response = await axios.post(url, payload, {
      headers: requestHeaders,
      timeout: 12000
    });

    const payment = response.data;
    console.log(`[Mercado Pago Payments API] Pagamento criado com sucesso. ID: ${payment.id}, Status: ${payment.status}, Ref: ${payload.external_reference}`);

    // Formatar resposta simplificada para o cliente
    const responseData = {
      success: true,
      paymentId: payment.id,
      status: payment.status,
      statusDetail: payment.status_detail,
      paymentMethodId: payment.payment_method_id,
      externalReference: payment.external_reference
    };

    // Adicionar dados específicos de Pix
    if (payment.payment_method_id === 'pix' && payment.point_of_interaction?.transaction_data) {
      responseData.pix = {
        qrcodeImage: payment.point_of_interaction.transaction_data.qr_code_base64,
        qrcodeText: payment.point_of_interaction.transaction_data.qr_code
      };
    }

    // Adicionar dados específicos de Boleto
    if (payment.payment_method_id === 'bolbradesco' || payment.payment_method_id === 'pec') {
      responseData.boleto = {
        barcode: payment.transaction_details?.barcode?.content || payment.barcode?.content || '',
        pdf: payment.transaction_details?.external_resource_url || '',
        dueDate: payment.date_of_expiration || ''
      };
    }

    res.status(200).json(responseData);

  } catch (error) {
    const apiError = error.response ? error.response.data : null;
    
    console.error('[Mercado Pago Payments Error] Erro ao processar pagamento:', 
      apiError ? JSON.stringify(apiError) : error.message
    );

    const clientErrorMessage = apiError && apiError.message 
      ? apiError.message 
      : 'Ocorreu um erro ao processar o seu pagamento com o Mercado Pago. Tente novamente.';

    res.status(error.response ? error.response.status : 500).json({
      success: false,
      error: clientErrorMessage
    });
  }
};
