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
    `;
    
    try {
      const result = await executeSql(queryDrivers, []);
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

    // Dispara a notificação para cada token
    const promises = uniqueTokens.map(async (token) => {
      try {
        if (token.startsWith('ExponentPushToken') || token.startsWith('ExpoPushToken')) {
          // Envia diretamente para a API do Expo (não precisa de servidor)
          const driverEarning = order.driverEarning || 0;
          const distance = order.distance || 1;
          const pickupAddress = order.pickup?.address?.split(',')[0] || 'Local não informado';

          const expoMessage = {
            to: token,
            sound: 'default',
            priority: 'high',
            title: `Nova Corrida: R$ ${driverEarning.toFixed(2)}`,
            body: `Recolha: ${pickupAddress}. 1 parada.`,
            channelId: "pedidos",
            data: {
              id: order.id,
              orderId: order.id,
              valor: driverEarning.toFixed(2),
              storeId: order.storeId,
              distancia_km: `${distance.toFixed(1)} km`,
              valorPorKm: (driverEarning / distance).toFixed(2),
              titulo: 'Nova Corrida Disponível! 🛵',
              detalhes: `Pedido #${order.id}\n💰 Valor: R$ ${driverEarning.toFixed(2)}\n📏 Distância: ${distance.toFixed(1)} km\n📍 Origem: ${pickupAddress}`,
            }
          };

          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Accept-encoding': 'gzip, deflate',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(expoMessage),
          });

          if (!response.ok) {
            console.error(`Erro ao enviar para Expo token ${token.substring(0, 10)}...: ${response.statusText}`);
          } else {
            console.log(`Notificação enviada com sucesso para Expo token ${token.substring(0, 10)}...`);
          }
        } else {
          // Para FCM puro, ainda tenta usar a Netlify Function
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
            console.error(`Erro ao enviar para FCM token ${token.substring(0, 10)}...: ${response.statusText}`);
          } else {
            console.log(`Notificação enviada com sucesso para FCM token ${token.substring(0, 10)}...`);
          }
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
