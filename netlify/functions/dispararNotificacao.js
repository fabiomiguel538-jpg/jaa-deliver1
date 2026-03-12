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
  // Apenas permite requisições POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Método não permitido' })
    };
  }

  try {
    const { tokenFCM, dadosDoPedido } = JSON.parse(event.body);

    if (!tokenFCM) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Token FCM não fornecido' })
      };
    }

    const message = {
      notification: {
        title: `Nova Corrida: R$ ${dadosDoPedido.driverEarning.toFixed(2)}`,
        body: `Recolha: ${dadosDoPedido.pickup.address?.split(',')[0]}. 1 parada.`,
      },
      data: {
        id: dadosDoPedido.id,
        orderId: dadosDoPedido.id,
        valor: dadosDoPedido.driverEarning.toFixed(2),
        storeId: dadosDoPedido.storeId,
        distancia_km: `${dadosDoPedido.distance.toFixed(1)} km`,
        valorPorKm: (dadosDoPedido.driverEarning / (dadosDoPedido.distance || 1)).toFixed(2),
        titulo: 'Nova Corrida Disponível! 🛵',
        detalhes: `Pedido #${dadosDoPedido.id}\n💰 Valor: R$ ${dadosDoPedido.driverEarning.toFixed(2)}\n📏 Distância: ${dadosDoPedido.distance.toFixed(1)} km\n📍 Origem: ${dadosDoPedido.pickup.address?.split(',')[0]}`,
      },
      token: tokenFCM,
    };

    // Dispara a notificação
    console.log(`Tentando enviar notificação para o token: ${tokenFCM.substring(0, 10)}...`);
    const response = await admin.messaging().send(message);
    console.log('Notificação enviada com sucesso:', response);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, messageId: response })
    };
  } catch (error) {
    console.error('Erro ao disparar notificação:', error);
    
    // Retorna detalhes do erro para ajudar no debug (em produção você pode querer omitir detalhes sensíveis)
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erro interno no servidor ao enviar notificação',
        details: error.message,
        code: error.code
      })
    };
  }
};
