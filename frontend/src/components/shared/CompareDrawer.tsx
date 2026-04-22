import Link from 'next/link';
import { useCompare } from '@/lib/context/CompareContext';
import { X, ArrowRight, TableProperties } from 'lucide-react';

export function CompareDrawer() {
  const { selectedIds, toggleListing, clearCompare } = useCompare();

  if (selectedIds.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-800 p-4 flex items-center justify-between gap-6 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center space-x-4">
          <div className="flex -space-x-2 overflow-hidden">
             {selectedIds.map(id => (
               <div key={id} className="relative group">
                 <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                    {id.slice(0, 2).toUpperCase()}
                 </div>
                 <button 
                  onClick={() => toggleListing(id)}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition shadow-sm"
                 >
                   <X size={10} />
                 </button>
               </div>
             ))}
             {selectedIds.length < 3 && (
               <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800/50 border-dashed flex items-center justify-center text-slate-500">
                 <span className="text-[10px]">+</span>
               </div>
             )}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-bold">{selectedIds.length} listings selected</p>
            <p className="text-[10px] text-slate-400">Select up to 3 to compare</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={clearCompare}
            className="text-xs font-medium text-slate-400 hover:text-white transition px-2"
          >
            Clear
          </button>
          
          <Link
            href={`/listings/compare?ids=${selectedIds.join(',')}`}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              selectedIds.length >= 2 
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            onClick={(e) => selectedIds.length < 2 && e.preventDefault()}
          >
            <span>Compare</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
