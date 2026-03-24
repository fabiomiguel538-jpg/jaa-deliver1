const { Client } = require('pg');

exports.handler = async (event) => {
  // Configuração de CORS (opcional, mas recomendado se o app chamar via fetch direto)
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Captura os dados
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    const token = params.token || body.token || body.expo_token;
    
    if (!token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Token não fornecido" }) };
    }

    // Log solicitado para visualização no Netlify
    console.log('Novo acesso detectado para o token:', token);

    await client.connect();

    // Comando SQL atualizado para a tabela public.drivers
    const query = `
      INSERT INTO public.drivers (expo_token, status, regiao) 
      VALUES ($1, 'disponivel', 1) 
      ON CONFLICT (expo_token) 
      DO NOTHING;
    `;

    await client.query(query, [token]);
    await client.end();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "sucesso", message: "Token processado com sucesso!" }),
    };
  } catch (error) {
    if (client) await client.end();
    console.error("Erro no banco:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, detail: "Erro interno no servidor" }),
    };
  }
};
