import { DayOfWeek, ScheduleItem, ScheduleMode } from '../types/schedule';

export function getDateInTimezone(date: Date, timeZone: string): Date {
  if (!timeZone || timeZone === 'local') return date;
  try {
    const invdate = new Date(date.toLocaleString('en-US', { timeZone }));
    const diff = date.getTime() - invdate.getTime();
    return new Date(date.getTime() - diff);
  } catch {
    return date;
  }
}

export function formatTimeHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatTimeHHMMSS(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatDateVN(date: Date): string {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()];
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dayName}, ${dd}/${mm}/${yyyy}`;
}

export function shouldTriggerSchedule(
  item: ScheduleItem,
  now: Date,
  activeMode: ScheduleMode,
  lastTriggeredKey: string | null
): boolean {
  if (!item.enabled) return false;

  // Mode check: if activeMode is not 'all', item must match activeMode or be 'all'
  if (activeMode !== 'all' && item.mode !== 'all' && item.mode !== activeMode) {
    return false;
  }

  const currentDay = now.getDay() as DayOfWeek;
  if (item.days.length > 0 && !item.days.includes(currentDay)) {
    return false;
  }

  const currentHHMM = formatTimeHHMM(now);
  if (item.time !== currentHHMM) {
    return false;
  }

  // Prevent duplicate triggers within the same minute
  const triggerKey = `${item.id}_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${currentHHMM}`;
  if (lastTriggeredKey === triggerKey) {
    return false;
  }

  return true;
}

export function buildTriggerKey(itemId: string, now: Date): string {
  return `${itemId}_${now.getFullYear()}-${now.getMonth()}-${now.getDate()}_${formatTimeHHMM(now)}`;
}

export function filterSchedules(
  schedules: ScheduleItem[],
  modeFilter: ScheduleMode,
  searchQuery: string
): ScheduleItem[] {
  const q = searchQuery.trim().toLowerCase();
  return schedules
    .filter((item) => {
      if (modeFilter !== 'all' && item.mode !== 'all' && item.mode !== modeFilter) {
        return false;
      }
      if (q) {
        const matchName = item.name.toLowerCase().includes(q);
        const matchNote = (item.note || '').toLowerCase().includes(q);
        const matchTime = item.time.includes(q);
        return matchName || matchNote || matchTime;
      }
      return true;
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

export interface NextScheduleInfo {
  item: ScheduleItem;
  minutesRemaining: number;
}

export function getNextSchedule(
  schedules: ScheduleItem[],
  now: Date,
  activeMode: ScheduleMode
): NextScheduleInfo | null {
  const currentDay = now.getDay() as DayOfWeek;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const candidates = schedules
    .filter((item) => {
      if (!item.enabled) return false;
      if (activeMode !== 'all' && item.mode !== 'all' && item.mode !== activeMode) return false;
      if (item.days.length > 0 && !item.days.includes(currentDay)) return false;
      return true;
    })
    .map((item) => {
      const [hh, mm] = item.time.split(':').map(Number);
      const itemMinutes = hh * 60 + mm;
      return { item, diff: itemMinutes - currentMinutes };
    })
    .filter((c) => c.diff > 0)
    .sort((a, b) => a.diff - b.diff);

  if (candidates.length === 0) return null;
  return {
    item: candidates[0].item,
    minutesRemaining: candidates[0].diff,
  };
}

export function formatMinutesRemaining(minutes: number): string {
  if (minutes < 60) {
    return `Còn ${minutes} phút`;
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `Còn ${h} giờ ${m} phút` : `Còn ${h} giờ`;
}
