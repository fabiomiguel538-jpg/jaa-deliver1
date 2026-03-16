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

// Fica à escuta das mensagens quando a app está fechada/minimizada
messaging.onBackgroundMessage(function(payload) {
  console.log('Mensagem recebida em segundo plano: ', payload);
  
  // Puxa as informações que o seu servidor enviou (Valor, Endereço, etc.)
  const titulo = payload.data?.titulo || payload.notification?.title || '🛵 Nova Corrida Disponível!';
  const detalhes = payload.data?.detalhes || payload.notification?.body || 'Toque aqui para abrir e ver os detalhes da entrega.';
  const corridaId = payload.data?.id || payload.data?.orderId || payload.data?.corrida_id || '';

  const notificationOptions = {
    body: detalhes,
    requireInteraction: true, // Mantém a notificação presa no ecrã
    vibrate: [1000, 500, 1000, 500, 2000, 500, 1000, 500, 2000], // Vibração máxima
    data: { ...payload.data, corridaId: corridaId }, // Guarda os dados para quando o motoboy clicar
    actions: [
      { action: 'aceitar', title: '✅ Aceitar Corrida' },
      { action: 'recusar', title: '❌ Recusar' }
    ]
  };

  return self.registration.showNotification(titulo, notificationOptions);
});

// Lida com o clique na notificação e nos botões de ação
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data;
  const corridaId = data?.corridaId || '';
  const action = event.action; // 'aceitar', 'recusar' ou vazio (clique na notificação)

  let urlToOpen = '/';
  if (action === 'aceitar' && corridaId) {
    urlToOpen = `/?action=aceitar&id=${corridaId}`;
  } else if (action === 'recusar' && corridaId) {
    urlToOpen = `/?action=recusar&id=${corridaId}`;
  }

  // Tenta focar na janela da app se estiver aberta, ou abrir uma nova
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        // Se já houver uma janela aberta, navegamos para a URL de ação e focamos
        if ('focus' in client) {
          if (action && corridaId) {
            return client.navigate(urlToOpen).then(c => c.focus());
          }
          return client.focus();
        }
      }
      // Se não houver janela aberta, abre uma nova com a URL correta
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
