const { neon } = require('@neondatabase/serverless');

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
    // Inicializa a conexão com o Neon
    const sql = neon(process.env.DATABASE_URL || process.env.VITE_NEON_DB_URL);

    // O corpo da requisição pode vir de um Webhook do Neon (ao inserir um pedido)
    // ou de uma chamada direta do frontend.
    const payload = JSON.parse(event.body);
    
    // Se for um webhook do Neon, os dados do novo registro geralmente vêm em payload.record
    // Se for chamada direta, podemos passar o pedidoId ou os dados diretamente.
    const pedido = payload.record || payload;
    
    const pedidoId = pedido.id;
    
    if (!pedidoId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ID do pedido não fornecido' })
      };
    }

    // 1. Recupera os dados da corrida: valor, bairro e id_regiao na tabela pedidos
    const pedidosResult = await sql`
      SELECT valor, bairro, id_regiao 
      FROM pedidos 
      WHERE id = ${pedidoId}
    `;

    if (pedidosResult.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Pedido não encontrado' })
      };
    }

    const { valor, bairro, id_regiao } = pedidosResult[0];

    // 2. Filtro de Motoboys: status = 'disponivel', regiao = id_regiao_do_pedido, expo_token IS NOT NULL
    const motoboysResult = await sql`
      SELECT expo_token 
      FROM motoboys 
      WHERE status = 'disponivel' 
        AND regiao = ${id_regiao} 
        AND expo_token IS NOT NULL
    `;

    if (motoboysResult.length === 0) {
      console.log(`Nenhum motoboy disponível com expo_token na região ${id_regiao}`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Nenhum motoboy disponível para notificar', notifiedCount: 0 })
      };
    }

    // Extrai a lista de tokens
    const expoTokens = motoboysResult.map(m => m.expo_token).filter(token => token && token.startsWith('ExponentPushToken'));

    if (expoTokens.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Nenhum token Expo válido encontrado', notifiedCount: 0 })
      };
    }

    // 3. Configuração da Notificação (Push Payload)
    const messages = [];
    
    for (let pushToken of expoTokens) {
      messages.push({
        to: pushToken,
        sound: 'default',
        priority: 'high',
        title: "🚀 NOVA CORRIDA DISPONÍVEL!",
        body: `Valor: R$ ${valor} | Bairro: ${bairro}. Toque para aceitar!`,
        data: { 
          pedidoId: pedidoId,
          tipo: 'NOVA_CORRIDA'
        },
        // Estrutura Android (Heads-up) IMPORTANTE
        android: {
          channelId: "pedidos"
        }
      });
    }

    // 4. Envio via API da Expo em Lotes (Chunks)
    // A Expo recomenda enviar no máximo 100 notificações por requisição
    const chunks = [];
    const chunkSize = 100;
    
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    let notifiedCount = 0;

    for (let chunk of chunks) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
        
        const result = await response.json();
        console.log('Resposta da Expo:', JSON.stringify(result));
        notifiedCount += chunk.length;
      } catch (error) {
        console.error('Erro ao enviar chunk para Expo:', error);
      }
    }

    // 4.5. Envio via OneSignal
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

    // 5. Resposta com log confirmando
    console.log(`✅ Sucesso: ${notifiedCount} motoboys notificados para o pedido ${pedidoId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true, 
        message: 'Notificações enviadas com sucesso', 
        notifiedCount: notifiedCount 
      })
    };

  } catch (error) {
    console.error('Erro na automação de disparo:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno no servidor', details: error.message })
    };
  }
};
