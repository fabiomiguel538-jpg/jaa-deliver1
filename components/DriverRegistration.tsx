
import React, { useState } from 'react';
import { DriverProfile } from '../types';

interface DriverRegistrationProps {
  onSignup: (profile: Omit<DriverProfile, 'id' | 'status' | 'registrationDate' | 'balance'>) => void;
  onBack: () => void;
}

const DriverRegistration: React.FC<DriverRegistrationProps> = ({ onSignup, onBack }) => {
  const [activeTab, setActiveTab] = useState<'data' | 'documents'>('data');
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [form, setForm] = useState({
    name: '',
    email: '',
    taxId: '',
    vehicle: '',
    plate: '',
    cep: '',
    city: '', 
    password: '',
    licenseImageUrl: '',
    selfieWithLicenseUrl: '',
    vehiclePhotoUrl1: '',
    vehiclePhotoUrl2: ''
  });

  const handleCepBlur = async () => {
    const cleanCep = form.cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setIsSearchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setForm(prev => ({ 
            ...prev, 
            city: data.localidade 
          }));
        } else {
          alert("CEP não encontrado.");
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (activeTab === 'data') {
      const { name, email, taxId, vehicle, plate, city, password, cep } = form;
      if (name && email && taxId && vehicle && plate && city && password && cep) {
        setActiveTab('documents');
        window.scrollTo(0, 0);
      } else {
        alert("Por favor, preencha todos os campos obrigatórios da primeira etapa.");
      }
      return;
    }
    
    const { licenseImageUrl, selfieWithLicenseUrl, vehiclePhotoUrl1, vehiclePhotoUrl2 } = form;
    if (!licenseImageUrl || !selfieWithLicenseUrl || !vehiclePhotoUrl1 || !vehiclePhotoUrl2) {
      alert("Atenção: Você precisa enviar as 4 fotos obrigatórias para análise.");
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      onSignup(form);
    } catch (error) {
      console.error("Erro ao processar cadastro:", error);
      alert("Ocorreu um erro ao enviar seu cadastro. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const UploadCard = ({ title, icon, field, value }: { title: string, icon: string, field: string, value: string }) => (
    <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[1.5rem] p-4 flex flex-col items-center text-center group transition-all hover:border-[#F84F39]/30">
      <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition-transform">{icon}</div>
      <h3 className="text-[10px] font-black text-gray-800 uppercase tracking-tighter mb-3">{title}</h3>
      
      {value ? (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden border-2 border-white shadow-md">
           <img src={value} className="w-full h-full object-cover" alt="Preview" />
           <label className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
              <span className="text-[8px] font-black text-white uppercase tracking-widest">Alterar Foto</span>
              <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, field)} />
           </label>
        </div>
      ) : (
        <label className="w-full py-6 bg-white border border-gray-100 text-[#F84F39] rounded-xl text-[9px] font-black shadow-sm cursor-pointer hover:bg-gray-50 transition-all uppercase tracking-widest">
          ENVIAR FOTO
          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, field)} />
        </label>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-4 py-12">
      <div className={`w-full ${activeTab === 'data' ? 'max-w-md' : 'max-w-3xl'} bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-10 border border-gray-100 transition-all duration-500`}>
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-gray-800 italic tracking-tighter font-jaa">Jaa <span className="text-[#F84F39] not-italic">Driver</span></h2>
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Central de Verificação</p>
          <div className="flex justify-center gap-4 mt-8">
             <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${activeTab === 'data' ? 'bg-[#F84F39]' : 'bg-emerald-500'}`} />
             <div className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${activeTab === 'documents' ? 'bg-[#F84F39]' : 'bg-gray-100'}`} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'data' ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input 
                  type="text" required placeholder="Como no seu RG"
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CPF</label>
                  <input 
                    type="text" required placeholder="000.000.000-00"
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                    value={form.taxId}
                    onChange={e => setForm({...form, taxId: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">E-mail</label>
                  <input 
                    type="email" required placeholder="seu@email.com"
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CEP Atuação</label>
                  <div className="relative">
                    <input 
                      type="text" required placeholder="00000-000"
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                      value={form.cep}
                      onBlur={handleCepBlur}
                      onChange={e => setForm({...form, cep: e.target.value})}
                    />
                    {isSearchingCep && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-[#F84F39] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Cidade (Atuação)</label>
                  <input 
                    type="text" required placeholder="Digite sua cidade"
                    className="w-full px-6 py-4 bg-white border border-gray-100 rounded-2xl outline-none font-bold text-[#F84F39] focus:border-[#F84F39]"
                    value={form.city}
                    onChange={e => setForm({...form, city: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Modelo Moto</label>
                  <input 
                    type="text" required placeholder="Ex: Honda Titan"
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                    value={form.vehicle}
                    onChange={e => setForm({...form, vehicle: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Placa</label>
                  <input 
                    type="text" required placeholder="ABC1D23"
                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                    value={form.plate}
                    onChange={e => setForm({...form, plate: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Escolha sua Senha</label>
                <input 
                  type="password" required placeholder="••••••••"
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none font-semibold focus:border-[#F84F39] transition-all"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                />
              </div>

              <div className="pt-4">
                <button type="submit" className="w-full jaa-gradient text-white font-black py-5 rounded-2xl shadow-xl shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs">
                  AVANÇAR PARA FOTOS
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <UploadCard 
                  title="Documento CNH" 
                  icon="🪪" 
                  field="licenseImageUrl" 
                  value={form.licenseImageUrl} 
                />
                <UploadCard 
                  title="Selfie com CNH" 
                  icon="🤳" 
                  field="selfieWithLicenseUrl" 
                  value={form.selfieWithLicenseUrl} 
                />
                <UploadCard 
                  title="Foto da Moto (Frente)" 
                  icon="🏍️" 
                  field="vehiclePhotoUrl1" 
                  value={form.vehiclePhotoUrl1} 
                />
                <UploadCard 
                  title="Foto da Moto (Placa)" 
                  icon="🏷️" 
                  field="vehiclePhotoUrl2" 
                  value={form.vehiclePhotoUrl2} 
                />
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className={`w-full ${isSubmitting ? 'bg-gray-400' : 'jaa-gradient'} text-white font-black py-6 rounded-2xl shadow-xl shadow-red-100 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      ENVIANDO...
                    </>
                  ) : 'CONCLUIR E ENVIAR PARA ANÁLISE'}
                </button>
                <button 
                  type="button" 
                  disabled={isSubmitting}
                  onClick={() => setActiveTab('data')} 
                  className="w-full text-gray-400 font-black text-[10px] uppercase tracking-widest py-2"
                >
                  Corrigir dados cadastrais
                </button>
              </div>
            </div>
          )}
          <button 
            type="button" 
            disabled={isSubmitting}
            onClick={onBack} 
            className="w-full text-gray-300 font-black text-[10px] uppercase tracking-[0.3em] mt-2 hover:text-gray-500 transition-colors"
          >
            CANCELAR CADASTRO
          </button>
        </form>
      </div>
    </div>
  );
};

export default DriverRegistration;
