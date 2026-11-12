import * as XLSX from 'xlsx';
import { DayOfWeek, ScheduleItem, ScheduleMode } from '../types/schedule';

const HEADER_ROW = [
  'Giờ phát (HH:MM)',
  'Tên điều lệnh',
  'Số hồi',
  'Âm thanh mẫu',
  'Chế độ (all/summer/winter/holiday)',
  'Ngày áp dụng (T2-CN)',
  'Trạng thái (Bật/Tắt)',
  'Ghi chú',
];

function formatDaysForExcel(days: DayOfWeek[]): string {
  const map: Record<DayOfWeek, string> = {
    1: 'T2',
    2: 'T3',
    3: 'T4',
    4: 'T5',
    5: 'T6',
    6: 'T7',
    0: 'CN',
  };
  const order: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
  return order
    .filter((d) => days.includes(d))
    .map((d) => map[d])
    .join(',');
}

function parseDaysFromExcel(val: unknown): DayOfWeek[] {
  const str = String(val ?? '').toUpperCase();
  if (!str.trim()) return [1, 2, 3, 4, 5, 6, 0];
  const result: DayOfWeek[] = [];
  if (str.includes('T2') || str.includes('2')) result.push(1);
  if (str.includes('T3') || str.includes('3')) result.push(2);
  if (str.includes('T4') || str.includes('4')) result.push(3);
  if (str.includes('T5') || str.includes('5')) result.push(4);
  if (str.includes('T6') || str.includes('6')) result.push(5);
  if (str.includes('T7') || str.includes('7')) result.push(6);
  if (str.includes('CN') || str.includes('0')) result.push(0);
  return result.length > 0 ? result : [1, 2, 3, 4, 5, 6, 0];
}

export function exportSchedulesToExcel(schedules: ScheduleItem[]): void {
  const rows = schedules.map((item) => [
    item.time,
    item.name,
    item.repeatCount || 1,
    item.audioPreset || 'tap_hop',
    item.mode,
    formatDaysForExcel(item.days),
    item.enabled ? 'Bật' : 'Tắt',
    item.note || '',
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([HEADER_ROW, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'LichDieuLenh');
  XLSX.writeFile(workbook, 'lich-dieu-lenh-gdqp-an.xlsx');
}

export async function parseSchedulesFromExcel(file: File): Promise<ScheduleItem[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: '',
  });

  // Only skip row 1 (index 0) header; process every subsequent row
  const dataRows = allRows.slice(1);
  const items: ScheduleItem[] = [];

  dataRows.forEach((row, idx) => {
    const timeRaw = String(row[0] ?? '').trim();
    const nameRaw = String(row[1] ?? '').trim();
    if (!timeRaw && !nameRaw) return;

    const repeatNum = Number(row[2]);
    const presetRaw = String(row[3] ?? '').trim() || 'tap_hop';
    const modeRaw = String(row[4] ?? '').trim().toLowerCase();
    const mode: ScheduleMode =
      modeRaw === 'summer' || modeRaw === 'winter' || modeRaw === 'holiday'
        ? modeRaw
        : 'all';
    const days = parseDaysFromExcel(row[5]);
    const statusRaw = String(row[6] ?? '').trim().toLowerCase();
    const enabled = statusRaw !== 'tắt' && statusRaw !== 'false' && statusRaw !== '0';
    const note = String(row[7] ?? '').trim();

    items.push({
      id: `excel-${Date.now()}-${idx}`,
      time: timeRaw || '06:00',
      name: nameRaw || `Điều lệnh ${idx + 1}`,
      repeatCount: Number.isFinite(repeatNum) && repeatNum >= 1 ? repeatNum : 1,
      audioType: 'preset',
      audioPreset: presetRaw,
      mode,
      days,
      enabled,
      note: note || undefined,
    });
  });

  return items;
}
