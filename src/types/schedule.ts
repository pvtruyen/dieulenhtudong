export type ScheduleMode = 'all' | 'summer' | 'winter' | 'holiday';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = CN, 1 = T2 ... 6 = T7

export type AudioSourceType = 'preset' | 'url' | 'file';

export type AudioPresetId =
  | 'reveille'      // Còi/Kèn báo thức
  | 'exercise'      // Nhạc hiệu thể dục sáng
  | 'bell_class'    // Kẻng/Chuông lên lớp
  | 'bell_meal'     // Kẻng báo ăn
  | 'whistle_check' // Còi kiểm tra nội vụ / điểm danh
  | 'taps';         // Nhạc hiệu tắt đèn đi ngủ

export interface ScheduleItem {
  id: string;
  name: string;
  time: string; // "HH:MM" 24h format
  days: DayOfWeek[]; // Empty or all 7 days
  mode: ScheduleMode;
  audioType: AudioSourceType;
  audioPreset?: AudioPresetId;
  audioUrl?: string;
  audioFileName?: string;
  enabled: boolean;
  note?: string;
}

export type SystemAudioStatus = 'locked' | 'ready' | 'playing' | 'emergency';
