const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  console.log('Corpo recebido:', event.body);

  const headers = {
    'Access-Control-Allow-Origin': event.headers.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Requested-With, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!event.body) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "aguardando dados" }) };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const payload = event.body ? JSON.parse(event.body) : {};
    const pedido = payload.record || payload;
    const pedidoId = pedido.id;

    console.log('Iniciando envio para o pedido:', pedidoId);

    if (!pedidoId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID do pedido não fornecido' }) };
    }

    const pedidosResult = await sql`
      SELECT valor, bairro, id_regiao FROM pedidos WHERE id = ${pedidoId}
    `;

    if (pedidosResult.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Pedido não encontrado' }) };
    }

    const { valor, bairro, id_regiao } = pedidosResult[0];

    const motoboysResult = await sql`
      SELECT expo_token FROM motoboys 
      WHERE status = 'disponivel' AND regiao = ${id_regiao} AND expo_token IS NOT NULL
    `;

    const expoTokens = motoboysResult.map(m => m.expo_token).filter(token => token && token.startsWith('ExponentPushToken'));

    if (expoTokens.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'Nenhum motoboy com token' }) };
    }

    const messages = expoTokens.map(token => ({
      to: token,
      sound: 'default',
      priority: 'high',
      title: "🚀 NOVA CORRIDA DISPONÍVEL!",
      body: `Valor: R$ ${valor} | Bairro: ${bairro}. Toque para aceitar!`,
      channelId: "pedidos"
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(messages),
    });

    try {
      const chave = 'os_v2_app_rtxwwwz7vradrhdqcihjb7kpk746joulnope7yufneqbz332ihbtdbbw4mjgtpj4idv7seh45qmyqe76js2q344conyky6fwsk7kmsa';
      console.log('Enviando com Header:', 'Basic ' + chave.substring(0, 10) + '...');
      
      const oneSignalResponse = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Basic os_v2_app_rtxwwwz7vradrhdqcihjb7kpk746joulnope7yufneqbz332ihbtdbbw4mjgtpj4idv7seh45qmyqe76js2q344conyky6fwsk7kmsa'
        },
        body: JSON.stringify({
          app_id: "8cef6b5b-3fac-4038-9c70-120e90fd4f57",
          included_segments: ["All"],
          contents: { "en": `Nova corrida de R$ ${valor} disponível! 🚀` },
          headings: { "en": "Pede Jaa - Nova Corrida" }
        })
      });
      const osResult = await oneSignalResponse.json();
      console.log('Resposta do OneSignal:', JSON.stringify(osResult));
    } catch (osError) {
      console.error('Erro ao enviar para o OneSignal:', osError);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, notified: messages.length }) };
  } catch (error) {
    console.error('Erro na função enviar-notificacao:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
