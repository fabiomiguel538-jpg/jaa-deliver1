import { executeSql } from './database';
import { Order } from '../types';

interface OrderNotificationData {
  valor: number | string;
  bairro: string;
  distancia: number | string;
  regiao: string;
  order: Order;
}

/**
 * Função para disparar notificações push de alta prioridade para motoboys na região de um pedido.
 * Deve ser chamada sempre que um novo pedido entrar no sistema.
 */
export const sendNewOrderPushNotification = async (data: OrderNotificationData) => {
  const { regiao, order } = data;

  try {
    let tokens: string[] = [];
    
    // Busca na tabela drivers todos os tokens (expoPushToken e fcmToken)
    const queryDrivers = `
      SELECT data->>'expoPushToken' as expo_token, data->>'fcmToken' as fcm_token
      FROM drivers 
      WHERE data->>'isOnline' = 'true'
        AND (LOWER(COALESCE(data->>'city', '')) = LOWER($1) OR COALESCE(data->>'city', '') = '' OR $1 = '')
    `;
    
    try {
      const result = await executeSql(queryDrivers, [regiao || '']);
      result.forEach((row: any) => {
        if (row.expo_token && row.expo_token.trim() !== '') tokens.push(row.expo_token);
        if (row.fcm_token && row.fcm_token.trim() !== '') tokens.push(row.fcm_token);
      });
    } catch (e) {
      console.error("Erro ao buscar tokens na tabela drivers:", e);
    }

    if (tokens.length === 0) {
      console.log(`Nenhum motoboy ativo com token válido encontrado na região: ${regiao}`);
      return;
    }

    // Remove tokens duplicados
    const uniqueTokens = [...new Set(tokens)];
    console.log(`Enviando notificações para ${uniqueTokens.length} tokens únicos na região ${regiao}`);

    // Dispara a notificação para cada token via Netlify Function
    const promises = uniqueTokens.map(async (token) => {
      try {
        const response = await fetch('/.netlify/functions/dispararNotificacao', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tokenFCM: token,
            dadosDoPedido: order
          }),
        });
        
        if (!response.ok) {
          console.error(`Erro ao enviar para token ${token.substring(0, 10)}...: ${response.statusText}`);
        } else {
          console.log(`Notificação enviada com sucesso para token ${token.substring(0, 10)}...`);
        }
      } catch (err) {
        console.error(`Falha na requisição para token ${token.substring(0, 10)}...:`, err);
      }
    });

    await Promise.allSettled(promises);
    return true;
  } catch (error) {
    console.error("Erro ao enviar notificação push de novo pedido:", error);
  }
};
