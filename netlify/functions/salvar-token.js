const { Client } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  // Configuração de CORS
  const headers = {
    'Access-Control-Allow-Origin': event.headers.origin || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, User-Agent, X-Requested-With, Accept, Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  // Responde a requisições OPTIONS (Preflight do CORS)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Permite GET (para testes na URL) e POST (para o App)
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    let nome, expo_token;

    // Captura os parâmetros dependendo do método (GET ou POST)
    if (event.httpMethod === 'GET') {
      nome = event.queryStringParameters.nome;
      expo_token = event.queryStringParameters.token || event.queryStringParameters.expo_token;
    } else {
      const payload = event.body ? JSON.parse(event.body) : {};
      nome = payload.nome;
      expo_token = payload.token || payload.expo_token;
    }

    // Log de Diagnóstico: Mostra os dados recebidos antes de tentar salvar
    console.log('Dados recebidos para salvar:', { nome, expo_token });

    // Validação básica
    if (!nome || !expo_token) {
      console.log('Erro: Nome ou token ausentes.');
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Nome e token são obrigatórios' }) 
      };
    }

    // Conexão Segura: Usando Client com ssl: { rejectUnauthorized: false }
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // Comando SQL Robusto (Upsert)
    const query = `
      INSERT INTO motoboys (nome, expo_token, status) 
      VALUES ($1, $2, 'disponivel') 
      ON CONFLICT (expo_token) 
      DO UPDATE SET nome = $1
    `;
    
    await client.query(query, [nome, expo_token]);
    await client.end();

    console.log(`Token salvo com sucesso para o motoboy: ${nome}`);

    // Retorna sucesso
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ success: true, message: 'Token salvo com sucesso!', nome, expo_token }) 
    };

  } catch (error) {
    // Registra o erro no console do Netlify
    console.error('Erro ao salvar token no banco de dados:', error);
    
    // Resposta Clara: Retorna o erro no corpo do JSON
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Erro ao salvar no banco de dados', details: error.message }) 
    };
  }
};
