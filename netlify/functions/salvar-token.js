const { Client } = require('pg');
exports.handler = async (event) => {
  const nome = event.queryStringParameters?.nome || (event.body && JSON.parse(event.body).nome) || 'Sem Nome';
  const token = event.queryStringParameters?.token || (event.body && JSON.parse(event.body).token);
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    const query = 'INSERT INTO motoboys (nome, expo_token, status, regiao) VALUES ($1, $2, $3, $4) ON CONFLICT (expo_token) DO UPDATE SET nome = EXCLUDED.nome;';
    await client.query(query, [nome, token, 'disponivel', 1]);
    await client.end();
    return { statusCode: 200, body: JSON.stringify({ message: "Sucesso! Motoboy atualizado no Neon." }) };
  } catch (err) {
    await client.end();
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
