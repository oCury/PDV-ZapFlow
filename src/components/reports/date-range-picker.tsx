"use client";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: DateRangePickerProps) {
  const today = new Date();

  const handleShortcut = (shortcut: string) => {
    const now = new Date();
    let start: Date;
    let end: Date = now;

    switch (shortcut) {
      case "today":
        start = now;
        break;
      case "week": {
        start = new Date(now);
        const dayOfWeek = start.getDay();
        start.setDate(start.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        break;
      }
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "lastMonth": {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      }
      default:
        return;
    }

    onChange(formatDate(start), formatDate(end));
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 font-medium">Inicio</label>
        <input
          type="date"
          value={startDate}
          max={formatDate(today)}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 font-medium">Fim</label>
        <input
          type="date"
          value={endDate}
          max={formatDate(today)}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-pure-white text-sm focus:outline-none focus:border-brand-green"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleShortcut("today")}
          className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-pure-white transition-colors"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => handleShortcut("week")}
          className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-pure-white transition-colors"
        >
          Esta Semana
        </button>
        <button
          type="button"
          onClick={() => handleShortcut("month")}
          className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-pure-white transition-colors"
        >
          Este Mes
        </button>
        <button
          type="button"
          onClick={() => handleShortcut("lastMonth")}
          className="px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-pure-white transition-colors"
        >
          Mes Anterior
        </button>
      </div>
    </div>
  );
}
