const axios = require('axios');

// Tabela de Preços Oficiais Server-Side (Crucial para FASE 7)
const PRODUTOS_OFICIAIS = {
  'entendendo-como-sou': {
    name: 'Livro Entendendo Como Sou',
    price: 38.90 // R$ 38,90
  }
};

module.exports = async (req, res) => {
  // CORS Same-Origin de Segurança (Prioriza mesmo domínio na Vercel)
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
  const PAGBANK_ENV = process.env.PAGBANK_ENV || 'sandbox';
  const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
  const APP_BASE_URL = process.env.APP_BASE_URL || 'https://no-mundo-de-vicente.vercel.app';

  if (PAGBANK_ENV !== 'sandbox' && PAGBANK_ENV !== 'production') {
    console.error('[PagBank Checkout] Configuração PAGBANK_ENV inválida.');
    res.status(500).json({ success: false, error: 'Erro de configuração interna do servidor.' });
    return;
  }

  if (!PAGBANK_TOKEN) {
    console.error('[PagBank Checkout] Credencial PAGBANK_TOKEN ausente.');
    res.status(500).json({ success: false, error: 'Credenciais de pagamento não configuradas no servidor.' });
    return;
  }

  try {
    // 1. Limite de tamanho de request básico e validação de corpo vazio
    if (!req.body || typeof req.body !== 'object') {
      res.status(400).json({ success: false, error: 'Corpo da requisição inválido.' });
      return;
    }

    const { items, customer, shipping, payment_method, idempotency_key } = req.body;

    // 2. Validação de campos obrigatórios
    if (!items || !customer || !shipping || !payment_method || !idempotency_key) {
      res.status(400).json({ success: false, error: 'Dados da requisição incompletos.' });
      return;
    }

    // 3. Validação de CPF, E-mail e Telefone (Fase 12)
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

    // 4. Validação Server-Side do Preço dos Produtos (Fase 7)
    let totalCalculadoCentavos = 0;
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

      // Preço oficial do servidor em centavos
      const itemPriceCentavos = Math.round(itemOficial.price * 100);
      const subtotalItem = itemPriceCentavos * quantity;
      
      totalCalculadoCentavos += subtotalItem;

      formattedItems.push({
        reference_id: item.id,
        name: itemOficial.name,
        quantity: quantity,
        unit_amount: itemPriceCentavos
      });
    }

    if (totalCalculadoCentavos <= 0) {
      res.status(400).json({ success: false, error: 'O valor total do pedido deve ser maior que zero.' });
      return;
    }

    // 5. Preparar Endereço e Dados do Cliente para o PagBank
    const areaCode = cleanPhone.substring(0, 2);
    const phoneNumber = cleanPhone.substring(2);

    const stateCodes = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
    const regionCode = shipping.state ? shipping.state.toUpperCase().trim() : '';
    if (!stateCodes.includes(regionCode)) {
      res.status(400).json({ success: false, error: 'Sigla de estado de entrega inválida.' });
      return;
    }

    const customerObj = {
      name: customer.name,
      email: customer.email,
      tax_id: cleanCpf,
      phones: [{
        country: '55',
        area: areaCode,
        number: phoneNumber,
        type: 'MOBILE'
      }]
    };

    const shippingAddressObj = {
      street: shipping.street,
      number: shipping.number,
      complement: shipping.complement || '',
      locality: shipping.neighborhood,
      city: shipping.city,
      region_code: regionCode,
      country: 'BRA',
      postal_code: shipping.cep.replace(/\D/g, '')
    };

    // Configurar URL da API de Pedidos do PagBank (Sandbox vs Produção)
    const baseUrl = PAGBANK_ENV === 'sandbox'
      ? 'https://sandbox.api.pagseguro.com/orders'
      : 'https://api.pagseguro.com/orders';

    // URL de Notificação para Webhook
    const notificationUrls = [];
    if (APP_BASE_URL) {
      notificationUrls.push(`${APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/pagbank`);
    }

    // Montar a Payload do Pedido
    const payload = {
      reference_id: `ref-${Date.now()}-${idempotency_key.substring(0, 6)}`,
      customer: customerObj,
      items: formattedItems,
      shipping: {
        address: shippingAddressObj
      },
      notification_urls: notificationUrls
    };

    // Injetar dados de pagamento conforme o método escolhido
    if (payment_method.type === 'PIX') {
      payload.qr_codes = [{
        amount: {
          value: totalCalculadoCentavos
        },
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas de validade
      }];
    } else if (payment_method.type === 'BOLETO') {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3); // 3 dias de vencimento
      const formattedDueDate = dueDate.toISOString().split('T')[0];

      payload.charges = [{
        reference_id: `charge-boleto-${Date.now()}`,
        amount: {
          value: totalCalculadoCentavos,
          currency: 'BRL'
        },
        payment_method: {
          type: 'BOLETO',
          boleto: {
            due_date: formattedDueDate,
            instruction_lines: {
              line_1: 'Pagável em qualquer banco até o vencimento.',
              line_2: 'Não receber após o vencimento.'
            },
            holder: {
              name: customerObj.name,
              tax_id: customerObj.tax_id,
              email: customerObj.email,
              address: shippingAddressObj
            }
          }
        }
      }];
    } else if (payment_method.type === 'CREDIT_CARD') {
      payload.charges = [{
        reference_id: `charge-card-${Date.now()}`,
        amount: {
          value: totalCalculadoCentavos,
          currency: 'BRL'
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: parseInt(payment_method.installments) || 1,
          capture: true,
          card: {
            encrypted: payment_method.card_token
          }
        }
      }];
    } else {
      res.status(400).json({ success: false, error: 'Método de pagamento inválido.' });
      return;
    }

    // 6. Chamada com Tratamento de Timeouts e Idempotência (Fase 8 e 12)
    const response = await axios.post(baseUrl, payload, {
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotency_key
      },
      timeout: 10000 // Timeout de 10 segundos
    });

    // 7. Normalização das Respostas ao Cliente (Fase 9)
    const order = response.data;
    const responseData = {
      success: true,
      orderId: order.id,
      referenceId: order.reference_id,
      paymentType: payment_method.type
    };

    if (payment_method.type === 'PIX') {
      const qrCodeObj = order.qr_codes[0];
      const pngLink = qrCodeObj.links.find(l => l.media === 'image/png') || qrCodeObj.links[0];
      responseData.pix = {
        qrcodeImage: pngLink ? pngLink.href : '',
        qrcodeText: qrCodeObj.text
      };
      responseData.status = 'WAITING'; // Pix inicia aguardando pagamento
    } else if (payment_method.type === 'BOLETO') {
      const charge = order.charges[0];
      const pdfLink = charge.links.find(l => l.media === 'application/pdf');
      
      responseData.chargeId = charge.id;
      responseData.status = charge.status; // EX: WAITING
      responseData.boleto = {
        barcode: charge.payment_response.payment_method.boleto.barcode,
        pdf: pdfLink ? pdfLink.href : '',
        dueDate: charge.payment_response.payment_method.boleto.due_date
      };
    } else if (payment_method.type === 'CREDIT_CARD') {
      const charge = order.charges[0];
      responseData.chargeId = charge.id;
      responseData.status = charge.status; // PAID, DECLINED, IN_ANALYSIS
      responseData.message = charge.payment_response ? charge.payment_response.message : '';
    }

    // Registrar log básico desprovido de chaves privadas ou dados de cartão (Fase 12)
    console.log(`[PagBank Checkout] Pedido criado com sucesso. OrderID: ${order.id}, Status: ${responseData.status}`);

    res.status(200).json(responseData);

  } catch (error) {
    // Tratamento de falha de rede ou erros retornados pela API do PagBank
    const apiError = error.response ? error.response.data : null;
    
    console.error('[PagBank Checkout Error] Erro ao processar pagamento:', 
      apiError ? JSON.stringify(apiError) : error.message
    );

    // Não retornar stack trace ou dados confidenciais ao cliente
    const clientErrorMessage = apiError && apiError.error_messages 
      ? apiError.error_messages.map(m => m.description).join(' ') 
      : 'Ocorreu um erro ao processar o seu pagamento com o PagBank. Verifique seus dados.';

    res.status(error.response ? error.response.status : 500).json({
      success: false,
      error: clientErrorMessage
    });
  }
};
