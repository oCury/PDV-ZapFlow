"use client";

import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  RefreshCw,
  PackageX,
  GitCompare,
} from "lucide-react";

const reports = [
  {
    href: "/reports/abc",
    title: "Curva ABC",
    description:
      "Identifique os produtos que mais contribuem para o faturamento. Classificacao A, B e C por receita acumulada.",
    icon: BarChart3,
    color: "text-emerald-400",
    bgColor: "bg-emerald-400/10",
  },
  {
    href: "/reports/margin",
    title: "Margem de Lucro",
    description:
      "Analise a rentabilidade de cada produto. Veja custo, preco de venda, margem e lucro total.",
    icon: TrendingUp,
    color: "text-blue-400",
    bgColor: "bg-blue-400/10",
  },
  {
    href: "/reports/turnover",
    title: "Giro de Estoque",
    description:
      "Descubra quais produtos tem maior rotatividade. Compare vendas com estoque atual.",
    icon: RefreshCw,
    color: "text-amber-400",
    bgColor: "bg-amber-400/10",
  },
  {
    href: "/reports/stale",
    title: "Produtos Parados",
    description:
      "Encontre produtos com estoque que nao vendem ha dias. Identifique itens para promocao ou liquidacao.",
    icon: PackageX,
    color: "text-red-400",
    bgColor: "bg-red-400/10",
  },
  {
    href: "/reports/comparison",
    title: "Comparativo de Periodos",
    description:
      "Compare faturamento, ticket medio, vendas e itens entre dois periodos diferentes.",
    icon: GitCompare,
    color: "text-purple-400",
    bgColor: "bg-purple-400/10",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pure-white">Relatorios</h1>
        <p className="text-gray-400 text-sm mt-1">
          Analise detalhada do desempenho da loja com dados reais de vendas e estoque.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="group bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-200"
          >
            <div
              className={`w-12 h-12 rounded-xl ${report.bgColor} flex items-center justify-center mb-4`}
            >
              <report.icon size={24} className={report.color} />
            </div>
            <h2 className="text-lg font-semibold text-pure-white mb-2 group-hover:text-brand-green transition-colors">
              {report.title}
            </h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              {report.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
