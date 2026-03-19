import { executeSql } from './database';

interface OrderNotificationData {
  valor: number | string;
  bairro: string;
  distancia: number | string;
  regiao: string;
}

/**
 * Função para disparar notificações push de alta prioridade para motoboys na região de um pedido.
 * Deve ser chamada sempre que um novo pedido entrar no sistema.
 * 
 * Exibição em Primeiro Plano: A notificação deve usar o NotificationHandler no app
 * para ser exibida mesmo se o motoboy estiver navegando na WebView.
 * Exemplo de configuração no App (React Native/Expo):
 * Notifications.setNotificationHandler({
 *   handleNotification: async () => ({
 *     shouldShowAlert: true,
 *     shouldPlaySound: true,
 *     shouldSetBadge: false,
 *   }),
 * });
 */
export const sendNewOrderPushNotification = async (data: OrderNotificationData) => {
  const { valor, bairro, distancia, regiao } = data;

  try {
    // Busca no Neon: todos os expo_token da tabela motoboys onde o status = 'ativo' e a regiao seja igual à do estabelecimento.
    const queryMotoboys = `
      SELECT expo_token 
      FROM motoboys 
      WHERE status = 'ativo' 
        AND regiao = $1 
        AND expo_token IS NOT NULL 
        AND expo_token != ''
    `;

    let tokens: string[] = [];
    
    try {
      const resultMotoboys = await executeSql(queryMotoboys, [regiao]);
      tokens = resultMotoboys.map((row: any) => row.expo_token).filter(Boolean);
    } catch (err) {
      console.warn("Tabela motoboys não encontrada ou erro na query, tentando tabela drivers...", err);
      // Fallback para a tabela drivers caso a tabela motoboys não exista no banco atual
      const queryDrivers = `
        SELECT data->>'expoPushToken' as token 
        FROM drivers 
        WHERE (data->>'isOnline' = 'true' OR data->>'status' = 'ativo')
          AND data->>'city' = $1
          AND data->>'expoPushToken' IS NOT NULL 
          AND data->>'expoPushToken' != ''
      `;
      try {
        const result = await executeSql(queryDrivers, [regiao]);
        tokens = result.map((row: any) => row.token).filter(Boolean);
      } catch (e) {
        console.error("Erro ao buscar tokens na tabela drivers:", e);
      }
    }

    if (tokens.length === 0) {
      console.log(`Nenhum motoboy ativo com token válido encontrado na região: ${regiao}`);
      return;
    }

    // Remove tokens duplicados
    const uniqueTokens = [...new Set(tokens)];

    // Configuração da Notificação Elegante (Heads-up)
    const message = {
      to: uniqueTokens,
      title: '🚀 NOVA CORRIDA DISPONÍVEL!',
      body: `Valor: R$ ${valor} | Local: ${bairro} | Distância: ${distancia}km`,
      sound: 'default',
      priority: 'high',
      // Estrutura de Dados Android (Crucial)
      // Envie obrigatoriamente o campo channelId: "pedidos" dentro do objeto android.
      // Isso garante que a notificação salte na tela mesmo com o app aberto ou fechado.
      android: {
        channelId: 'pedidos'
      }
    };

    // Saída do Código: Função assíncrona usando fetch para a API da Expo
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
