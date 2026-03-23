const { neon } = require('@neondatabase/serverless');

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

  // Apenas permite POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  try {
    // Conecta ao banco Neon usando a variável de ambiente
    const sql = neon(process.env.DATABASE_URL);
    
    // Faz o parse do corpo da requisição
    const payload = event.body ? JSON.parse(event.body) : {};
    const { nome, expo_token } = payload;

    console.log('Recebendo requisição para salvar token:', { nome, expo_token });

    // Validação básica
    if (!nome || !expo_token) {
      console.log('Erro: Nome ou expo_token ausentes.');
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Nome e expo_token são obrigatórios' }) 
      };
    }

    // Executa a query SQL (Upsert: insere ou atualiza se o token já existir)
    await sql`
      INSERT INTO motoboys (nome, expo_token, status) 
      VALUES (${nome}, ${expo_token}, 'disponivel') 
      ON CONFLICT (expo_token) 
      DO UPDATE SET nome = ${nome}
    `;

    console.log(`Token salvo com sucesso para o motoboy: ${nome}`);

    // Retorna sucesso
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify({ success: true, message: 'Token salvo com sucesso!' }) 
    };

  } catch (error) {
    // Registra o erro no console do Netlify
    console.error('Erro ao salvar token no banco de dados:', error);
    
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Erro interno do servidor', details: error.message }) 
    };
  }
};
