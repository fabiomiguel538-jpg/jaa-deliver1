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

    const cpf = params.cpf || body.cpf;
    const token = params.token || body.token || body.expo_token;
    
    if (!cpf || !token) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "CPF e Token são obrigatórios" }) };
    }

    // Log solicitado para visualização no Netlify
    console.log(`Novo acesso detectado - CPF: ${cpf}, Token: ${token}`);

    // Verifica se a conexão está apontando para o banco neondb
    if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('neondb')) {
      console.warn("Aviso: A DATABASE_URL parece não estar apontando para o banco 'neondb'. Verifique suas variáveis de ambiente no Netlify.");
    }

    await client.connect();

    // Comando SQL para vincular o token ao CPF do motorista
    const query = `
      INSERT INTO drivers (cpf, expo_token) 
      VALUES ($1, $2) 
      ON CONFLICT (cpf) 
      DO UPDATE SET expo_token = EXCLUDED.expo_token;
    `;

    await client.query(query, [cpf, token]);
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
