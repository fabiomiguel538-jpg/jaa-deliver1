
import React, { useState, useEffect } from 'react';

interface CheckoutProps {
  amount: number;
  orderId: string;
  onCancel: () => void;
}

const Checkout: React.FC<CheckoutProps> = ({ amount, orderId, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CREDENCIAIS REAIS FORNECIDAS (INVERTIDAS CONFORME SOLICITADO)
  const PUBLIC_KEY = 'APP_USR-43c6c121-1cc2-4703-bf48-f338c8d7d783';
  const ACCESS_TOKEN = 'APP_USR-871249378482634-020908-8f0623dd5218ed910327b8075f0e485d-248196226';

  const handleRealPayment = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      // 1. CRIAR PREFERÊNCIA DE PAGAMENTO NA API DO MERCADO PAGO
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          items: [
            {
              id: orderId,
              title: `Jaa Delivery - Corrida #${orderId}`,
              description: 'Pagamento de frete para entrega expressa',
              quantity: 1,
              currency_id: 'BRL',
              unit_price: amount
            }
          ],
          external_reference: orderId,
          back_urls: {
            success: window.location.origin,
            failure: window.location.origin,
            pending: window.location.origin
          },
          auto_return: 'approved',
          payment_methods: {
            excluded_payment_types: [
              { id: 'ticket' }
            ],
            installments: 12
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Erro do MP:", errorData);
        throw new Error('Falha ao gerar preferência de pagamento. Verifique as credenciais.');
      }

      const preference = await response.json();
      const preferenceId = preference.id;

      // 2. INICIALIZAR O SDK E ABRIR O CHECKOUT PRO
      if (!(window as any).MercadoPago) {
        throw new Error('SDK do Mercado Pago não carregado');
      }

      const mp = new (window as any).MercadoPago(PUBLIC_KEY, {
        locale: 'pt-BR'
      });

      mp.checkout({
        preference: {
          id: preferenceId
        },
        autoOpen: true,
        render: {
          container: '.cho-container',
          label: 'Pagar',
        }
      });
      
      // A confirmação do pagamento será tratada pela URL de redirecionamento.
      // O pedido não é criado aqui.

    } catch (err: any) {
      console.error("Erro MP:", err);
      setError("Erro inesperado ao conectar com o Mercado Pago. Verifique as credenciais e sua conexão.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl border-4 border-white overflow-hidden relative p-10 text-center">
        
        <button onClick={() => { setLoading(false); onCancel(); }} className="absolute top-6 right-6 text-gray-300 hover:text-gray-500 z-10 transition-colors">✕</button>

        <div className="mb-8">
          <div className="flex items-center justify-center -space-x-4 mb-4">
            {/* Jaa Icon */}
            <div className="w-16 h-16 jaa-gradient rounded-3xl flex items-center justify-center text-white font-black text-2xl shadow-xl z-10 border-4 border-white transform -rotate-6 hover:rotate-0 transition-transform font-jaa italic">
              PJ
            </div>
            {/* Mercado Pago Icon */}
            <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center shadow-lg border-4 border-white z-0 transform rotate-6 hover:rotate-0 transition-transform">
               <img src="https://http2.mlstatic.com/static/org-img/builders/merchant-logos/mercadopago-80.png" className="w-10" alt="Mercado Pago" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-gray-800 font-jaa italic">Pagamento Seguro</h2>
          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-1">PedeJá + Mercado Pago</p>
        </div>

        <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100 relative group">
          <p className="text-[10px] text-gray-400 font-black uppercase mb-1">Total da Entrega</p>
          <p className="text-4xl font-black text-[#F84F39]">R$ {amount.toFixed(2)}</p>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-500 p-4 rounded-xl text-xs font-bold mb-6 border border-red-100">
            {error}
          </div>
        )}
        
        <div className="cho-container"></div>

        <div className="space-y-4">
          <button 
            onClick={handleRealPayment}
            disabled={loading}
            className="w-full bg-[#009EE3] text-white font-black py-5 rounded-2xl shadow-xl hover:bg-[#007EB5] active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-3"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>PROCESSANDO...</span>
              </div>
            ) : (
              <>
                <span>PAGAR COM MERCADO PAGO</span>
                <span className="text-xl">🚀</span>
              </>
            )}
          </button>
          
          <div className="flex flex-wrap justify-center gap-4 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            <img src="https://img.icons8.com/color/48/000000/visa.png" className="h-6" alt="Visa" />
            <img src="https://img.icons8.com/color/48/000000/mastercard.png" className="h-6" alt="Mastercard" />
            <img src="https://img.icons8.com/color/48/000000/pix.png" className="h-6" alt="Pix" />
            <img src="https://img.icons8.com/color/48/000000/amex.png" className="h-6" alt="Amex" />
          </div>
        </div>

        <p className="text-[9px] text-gray-400 mt-8 font-medium leading-relaxed">
          Você será redirecionado para o ambiente seguro do Mercado Pago.<br/>
          Seus dados estão 100% protegidos.
        </p>
      </div>
    </div>
  );
};

export default Checkout;
