module.exports = async (req, res) => {
  // Configuração de CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const publicKey = process.env.MERCADO_PAGO_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[Public Key API] MERCADO_PAGO_PUBLIC_KEY não está configurada no ambiente.');
    res.status(500).json({ error: 'MERCADO_PAGO_PUBLIC_KEY não configurada no servidor.' });
    return;
  }

  res.status(200).json({ publicKey });
};
