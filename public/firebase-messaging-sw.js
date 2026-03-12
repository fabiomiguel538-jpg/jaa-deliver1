importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyC0jC_pMntiAj_XepIXauLsYh8vojOX-Mo",
  authDomain: "pedeja-b9080.firebaseapp.com",
  projectId: "pedeja-b9080",
  storageBucket: "pedeja-b9080.firebasestorage.app",
  messagingSenderId: "479512861371",
  appId: "1:479512861371:web:0d3ae540e90882ee02a79e",
  measurementId: "G-JZKXH4EBQX"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Mensagem recebida em segundo plano: ', payload);

  const notificationTitle = payload.notification?.title || payload.data?.titulo || '🛵 Nova Corrida!';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.detalhes || 'Toque para abrir o Pede Já.',
    icon: 'https://i.postimg.cc/P5tM32f8/pedeja-logo.png',
    badge: 'https://i.postimg.cc/P5tM32f8/pedeja-logo.png',
    requireInteraction: true, // Mantém a notificação presa na tela
    vibrate: [1000, 500, 1000, 500, 2000],
    data: payload.data // Passa os dados para quando o app for aberto
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});
