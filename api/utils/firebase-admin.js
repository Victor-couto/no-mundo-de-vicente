const admin = require('firebase-admin');

let db = null;

if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY 
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined;

    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      db = admin.firestore();
      console.log('[Firebase Admin] Inicializado com sucesso.');
    } else {
      console.warn('[Firebase Admin] FIREBASE_PROJECT_ID ausente. Firebase não inicializado.');
    }
  } catch (error) {
    console.error('[Firebase Admin Error] Erro ao inicializar:', error.message);
  }
} else {
  db = admin.firestore();
}

module.exports = { admin, db };
