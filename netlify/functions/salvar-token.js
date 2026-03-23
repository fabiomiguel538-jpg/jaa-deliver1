const { Client } = require('pg');

exports.handler = async (event) => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Captura os dados com valores padrão de segurança
    const params = event.queryStringParameters || {};
    const body = event.body ? JSON.parse(event.body) : {};

    const nome = params.nome || body.nome || 'Motoboy Anonimo';
    const token = params.token || body.token || body.expo_token;
    
    // FORÇA a conversão para número, se falhar vira 1
    let regiaoRaw = params.regiao || body.regiao || 1;
    const regiao = isNaN(parseInt(regiaoRaw)) ? 1 : parseInt(regiaoRaw);

    if (!token) {
      return { statusCode: 400, body: JSON.stringify({ error: "Token não fornecido" }) };
    }

    await client.connect();

    const query = `
      INSERT INTO motoboys (nome, expo_token, status, regiao)
      VALUES ($1, $2, 'disponivel', $3)
      ON CONFLICT (expo_token) 
      DO UPDATE SET nome = EXCLUDED.nome, regiao = EXCLUDED.regiao;
    `;

    await client.query(query, [nome, token, regiao]);
    await client.end();

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "sucesso", message: "Dados salvos/atualizados!" }),
    };
  } catch (error) {
    if (client) await client.end();
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, detail: "Erro interno no servidor" }),
    };
  }
};
