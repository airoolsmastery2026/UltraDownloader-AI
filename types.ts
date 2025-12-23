
export type Platform = 'tiktok' | 'douyin' | 'youtube' | 'instagram' | 'facebook' | 'twitter' | 'kuaishou' | 'bilibili' | 'other';

export interface VideoInfo {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  duration?: string;
  downloadUrl: string;
  musicUrl?: string;
  coverUrl: string;
  platform: Platform;
  aiInsights?: {
    summary: string;
    tags: string[];
  };
}

export interface DownloadHistoryItem {
  id: string;
  video: VideoInfo;
  timestamp: number;
  status: 'completed' | 'failed' | 'processing';
}

export enum DownloadType {
  SINGLE = 'SINGLE',
  CHANNEL = 'CHANNEL',
  LIST = 'LIST'
}
