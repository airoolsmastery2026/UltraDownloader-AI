
import { GoogleGenAI, Type } from "@google/genai";
import { VideoInfo, Platform } from "../types";

const PROXIES = [
  (target: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
  (target: string) => `https://corsproxy.io/?${encodeURIComponent(target)}`,
];

async function fetchWithProxyFallback(targetUrl: string): Promise<any> {
  for (const createProxyUrl of PROXIES) {
    const proxyUrl = createProxyUrl(targetUrl);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) continue;
      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (data) return data;
      } catch (e) {
        continue;
      }
    } catch (error) {
      continue;
    }
  }
  return null;
}

async function resolveUrl(url: string): Promise<string> {
  if (url.includes('vt.tiktok.com') || url.includes('v.douyin.com')) {
    try {
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      const data = await response.json();
      return data.url || url;
    } catch (e) {
      return url;
    }
  }
  return url;
}

export const detectPlatform = (url: string): Platform => {
  const lowerUrl = url.toLowerCase().trim();
  if (!lowerUrl) return 'other';
  if (lowerUrl.includes('tiktok.com')) return 'tiktok';
  if (lowerUrl.includes('douyin.com')) return 'douyin';
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
  if (lowerUrl.includes('instagram.com')) return 'instagram';
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.watch')) return 'facebook';
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'twitter';
  if (lowerUrl.includes('kuaishou.com') || lowerUrl.includes('chenzhongtech.com')) return 'kuaishou';
  if (lowerUrl.includes('bilibili.com')) return 'bilibili';
  // Nếu chỉ nhập @username
  if (lowerUrl.startsWith('@')) return 'tiktok';
  return 'other';
};

export const analyzeLink = async (url: string): Promise<VideoInfo | null> => {
  const resolvedUrl = await resolveUrl(url);
  const platform = detectPlatform(resolvedUrl);
  
  if (platform === 'tiktok' || platform === 'douyin') {
    const data = await fetchWithProxyFallback(`https://www.tikwm.com/api/?url=${encodeURIComponent(resolvedUrl)}&hd=1`);
    if (data?.code === 0 && data?.data) {
      const d = data.data;
      return {
        id: d.id,
        title: d.title || `${platform === 'douyin' ? 'Douyin' : 'TikTok'} Video ${d.id}`,
        author: d.author?.nickname ? `@${d.author.nickname}` : d.author?.unique_id ? `@${d.author.unique_id}` : "@creator",
        thumbnail: d.cover,
        duration: d.duration ? String(d.duration) : '0',
        downloadUrl: d.play,
        musicUrl: d.music,
        coverUrl: d.cover,
        platform
      };
    }
  }

  try {
    const res = await fetch('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: resolvedUrl, vQuality: '1080' })
    });
    const d = await res.json();
    if (d.url) {
      return {
        id: Math.random().toString(36).substr(2, 9),
        title: d.filename || `Video from ${platform}`,
        author: platform.charAt(0).toUpperCase() + platform.slice(1),
        thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?q=80&w=200',
        downloadUrl: d.url,
        coverUrl: '',
        platform
      };
    }
  } catch (e) {
    console.warn("Cobalt error", e);
  }

  return null;
};

export const getAiInsights = async (title: string): Promise<{ summary: string, tags: string[] } | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Phân tích tiêu đề video sau và trả về tóm tắt ngắn gọn bằng tiếng Việt (1 câu) và 3-5 hashtags liên quan nhất.
      Tiêu đề: "${title}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "tags"]
        }
      }
    });
    return JSON.parse(response.text);
  } catch (e) {
    return null;
  }
};

