const { Client } = require('pg');
exports.handler = async (event) => {
  const nome = event.queryStringParameters?.nome || (event.body && JSON.parse(event.body).nome) || 'Sem Nome';
  const token = event.queryStringParameters?.token || (event.body && JSON.parse(event.body).token);
  
  // Tratamento de número com fallback para 1 (suportando tanto URL quanto App)
  const regiao = parseInt(event.queryStringParameters?.regiao || (event.body && JSON.parse(event.body).regiao)) || 1;
  
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  try {
    await client.connect();
    
    // Comando SQL exato solicitado, sem inserir ID manualmente
    const query = "INSERT INTO motoboys (nome, expo_token, status, regiao) VALUES ($1, $2, 'disponivel', $3) ON CONFLICT (expo_token) DO UPDATE SET nome = EXCLUDED.nome, regiao = EXCLUDED.regiao;";
    
    await client.query(query, [nome, token, regiao]);
    await client.end();
    
    return { statusCode: 200, body: JSON.stringify({ message: "Sucesso! Motoboy atualizado no Neon." }) };
  } catch (err) {
    await client.end();
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
