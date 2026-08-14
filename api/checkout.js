const axios = require('axios');

module.exports = async (req, res) => {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Tratar requisição de preflight CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido' });
    return;
  }

  try {
    const { items, customer, shipping, payment_method } = req.body;

    if (!items || !customer || !shipping || !payment_method) {
      res.status(400).json({ error: 'Parâmetros incompletos' });
      return;
    }

    // Carregar credenciais
    const PAGBANK_TOKEN = process.env.PAGBANK_TOKEN;
    const PAGBANK_ENV = process.env.PAGBANK_ENV || 'production';

    if (!PAGBANK_TOKEN) {
      res.status(500).json({ error: 'Credenciais do PagBank não configuradas no servidor' });
      return;
    }

    // Configurar URL da API de Pedidos do PagBank (Sandbox vs Produção)
    const baseUrl = PAGBANK_ENV === 'sandbox'
      ? 'https://sandbox.api.pagseguro.com/orders'
      : 'https://api.pagseguro.com/orders';

    // Obter DDI/DDD/Número do telefone limpos
    const cleanPhone = customer.phone.replace(/\D/g, ''); // Ex: 5511999999999
    let areaCode = '11';
    let phoneNumber = '999999999';
    if (cleanPhone.length >= 10) {
      // Se tiver DDI 55 no início (ex: 5511999999999)
      const offset = cleanPhone.startsWith('55') ? 2 : 0;
      areaCode = cleanPhone.substring(offset, offset + 2);
      phoneNumber = cleanPhone.substring(offset + 2);
    }

    // Formatar itens para o padrão da API do PagBank (unit_amount em centavos)
    const formattedItems = items.map((item, idx) => ({
      reference_id: item.id || `item-${idx + 1}`,
      name: item.name,
      quantity: item.quantity,
      unit_amount: Math.round(parseFloat(item.price) * 100) // Converte para centavos
    }));

    // Calcular o total em centavos
    const totalAmount = formattedItems.reduce((acc, item) => acc + (item.unit_amount * item.quantity), 0);

    // Formatar Endereço
    const stateCodes = {
      'AC': 'AC', 'AL': 'AL', 'AP': 'AP', 'AM': 'AM', 'BA': 'BA', 'CE': 'CE', 'DF': 'DF', 'ES': 'ES', 'GO': 'GO',
      'MA': 'MA', 'MT': 'MT', 'MS': 'MS', 'MG': 'MG', 'PA': 'PA', 'PB': 'PB', 'PR': 'PR', 'PE': 'PE', 'PI': 'PI',
      'RJ': 'RJ', 'RN': 'RN', 'RS': 'RS', 'RO': 'RO', 'RR': 'RR', 'SC': 'SC', 'SP': 'SP', 'SE': 'SE', 'TO': 'TO'
    };
    const regionCode = stateCodes[shipping.state.toUpperCase().trim()] || 'SP';

    const customerObj = {
      name: customer.name,
      email: customer.email,
      tax_id: customer.cpf.replace(/\D/g, ''),
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

    // Criar chave de idempotência única por transação
    const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Montar payload base da requisição de pedidos (Orders)
    const payload = {
      reference_id: `ref-${Date.now()}`,
      customer: customerObj,
      items: formattedItems,
      shipping: {
        address: shippingAddressObj
      }
    };

    // Injetar dados de pagamento conforme o método escolhido
    if (payment_method.type === 'PIX') {
      // No PagBank, Pix é gerado via objeto qr_codes
      payload.qr_codes = [{
        amount: {
          value: totalAmount
        },
        expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 horas de validade
      }];
    } else if (payment_method.type === 'BOLETO') {
      // Boleto gera uma charge
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3); // 3 dias de vencimento
      const formattedDueDate = dueDate.toISOString().split('T')[0];

      payload.charges = [{
        reference_id: `charge-${Date.now()}`,
        amount: {
          value: totalAmount,
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
      // Cartão de Crédito gera uma charge
      payload.charges = [{
        reference_id: `charge-${Date.now()}`,
        amount: {
          value: totalAmount,
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
      res.status(400).json({ error: 'Método de pagamento inválido' });
      return;
    }

    // Fazer a chamada à API do PagBank
    const response = await axios.post(baseUrl, payload, {
      headers: {
        'Authorization': `Bearer ${PAGBANK_TOKEN}`,
        'Content-Type': 'application/json',
        'x-idempotency-key': idempotencyKey
      },
      timeout: 15000 // 15 segundos de timeout
    });

    // Tratar a resposta e simplificar para o frontend
    const order = response.data;
    const responseData = {
      order_id: order.id,
      reference_id: order.reference_id,
      payment_type: payment_method.type
    };

    if (payment_method.type === 'PIX') {
      // Extrair QR Code e link
      const qrCodeObj = order.qr_codes[0];
      const pngLink = qrCodeObj.links.find(l => l.media === 'image/png') || qrCodeObj.links[0];
      responseData.pix = {
        qrcode_image: pngLink ? pngLink.href : '',
        qrcode_text: qrCodeObj.text
      };
    } else if (payment_method.type === 'BOLETO') {
      // Extrair dados do boleto
      const charge = order.charges[0];
      const pdfLink = charge.links.find(l => l.media === 'application/pdf');
      responseData.boleto = {
        barcode: charge.payment_response.payment_method.boleto.barcode,
        pdf_link: pdfLink ? pdfLink.href : '',
        due_date: charge.payment_response.payment_method.boleto.due_date
      };
    } else if (payment_method.type === 'CREDIT_CARD') {
      // Extrair dados do cartão
      const charge = order.charges[0];
      responseData.card = {
        status: charge.status, // PAID, DECLINED, IN_ANALYSIS
        message: charge.payment_response ? charge.payment_response.message : ''
      };
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error('Erro no processamento do checkout PagBank:', error.response ? error.response.data : error.message);
    const apiError = error.response ? error.response.data : null;
    res.status(error.response ? error.response.status : 500).json({
      error: 'Erro ao processar pagamento junto ao PagBank',
      details: apiError || error.message
    });
  }
};
