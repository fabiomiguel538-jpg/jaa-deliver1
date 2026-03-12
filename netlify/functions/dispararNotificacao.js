// netlify/functions/dispararNotificacao.js
// Refatorado para OneSignal REST API (Web2App)
// Removido firebase-admin e credenciais legadas

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

    // No OneSignal, o tokenFCM agora é o Player ID / Subscription ID do motoboy
    if (!tokenFCM) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Player ID do OneSignal não fornecido' })
      };
    }

    // Configurações do OneSignal
    const ONESIGNAL_APP_ID = "8cef6b5b-3fac-4038-9c70-120e90fd4f57";
    const ONESIGNAL_REST_API_KEY = "os_v2_app_rtxwwwz7vradrhdqcihjb7kpk4xd6fjmdd6egluisisd2xsorsslwwfpkizsgzld3oi55oozjt27m5hqe2iqhmwe7q2jbve44pkkksy";

    const notificationBody = {
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: [tokenFCM], // Array contendo o Player ID do motoboy
      headings: { en: "🛵 Nova Corrida Disponível!" },
      contents: { en: "Valor e distância calculados. Toque para ver." },
      data: {
        id: dadosDoPedido.id,
        orderId: dadosDoPedido.id,
        valor: dadosDoPedido.driverEarning.toFixed(2),
        storeId: dadosDoPedido.storeId,
        distancia_km: dadosDoPedido.distance ? `${dadosDoPedido.distance.toFixed(1)} km` : "N/A",
        valorPorKm: (dadosDoPedido.driverEarning / (dadosDoPedido.distance || 1)).toFixed(2),
        endereco_coleta: dadosDoPedido.pickup.address?.split(',')[0],
        // Dados adicionais para o Modal React
        tipoEntrega: dadosDoPedido.tipoEntrega || 'Nuvem',
        metodoPagamento: dadosDoPedido.paymentMethodAtDelivery || 'Carteira'
      }
    };

    // Requisição direta para a REST API do OneSignal usando fetch nativo
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_REST_API_KEY}`
      },
      body: JSON.stringify(notificationBody)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Erro retornado pelo OneSignal:', result);
      throw new Error(`OneSignal API Error: ${response.statusText}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: 'Notificação enviada com sucesso via OneSignal',
        onesignalResponse: result 
      })
    };
  } catch (error) {
    console.error('Erro ao disparar notificação OneSignal:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Erro interno ao processar notificação',
        details: error.message 
      })
    };
  }
};
