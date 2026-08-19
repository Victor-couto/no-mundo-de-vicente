// firebase-admin v14 removeu a API antiga (namespaced: admin.apps, admin.credential,
// admin.firestore()) do import padrão. É preciso usar a API modular abaixo.
//
// Importante: NÃO importar 'firebase-admin/auth' aqui. Esse submódulo puxa
// jwks-rsa/jose (ESM-only) e quebra o require() no bundler serverless da Vercel
// (ERR_REQUIRE_ESM), derrubando TODAS as rotas que importam este arquivo — inclusive
// /api/checkout e o webhook, que nem precisam de autenticação. A rota que realmente
// precisa (api/admin/send-tracking.js) importa firebase-admin/auth isoladamente.
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let db = null;

try {
  if (!getApps().length) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    if (process.env.FIREBASE_PROJECT_ID) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      console.log('[Firebase Admin] Inicializado com sucesso.');
    } else {
      console.warn('[Firebase Admin] FIREBASE_PROJECT_ID ausente. Firebase não inicializado.');
    }
  }

  if (getApps().length) {
    db = getFirestore();
  }
} catch (error) {
  console.error('[Firebase Admin Error] Erro ao inicializar:', error.message);
}

module.exports = { db };
