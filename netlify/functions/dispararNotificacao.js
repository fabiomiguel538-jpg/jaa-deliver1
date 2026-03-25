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
    const { dadosDoPedido } = JSON.parse(event.body);

    if (!dadosDoPedido) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Dados do pedido não fornecidos' })
      };
    }

    const driverEarning = dadosDoPedido.driverEarning || 0;
    const distance = dadosDoPedido.distance || 1;
    const pickupAddress = dadosDoPedido.pickup?.address?.split(',')[0] || 'Local não informado';

    // Dispara a notificação via OneSignal
    console.log(`Tentando enviar notificação via OneSignal para o pedido: ${dadosDoPedido.id}`);
    console.log('Início da Key:', process.env.ONESIGNAL_REST_API_KEY?.substring(0, 4));
    
    const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + process.env.ONESIGNAL_REST_API_KEY
      },
      body: JSON.stringify({
        app_id: "8cef6b5b-3fac-4038-9c70-120e90fd4f57",
        included_segments: ["All"],
        contents: { "en": `Nova corrida de R$ ${driverEarning.toFixed(2)} disponível! 🚀` },
        headings: { "en": "Pede Jaa - Nova Corrida" },
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
      })
    });

    const osResult = await oneSignalResponse.json();
    console.log('Notificação OneSignal enviada com sucesso:', osResult);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, messageId: osResult.id })
    };
  } catch (error) {
    console.error('Erro ao disparar notificação:', error);
    
    // Retorna detalhes do erro para ajudar no debug
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
