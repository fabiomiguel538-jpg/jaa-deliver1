import { executeSql } from './database';

export const sendNewOrderPushNotification = async (valor: number, bairro: string, km: number) => {
  try {
    // 1. Busca de Alvos: motoboys disponíveis e com expo_token válido
    // A tabela principal do app é 'drivers', mas o usuário pode ter criado 'motoboys'
    const queryDrivers = `
      SELECT data->>'expoPushToken' as token 
      FROM drivers 
      WHERE (data->>'isOnline' = 'true' OR data->>'status' = 'disponivel')
        AND data->>'expoPushToken' IS NOT NULL 
        AND data->>'expoPushToken' != ''
    `;
    
    // Tenta também na tabela motoboys conforme solicitado
    const queryMotoboys = `
      SELECT expo_token as token 
      FROM motoboys 
      WHERE status = 'disponivel' 
        AND expo_token IS NOT NULL 
        AND expo_token != ''
    `;

    let tokens: string[] = [];
    
    try {
      // Tenta primeiro a tabela motoboys (solicitada pelo usuário)
      const resultMotoboys = await executeSql(queryMotoboys);
      tokens = resultMotoboys.map((row: any) => row.token).filter(Boolean);
    } catch (err) {
      console.warn("Tabela motoboys não encontrada ou erro na query, tentando tabela drivers...", err);
      try {
        const result = await executeSql(queryDrivers);
        tokens = result.map((row: any) => row.token).filter(Boolean);
      } catch (e) {
        console.error("Erro ao buscar tokens na tabela drivers:", e);
      }
    }

    if (tokens.length === 0) {
      console.log("Nenhum motoboy disponível com token válido encontrado.");
      return;
    }

    // Remove tokens duplicados
    const uniqueTokens = [...new Set(tokens)];

    // 2. Conteúdo da Notificação e Parâmetros de Alta Prioridade
    const message = {
      to: uniqueTokens,
      title: '🚀 NOVA CORRIDA DISPONÍVEL!',
      body: `Valor: R$ ${valor.toFixed(2)} | Bairro: ${bairro} | Distância: ${km.toFixed(1)}km`,
      priority: 'high',
      sound: 'default',
      android: {
        channelId: 'pedidos',
        priority: 'high'
      },
      data: { type: 'NEW_ORDER' },
    };

    // 3. Endpoint da Expo (POST)
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const receipt = await response.json();
    console.log("Notificações enviadas com sucesso:", receipt);
    
    return receipt;
  } catch (error) {
    console.error("Erro ao enviar notificação push de novo pedido:", error);
  }
};
