
import React from 'react';
// Fix: Use VideoInfo instead of TikTokVideo as it's the correct exported member from types.ts
import { VideoInfo, DownloadHistoryItem } from '../types';

interface HistoryListProps {
  items: DownloadHistoryItem[];
  onClear: () => void;
  // Fix: Use VideoInfo instead of TikTokVideo
  onDownload: (video: VideoInfo) => void;
}

export const HistoryList: React.FC<HistoryListProps> = ({ items, onClear, onDownload }) => {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-xl">
        <i className="fa-solid fa-clock-rotate-left text-3xl mb-3 block"></i>
        <p>Your download history is empty</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/30 rounded-2xl border border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <h3 className="font-semibold text-slate-200">Recent Downloads</h3>
        <button 
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear All
        </button>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-4 p-3 hover:bg-slate-700/30 transition-colors border-b border-slate-700 last:border-0 group">
            <img 
              src={item.video.thumbnail} 
              alt={item.video.title} 
              className="w-12 h-16 rounded-md object-cover bg-slate-900 shadow-sm"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate group-hover:text-[#25f4ee] transition-colors">{item.video.title}</p>
              <p className="text-xs text-slate-400">{item.video.author}</p>
              <p className="text-[10px] text-slate-500 mt-1">
                {new Date(item.timestamp).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2">
               <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                 item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
               }`}>
                 {item.status}
               </span>
               <button 
                onClick={() => onDownload(item.video)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-all"
                title="Download Again"
               >
                 <i className="fa-solid fa-download"></i>
               </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};