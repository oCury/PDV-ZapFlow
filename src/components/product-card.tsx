import { Package, Plus, Pencil, Trash2 } from "lucide-react";

export interface ProductCardProps {
  id: string;
  name: string;
  barcode: string;
  sell_price: number;
  cost_price?: number;
  stock_quantity: number;
  min_stock?: number;
  category: string;
  image_url: string | null;
  onAddToCart?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export function ProductCard({
  id,
  name,
  barcode,
  sell_price,
  stock_quantity,
  min_stock = 5,
  category,
  image_url,
  onAddToCart,
  onEdit,
  onDelete,
}: ProductCardProps) {
  const inStock = stock_quantity > 0;
  const lowStock = stock_quantity > 0 && stock_quantity <= min_stock;
  const goodStock = stock_quantity > min_stock;

  return (
    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors duration-200 flex flex-col">
      <div className="relative h-40 bg-slate-700/50 flex items-center justify-center">
        {image_url ? (
          <img
            src={image_url}
            alt={name}
            className="object-cover w-full h-full"
          />
        ) : (
          <Package size={48} className="text-slate-600" />
        )}
        <span className="absolute top-2 left-2 bg-slate-900/80 text-slate-300 text-xs font-medium px-2.5 py-1 rounded-full">
          {category}
        </span>
        {lowStock && (
          <span className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Estoque baixo
          </span>
        )}
        {!inStock && (
          <span className="absolute top-2 right-2 bg-red-500 text-white text-xs font-medium px-2.5 py-1 rounded-full">
            Sem estoque
          </span>
        )}

        {(onEdit || onDelete) && (
          <div className="absolute bottom-2 right-2 flex gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(id)}
                className="bg-slate-800/90 hover:bg-slate-700 text-slate-300 p-1.5 rounded-lg transition-colors shadow-sm"
                title="Editar produto"
              >
                <Pencil size={14} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(id)}
                className="bg-slate-800/90 hover:bg-red-500/20 text-red-400 p-1.5 rounded-lg transition-colors shadow-sm"
                title="Excluir produto"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-slate-200 text-sm leading-tight line-clamp-2">
          {name}
        </h3>
        <p className="text-xs text-slate-500 mt-1 font-mono">{barcode}</p>

        <div className="mt-auto pt-3 flex items-end justify-between">
          <div>
            <p className="text-xl font-bold text-brand-green">
              R$ {sell_price.toFixed(2)}
            </p>
            <p className={`text-xs font-bold ${
              !inStock ? "text-red-500" : lowStock ? "text-amber-400" : "text-emerald-400"
            }`}>
              {stock_quantity} em estoque
            </p>
          </div>

          {onAddToCart && (
            <button
              onClick={() => onAddToCart(id)}
              disabled={!inStock}
              className="bg-brand-green hover:bg-brand-green-hover disabled:bg-slate-600 disabled:cursor-not-allowed text-primary-dark p-2.5 rounded-xl transition-colors duration-200"
            >
              <Plus size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
