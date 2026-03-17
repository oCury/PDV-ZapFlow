"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Package, TrendingUp, DollarSign, Loader2 } from "lucide-react";

interface RevenueData {
  revenue: number;
}

interface CategorySalesData {
  name: string;
  sales: number;
}

interface TopSellerData {
  name: string;
  image_url: string | null;
  totalSold: number;
}

export default function SalesPage() {
  const [dailyRevenue, setDailyRevenue] = useState<number>(0);
  const [weeklyRevenue, setWeeklyRevenue] = useState<number>(0);
  const [monthlyRevenue, setMonthlyRevenue] = useState<number>(0);
  const [categorySales, setCategorySales] = useState<CategorySalesData[]>([]);
  const [topSellers, setTopSellers] = useState<TopSellerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [dailyRes, weeklyRes, monthlyRes, categoriesRes, topSellersRes] = await Promise.all([
          fetch("/api/analytics/revenue/daily"),
          fetch("/api/analytics/revenue/weekly"),
          fetch("/api/analytics/revenue/monthly"),
          fetch("/api/analytics/categories"),
          fetch("/api/analytics/top-sellers"),
        ]);

        const dailyData: RevenueData = await dailyRes.json();
        const weeklyData: RevenueData = await weeklyRes.json();
        const monthlyData: RevenueData = await monthlyRes.json();
        const categoriesData: CategorySalesData[] = await categoriesRes.json();
        const topSellersData: TopSellerData[] = await topSellersRes.json();

        setDailyRevenue(dailyData.revenue);
        setWeeklyRevenue(weeklyData.revenue);
        setMonthlyRevenue(monthlyData.revenue);
        setCategorySales(categoriesData);
        setTopSellers(topSellersData);
      } catch (err) {
        console.error("Failed to fetch analytics data:", err);
        setError("Erro ao carregar dados de vendas.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="animate-spin mr-2" size={24} /> Carregando dados...
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 p-4">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Dashboard de Vendas</h1>
        <p className="text-slate-400 text-sm mt-1">Visão geral das métricas e desempenho de vendas.</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard title="Faturamento Hoje" value={dailyRevenue} />
        <MetricCard title="Faturamento Semanal" value={weeklyRevenue} />
        <MetricCard title="Faturamento Mensal" value={monthlyRevenue} />
      </div>

      {/* Sales by Category Chart */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-slate-100 mb-4">Vendas por Categoria</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={categorySales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="name" stroke="#94a3b8" />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", color: "#f1f5f9" }}
              formatter={(value) => (typeof value === 'number' ? `${value} un.` : value)}
            />
            <Bar dataKey="sales" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Sellers */}
      <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
        <h2 className="text-xl font-semibold text-slate-100 mb-4">Top 5 Produtos Mais Vendidos</h2>
        <div className="space-y-3">
          {topSellers.length === 0 ? (
            <p className="text-slate-500 text-sm">Nenhum produto vendido ainda.</p>
          ) : (
            topSellers.map((product, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-slate-700/50 rounded-xl">
                <img
                  src={product.image_url || "/placeholder-product.png"}
                  alt={product.name}
                  className="w-12 h-12 object-cover rounded-lg border border-slate-600"
                />
                <div className="flex-1">
                  <p className="font-medium text-slate-200">{product.name}</p>
                  <p className="text-sm text-slate-500">{product.totalSold} unidades vendidas</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
}

function MetricCard({ title, value }: MetricCardProps) {
  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 flex flex-col items-start">
      <div className="flex items-center gap-2 text-slate-400 mb-2">
        <DollarSign size={20} />
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-3xl font-bold text-brand-green">R$ {value.toFixed(2)}</p>
    </div>
  );
}
