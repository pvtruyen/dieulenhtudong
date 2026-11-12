export type ScheduleMode = 'all' | 'summer' | 'winter' | 'holiday';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = CN, 1 = T2 ... 6 = T7

export type AudioSourceType = 'preset' | 'url' | 'file';

export type AudioPresetId =
  | 'bao_thuc'  // 1. Nhạc hiệu Báo thức
  | 'tap_hop'   // 2. Nhạc hiệu Tập hợp / Lên lớp / Điểm danh
  | 'bao_an'    // 3. Nhạc hiệu Báo ăn
  | 'tat_den'   // 4. Nhạc hiệu Tắt đèn đi ngủ
  | 'chuong_reo' // 5. Chuông reo
  | 'canh_bao';  // 6. Còi cảnh báo

export interface CustomAudioPreset {
  id: string;
  label: string;
  url: string;
}

export interface ScheduleItem {
  id: string;
  name: string;
  time: string; // "HH:MM" 24h format
  days: DayOfWeek[]; // Empty or all 7 days
  mode: ScheduleMode;
  audioType: AudioSourceType;
  audioPreset?: AudioPresetId | string;
  audioUrl?: string;
  audioFileName?: string;
  repeatCount?: number;
  enabled: boolean;
  note?: string;
}

export type SystemAudioStatus = 'locked' | 'ready' | 'playing' | 'emergency';
