const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    const payload = JSON.parse(event.body);
    const pedido = payload.record || payload;
    const pedidoId = pedido.id;

    if (!pedidoId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'ID do pedido não fornecido' }) };
    }

    const pedidosResult = await sql`
      SELECT valor, bairro, id_regiao FROM pedidos WHERE id = ${pedidoId}
    `;

    if (pedidosResult.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Pedido não encontrado' }) };
    }

    const { valor, bairro, id_regiao } = pedidosResult[0];

    const motoboysResult = await sql`
      SELECT expo_token FROM motoboys 
      WHERE status = 'disponivel' AND regiao = ${id_regiao} AND expo_token IS NOT NULL
    `;

    const expoTokens = motoboysResult.map(m => m.expo_token).filter(token => token && token.startsWith('ExponentPushToken'));

    if (expoTokens.length === 0) {
      return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Nenhum motoboy com token' }) };
    }

    const messages = expoTokens.map(token => ({
      to: token,
      sound: 'default',
      priority: 'high',
      title: "🚀 NOVA CORRIDA DISPONÍVEL!",
      body: `Valor: R$ ${valor} | Bairro: ${bairro}. Toque para aceitar!`,
      android: { channelId: "pedidos" }
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    return { statusCode: 200, body: JSON.stringify({ success: true, notified: messages.length }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
