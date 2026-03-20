const admin = require('firebase-admin');

// Inicializa o Firebase Admin de forma segura
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Erro ao inicializar o Firebase Admin:', error);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': event.headers.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Requested-With, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Apenas permite requisições POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const { tokenFCM, dadosDoPedido } = JSON.parse(event.body);

    if (!tokenFCM) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Token FCM não fornecido' })
      };
    }

    // Verifica se é um token do Expo
    if (tokenFCM.startsWith('ExponentPushToken') || tokenFCM.startsWith('ExpoPushToken')) {
      console.log(`Enviando notificação via Expo para o token: ${tokenFCM.substring(0, 20)}...`);
      
      const driverEarning = dadosDoPedido.driverEarning || 0;
      const distance = dadosDoPedido.distance || 1;
      const pickupAddress = dadosDoPedido.pickup?.address?.split(',')[0] || 'Local não informado';

      const expoMessage = {
        to: tokenFCM,
        sound: 'default',
        priority: 'high',
        title: `Nova Corrida: R$ ${driverEarning.toFixed(2)}`,
        body: `Recolha: ${pickupAddress}. 1 parada.`,
        channelId: "pedidos",
        data: {
          id: dadosDoPedido.id,
          orderId: dadosDoPedido.id,
          valor: driverEarning.toFixed(2),
          storeId: dadosDoPedido.storeId,
          distancia_km: `${distance.toFixed(1)} km`,
          valorPorKm: (driverEarning / distance).toFixed(2),
          titulo: 'Nova Corrida Disponível! 🛵',
          detalhes: `Pedido #${dadosDoPedido.id}\n💰 Valor: R$ ${driverEarning.toFixed(2)}\n📏 Distância: ${distance.toFixed(1)} km\n📍 Origem: ${pickupAddress}`,
        }
      };

      const https = require('https');
      
      const expoResponse = await new Promise((resolve, reject) => {
        const req = https.request('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              resolve(data);
            }
          });
        });
        
        req.on('error', (e) => {
          reject(e);
        });
        
        req.write(JSON.stringify(expoMessage));
        req.end();
      });

      console.log('Notificação enviada via Expo com sucesso:', expoResponse);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, messageId: expoResponse })
      };
    }

    // Caso contrário, tenta enviar via Firebase Cloud Messaging (FCM)
    const driverEarning = dadosDoPedido.driverEarning || 0;
    const distance = dadosDoPedido.distance || 1;
    const pickupAddress = dadosDoPedido.pickup?.address?.split(',')[0] || 'Local não informado';

    const message = {
      notification: {
        title: `Nova Corrida: R$ ${driverEarning.toFixed(2)}`,
        body: `Recolha: ${pickupAddress}. 1 parada.`,
      },
      data: {
        id: dadosDoPedido.id,
        orderId: dadosDoPedido.id,
        valor: driverEarning.toFixed(2),
        storeId: dadosDoPedido.storeId,
        distancia_km: `${distance.toFixed(1)} km`,
        valorPorKm: (driverEarning / distance).toFixed(2),
        titulo: 'Nova Corrida Disponível! 🛵',
        detalhes: `Pedido #${dadosDoPedido.id}\n💰 Valor: R$ ${driverEarning.toFixed(2)}\n📏 Distância: ${distance.toFixed(1)} km\n📍 Origem: ${pickupAddress}`,
      },
      token: tokenFCM,
    };

    // Dispara a notificação
    console.log(`Tentando enviar notificação FCM para o token: ${tokenFCM.substring(0, 10)}...`);
    const response = await admin.messaging().send(message);
    console.log('Notificação FCM enviada com sucesso:', response);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, messageId: response })
    };
  } catch (error) {
    console.error('Erro ao disparar notificação:', error);
    
    // Retorna detalhes do erro para ajudar no debug (em produção você pode querer omitir detalhes sensíveis)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Erro interno no servidor ao enviar notificação',
        details: error.message,
        code: error.code
      })
    };
  }
};