export const extractUsername = (url: string): string | null => {
  const input = url.trim();
  // Trường hợp nhập @username trực tiếp
  if (input.startsWith('@') && !input.includes('/')) {
    return input.substring(1);
  }
  
  // Trường hợp dán link profile: tiktok.com/@username
  const match = input.match(/tiktok\.com\/@([a-zA-Z0-9_.-]+)/);
  if (match) return match[1];
  
  // Trường hợp dán link video: tiktok.com/@username/video/123
  const parts = input.split('/');
  for (const p of parts) {
    if (p.startsWith('@')) return p.substring(1).split(/[?#]/)[0];
  }

  // Fallback cho chuỗi không có @ nhưng là 1 từ duy nhất (username)
  if (!input.includes('/') && !input.includes('.') && input.length > 0) {
    return input;
  }

  return null;
};

export const extractPlaylistId = (url: string): string | null => {
  const match = url.match(/[&?]list=([^&]+)/);
  return match ? match[1] : null;
};

export const fetchChannelVideos = async (username: string, cursor: number = 0): Promise<{videos: VideoInfo[], nextCursor: number, hasMore: boolean}> => {
  // Đảm bảo username không chứa @ khi gọi API
  const cleanUsername = username.replace('@', '');
  const targetApiUrl = `https://www.tikwm.com/api/user/posts?unique_id=${encodeURIComponent(cleanUsername)}&count=35&cursor=${cursor}`;
  const data = await fetchWithProxyFallback(targetApiUrl);
  
  if (data?.code === 0 && data?.data) {
    // TikWM có thể trả về data.videos hoặc data.posts tùy version API
    const videoList = data.data.videos || data.data.posts || [];
    if (videoList.length === 0) return { videos: [], nextCursor: 0, hasMore: false };

    return {
      videos: videoList.map((d: any) => ({
        id: d.video_id || d.id,
        title: d.title || `TikTok Video ${d.id}`,
        author: `@${cleanUsername}`,
        thumbnail: d.cover || d.origin_cover,
        duration: d.duration ? String(d.duration) : '0',
        downloadUrl: d.play || d.hdplay,
        musicUrl: d.music,
        coverUrl: d.cover || d.origin_cover,
        platform: 'tiktok'
      })),
      nextCursor: data.data.cursor ? Number(data.data.cursor) : 0,
      hasMore: data.data.hasMore === true || data.data.hasMore === 1
    };
  }
  return { videos: [], nextCursor: 0, hasMore: false };
};

export const fetchYoutubePlaylistVideos = async (playlistId: string): Promise<VideoInfo[]> => {
  const targetUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
  
  try {
    const res = await fetch(proxyUrl);
    const data = await res.json();
    const html = data.contents as string;

    // Tìm ytInitialData - Chứa toàn bộ thông tin playlist
    const searchStr = 'var ytInitialData = ';
    const startIdx = html.indexOf(searchStr);
    let jsonData = "";

    if (startIdx !== -1) {
      const cutHtml = html.substring(startIdx + searchStr.length);
      const endIdx = cutHtml.indexOf(';</script>');
      jsonData = cutHtml.substring(0, endIdx);
    } else {
      jsonData = html.slice(0, 30000);
    }

    // Tối ưu hóa: Chỉ lấy các phần quan trọng của JSON để AI không bị "lạc"
    // Trích xuất videoId và title thủ công sơ bộ để giảm tải cho AI
    const simplifiedData = jsonData.match(/"videoId":"([^"]+)","title":\{"runs":\[\{"text":"([^"]+)"/g)
      ?.slice(0, 50) // Giới hạn 50 video đầu tiên
      .join('\n') || jsonData.slice(0, 20000);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Nhiệm vụ: Trích xuất danh sách video (ID và Title) từ dữ liệu Playlist YouTube sau.
      Dữ liệu: ${simplifiedData}
      Trả về JSON Array: [{"id": "...", "title": "..."}]. Chỉ trả về JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING }
            },
            required: ["id", "title"]
          }
        }
      }
    });

    const videos = JSON.parse(response.text);
    return videos.map((v: any) => ({
      id: v.id,
      title: v.title,
      author: "YouTube Playlist",
      thumbnail: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
      downloadUrl: `https://www.youtube.com/watch?v=${v.id}`,
      platform: 'youtube',
      coverUrl: `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`
    }));
  } catch (e) {
    console.error("Fetch YT Playlist Error:", e);
    return [];
  }
};
