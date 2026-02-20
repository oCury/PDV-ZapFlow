import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary-dark">Configurações</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gerencie as configurações do sistema
        </p>
      </div>

      <div className="bg-pure-white rounded-2xl p-6 shadow-sm border border-gray-200">
        <div className="text-center py-16 text-gray-400">
          <Settings size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">Em breve</p>
          <p className="text-sm mt-1">
            Configurações do sistema serão adicionadas em uma próxima versão
          </p>
        </div>
      </div>
    </div>
  );
}
