
import React, { useState, useEffect } from 'react';
import { analyzeLink, getAiInsights, fetchChannelVideos, extractUsername, detectPlatform, extractPlaylistId, fetchYoutubePlaylistVideos } from './services/geminiService';
import { VideoInfo, DownloadHistoryItem, DownloadType, Platform } from './types';
import { HistoryList } from './components/HistoryList';

const PLATFORM_UI: Record<Platform, { icon: string, color: string, name: string }> = {
  tiktok: { icon: 'fa-brands fa-tiktok', color: 'from-[#fe2c55] to-[#25f4ee]', name: 'TikTok' },
  douyin: { icon: 'fa-solid fa-music', color: 'from-[#000000] to-[#fe2c55]', name: 'Douyin' },
  youtube: { icon: 'fa-brands fa-youtube', color: 'from-red-600 to-red-500', name: 'YouTube' },
  instagram: { icon: 'fa-brands fa-instagram', color: 'from-purple-600 via-pink-500 to-orange-400', name: 'Instagram' },
  facebook: { icon: 'fa-brands fa-facebook', color: 'from-blue-700 to-blue-500', name: 'Facebook' },
  twitter: { icon: 'fa-brands fa-x-twitter', color: 'from-slate-200 to-slate-400', name: 'X / Twitter' },
  kuaishou: { icon: 'fa-solid fa-play', color: 'from-orange-500 to-yellow-400', name: 'Kuaishou' },
  bilibili: { icon: 'fa-brands fa-bilibili', color: 'from-blue-400 to-pink-400', name: 'Bilibili' },
  other: { icon: 'fa-solid fa-bolt-lightning', color: 'from-indigo-500 to-purple-500', name: 'Nhận diện thông minh' }
};

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [detectedPlatform, setDetectedPlatform] = useState<Platform>('other');
  
  const [currentVideo, setCurrentVideo] = useState<VideoInfo | null>(null);
  const [channelVideos, setChannelVideos] = useState<VideoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [batchStatus, setBatchStatus] = useState<{ current: number, total: number } | null>(null);
  
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [downloadType, setDownloadType] = useState<DownloadType>(DownloadType.SINGLE);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const platform = detectPlatform(url);
    setDetectedPlatform(platform);
    
    // Tự động chuyển chế độ dựa trên link
    if (url.includes('list=')) {
      setDownloadType(DownloadType.LIST);
    } else if ((url.includes('tiktok.com/@') || url.startsWith('@')) && !url.includes('/video/')) {
      setDownloadType(DownloadType.CHANNEL);
    } else if (url.trim() !== "") {
      setDownloadType(DownloadType.SINGLE);
    }
  }, [url]);

  useEffect(() => {
    const saved = localStorage.getItem('ultra_history_v5');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('ultra_history_v5', JSON.stringify(history));
  }, [history]);

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleProcess = async () => {
    if (!url.trim()) return;
    setError(null);
    setCurrentVideo(null);
    setChannelVideos([]);
    setIsLoading(true);

    try {
      if (downloadType === DownloadType.SINGLE) {
        const videoData = await analyzeLink(url);
        if (videoData) {
          setCurrentVideo(videoData);
          showToast(`Đã nhận diện: ${PLATFORM_UI[videoData.platform].name}`, 'success');
          setIsAiLoading(true);
          const ai = await getAiInsights(videoData.title);
          if (ai) setCurrentVideo(prev => prev ? { ...prev, aiInsights: ai } : null);
          setIsAiLoading(false);
        } else {
          setError('Không thể lấy dữ liệu video. Hãy thử lại hoặc dùng link khác.');
        }
      } else if (downloadType === DownloadType.CHANNEL) {
        const username = extractUsername(url);
        if (!username) {
          setError('Vui lòng nhập @username hoặc link profile TikTok hợp lệ.');
        } else {
          showToast(`Đang quét kênh @${username}...`, "info");
          const res = await fetchChannelVideos(username);
          if (res.videos.length > 0) {
            setChannelVideos(res.videos);
            showToast(`Thành công! Tìm thấy ${res.videos.length} video.`, 'success');
          } else {
            setError(`Không tìm thấy video nào của @${username}. Profile có thể riêng tư.`);
          }
        }
      } else if (downloadType === DownloadType.LIST) {
        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
          setError('Link không chứa Playlist ID hợp lệ (?list=...)');
        } else {
          showToast("Đang quét Playlist YouTube...", "info");
          const videos = await fetchYoutubePlaylistVideos(playlistId);
          if (videos.length > 0) {
            setChannelVideos(videos);
            showToast(`Tìm thấy ${videos.length} video trong danh sách.`, "success");
          } else {
            setError('Không thể lấy danh sách video. Playlist có thể bị ẩn.');
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError('Đã có lỗi xảy ra. Hãy kiểm tra kết nối mạng.');
    } finally {
      setIsLoading(false);
    }
  };

  const saveToHistory = (video: VideoInfo) => {
    const item: DownloadHistoryItem = {
      id: Date.now().toString(),
      video,
      timestamp: Date.now(),
      status: 'completed'
    };
    setHistory(prev => [item, ...prev.filter(p => p.video.id !== video.id)].slice(0, 20));
  };

  const downloadFile = async (video: VideoInfo, type: 'video' | 'audio', isBatch = false) => {
    let fileUrl = type === 'video' ? video.downloadUrl : (video.musicUrl || video.downloadUrl);
    
    if (video.platform === 'youtube' && !fileUrl.includes('cobalt')) {
      if (!isBatch) showToast("Đang tạo link tải YouTube...", "info");
      const analyzed = await analyzeLink(fileUrl);
      if (analyzed && analyzed.downloadUrl) {
        fileUrl = analyzed.downloadUrl;
      } else {
        if (!isBatch) showToast("Lỗi lấy link tải YouTube", "error");
        if (isBatch) window.open(fileUrl, '_blank');
        return false;
      }
    }

    const name = video.title || 'video';
    
    if (isBatch) {
      const win = window.open(fileUrl, '_blank');
      if (!win) {
        showToast("Vui lòng cho phép Popup!", "error");
        return false;
      }
      saveToHistory(video);
      return true;
    }

    try {
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = `${name.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}-${Date.now()}.${type === 'video' ? 'mp4' : 'mp3'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
      saveToHistory(video);
      showToast("Đang tải xuống...", "success");
    } catch (e) {
      window.open(fileUrl, '_blank');
      saveToHistory(video);
    }
    return true;
  };

  const handleDownloadAll = async () => {
    if (channelVideos.length === 0) return;
    const confirmDownload = window.confirm(`Bạn sắp mở ${channelVideos.length} tab tải xuống. Đảm bảo trình duyệt đã bật "Cho phép Popup".`);
    if (!confirmDownload) return;

    setBatchStatus({ current: 0, total: channelVideos.length });
    for (let i = 0; i < channelVideos.length; i++) {
      setBatchStatus({ current: i + 1, total: channelVideos.length });
      const success = await downloadFile(channelVideos[i], 'video', true);
      if (!success) break;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    setBatchStatus(null);
    showToast("Đã hoàn tất gửi yêu cầu tải!", "success");
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      showToast("Đã dán từ bộ nhớ tạm", "info");
    } catch (err) {
      showToast("Vui lòng dán link thủ công", "error");
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-indigo-500/30 font-sans pb-20">
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-2xl animate-in slide-in-from-right-full ${
          toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
        }`}>
          <i className={`fa-solid ${toast.type === 'success' ? 'fa-circle-check' : toast.type === 'error' ? 'fa-circle-xmark' : 'fa-circle-info'}`}></i>
          <span className="text-sm font-semibold">{toast.msg}</span>
        </div>
      )}

      {batchStatus && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#0f172a] border border-white/10 rounded-[2.5rem] p-10 max-w-sm w-full text-center shadow-2xl">
            <div className="w-20 h-20 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <i className="fa-solid fa-cloud-arrow-down text-3xl text-indigo-400 animate-bounce"></i>
            </div>
            <h3 className="text-xl font-black mb-2 uppercase tracking-tight">Tải Hàng Loạt</h3>
            <p className="text-slate-400 text-sm mb-8 font-medium">Video {batchStatus.current}/{batchStatus.total}</p>
            <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mb-4">
              <div 
                className="absolute top-0 left-0 h-full bg-indigo-500 transition-all duration-500" 
                style={{ width: `${(batchStatus.current / batchStatus.total) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 bg-[#020617]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 rotate-3">
              <i className="fa-solid fa-bolt-lightning text-white text-lg"></i>
            </div>
            <h1 className="text-xl font-black tracking-tighter">ULTRADOWN <span className="text-indigo-400">AI</span></h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => { setDownloadType(DownloadType.SINGLE); setChannelVideos([]); setCurrentVideo(null); }}
              className={`px-3 md:px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${downloadType === DownloadType.SINGLE ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/10 text-slate-500 hover:text-white'}`}
            >
              Tải Đơn
            </button>
            <button 
              onClick={() => { setDownloadType(DownloadType.CHANNEL); setCurrentVideo(null); setChannelVideos([]); }}
              className={`px-3 md:px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${downloadType === DownloadType.CHANNEL ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/10 text-slate-500 hover:text-white'}`}
            >
              Quét Kênh
            </button>
            <button 
              onClick={() => { setDownloadType(DownloadType.LIST); setCurrentVideo(null); setChannelVideos([]); }}
              className={`px-3 md:px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${downloadType === DownloadType.LIST ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/10 text-slate-500 hover:text-white'}`}
            >
              Playlist
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="max-w-3xl mx-auto mb-16">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-4 uppercase">
              {downloadType === DownloadType.SINGLE ? 'Tải Video Cao Cấp' : downloadType === DownloadType.CHANNEL ? 'Quét Kênh Video' : 'YouTube Playlist'}
            </h2>
            <p className="text-slate-400 font-medium">
              Xóa watermark TikTok/Douyin. Tải YouTube, IG, FB siêu nhanh.
            </p>
          </div>

          <div className="relative group">
            <div className={`absolute -inset-1 bg-gradient-to-r ${PLATFORM_UI[detectedPlatform].color} rounded-[2rem] blur opacity-10 group-focus-within:opacity-40 transition duration-1000`}></div>
            
            {/* Auto Detection Visual */}
            <div className={`absolute -top-3 left-8 z-10 px-4 py-1 rounded-full border border-white/10 bg-black/80 backdrop-blur-md flex items-center gap-2 transition-all duration-500 ${url.trim() ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <i className={`${PLATFORM_UI[detectedPlatform].icon} text-[10px] text-indigo-400`}></i>
              <span className="text-[9px] font-black uppercase tracking-widest text-white">
                {PLATFORM_UI[detectedPlatform].name}
              </span>
            </div>

            <div className="relative bg-[#0f172a]/80 backdrop-blur-xl rounded-[1.5rem] border border-white/5 p-2 flex flex-col md:flex-row gap-2">
              <div className="relative flex-1 flex items-center">
                <input 
                  type="text" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleProcess()}
                  placeholder={downloadType === DownloadType.SINGLE ? "Dán link video..." : downloadType === DownloadType.CHANNEL ? "Nhập @username hoặc link profile..." : "Dán link Playlist YouTube..."}
                  className="w-full bg-transparent px-6 py-4 rounded-xl text-lg font-medium placeholder-slate-600 focus:outline-none"
                />
                {!url && (
                  <button onClick={handlePaste} className="absolute right-4 text-slate-500 hover:text-indigo-400 transition-colors">
                    <i className="fa-solid fa-paste"></i>
                  </button>
                )}
              </div>
              <button 
                onClick={handleProcess}
                disabled={isLoading || !url}
                className={`md:w-44 py-4 md:py-0 rounded-xl font-black text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-3 shadow-2xl ${
                  isLoading || !url ? 'bg-slate-800 text-slate-600' : 'bg-white text-black hover:scale-[1.02] active:scale-95'
                }`}
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-slate-600 border-t-white rounded-full animate-spin"></div> : (
                  <><i className="fa-solid fa-bolt"></i> BẮT ĐẦU</>
                )}
              </button>
            </div>
          </div>
          {error && <p className="mt-4 text-center text-red-400 text-xs font-bold uppercase tracking-widest animate-pulse">{error}</p>}
        </div>

        {/* SINGLE RESULT */}
        {currentVideo && (
          <div className="max-w-3xl mx-auto bg-white/5 rounded-[3rem] border border-white/5 p-8 shadow-2xl animate-in zoom-in duration-500 overflow-hidden">
            <div className="flex flex-col md:flex-row gap-10">
              <div className="w-full md:w-56 h-80 rounded-[2rem] overflow-hidden shadow-2xl flex-shrink-0">
                <img src={currentVideo.thumbnail} className="w-full h-full object-cover" alt="thumbnail" />
              </div>
              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-4">
                  <i className={`${PLATFORM_UI[currentVideo.platform].icon} text-lg text-indigo-400`}></i>
                  <span className="text-xs font-black uppercase tracking-[0.2em] opacity-40">{currentVideo.platform}</span>
                </div>
                <h3 className="text-2xl font-black leading-tight mb-2 truncate">{currentVideo.title}</h3>
                <p className="text-indigo-400 font-bold text-sm mb-8">{currentVideo.author}</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => downloadFile(currentVideo, 'video')} className="flex items-center justify-center gap-3 bg-white text-black py-4 rounded-2xl font-black text-xs tracking-widest uppercase hover:bg-slate-200">
                    <i className="fa-solid fa-video"></i> Tải Video
                  </button>
                  <button onClick={() => downloadFile(currentVideo, 'audio')} className="flex items-center justify-center gap-3 bg-white/5 hover:bg-white/10 text-white py-4 rounded-2xl font-black text-xs tracking-widest uppercase border border-white/10">
                    <i className="fa-solid fa-music"></i> Tải Nhạc
                  </button>
                </div>

                {!isAiLoading && currentVideo.aiInsights && (
                  <div className="mt-8 p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                    <p className="text-sm text-slate-300 italic mb-4 leading-relaxed line-clamp-2">"{currentVideo.aiInsights.summary}"</p>
                    <div className="flex flex-wrap gap-2">
                      {currentVideo.aiInsights.tags.map(tag => (
                        <span key={tag} className="px-3 py-1 bg-indigo-500/10 rounded-full text-[9px] font-bold text-indigo-300">#{tag.replace('#', '')}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BATCH RESULTS */}
        {channelVideos.length > 0 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-white/5 pb-8">
              <div>
                <h3 className="text-2xl font-black tracking-tight">{downloadType === DownloadType.LIST ? 'Playlist YouTube' : 'Kênh TikTok'} ({channelVideos.length})</h3>
                <p className="text-slate-500 text-sm font-medium">Bấm "Tải Tất Cả" để mở trình tải đa luồng.</p>
              </div>
              <button onClick={handleDownloadAll} className="w-full md:w-auto px-10 py-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl active:scale-95">
                <i className="fa-solid fa-cloud-arrow-down mr-2"></i> TẢI TẤT CẢ VIDEO
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
              {channelVideos.map((video) => (
                <div key={video.id} className="group bg-white/5 border border-white/5 rounded-3xl overflow-hidden hover:border-indigo-500/30 transition-all">
                  <div className="aspect-[3/4] relative overflow-hidden bg-[#111]">
                    <img src={video.thumbnail} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-70" alt="" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-4">
                      <button onClick={() => downloadFile(video, 'video')} className="w-full py-2 bg-white text-black rounded-lg font-black text-[9px] uppercase">Tải Ngay</button>
                    </div>
                  </div>
                  <div className="p-4 text-center">
                    <p className="text-[10px] font-bold text-slate-400 truncate mb-1">{video.title || "Clip"}</p>
                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">HD • NO LOGO</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* DEFAULT VIEW */}
        {!currentVideo && channelVideos.length === 0 && (
          <div className="grid lg:grid-cols-12 gap-10 mt-10">
            <div className="lg:col-span-8">
              <HistoryList 
                items={history} 
                onClear={() => setHistory([])}
                onDownload={(v) => {
                  setDownloadType(DownloadType.SINGLE);
                  setCurrentVideo(v);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </div>
            <div className="lg:col-span-4 space-y-6">
              <div className="p-8 bg-indigo-500/5 rounded-[2.5rem] border border-indigo-500/10">
                <h4 className="text-indigo-400 font-black text-xs uppercase tracking-widest mb-6">Mẹo quét nhanh</h4>
                <ul className="space-y-4 text-[11px] font-medium text-slate-400">
                  <li className="flex gap-3"><i className="fa-solid fa-bolt text-indigo-500"></i> Dán link TikTok Profile để tải hàng loạt clip của người đó.</li>
                  <li className="flex gap-3"><i className="fa-solid fa-check text-indigo-500"></i> Hỗ trợ link rút gọn Douyin và TikTok.</li>
                  <li className="flex gap-3"><i className="fa-solid fa-check text-indigo-500"></i> Playlist YouTube hỗ trợ tối đa 50 video mỗi lần quét.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-[#020617]/80 backdrop-blur-xl border-t border-white/5 h-16 flex items-center justify-center z-40">
        <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-700">ULTRADOWN AI • VERSION 5.2 • POWERED BY GEMINI 3</p>
      </footer>
    </div>
  );
};

export default App;
