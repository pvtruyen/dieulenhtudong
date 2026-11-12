import React from 'react';
import { Play, Pencil, Trash2, Volume2 } from 'lucide-react';
import { DayOfWeek, ScheduleItem, ScheduleMode } from '../types/schedule';

interface ScheduleTableProps {
  schedules: ScheduleItem[];
  playingId: string | null;
  isAdmin: boolean;
  onToggle: (id: string) => void;
  onTestPlay: (item: ScheduleItem) => void;
  onEdit: (item: ScheduleItem) => void;
  onDelete: (id: string) => void;
  onAddNew: () => void;
}

const MODE_LABELS: Record<ScheduleMode, string> = {
  all: 'Mọi chế độ',
  summer: 'Mùa Hè',
  winter: 'Mùa Đông',
  holiday: 'Ngày Lễ / Cuối tuần',
};

const DAY_NAMES: Record<DayOfWeek, string> = {
  1: 'T2',
  2: 'T3',
  3: 'T4',
  4: 'T5',
  5: 'T6',
  6: 'T7',
  0: 'CN',
};

function formatDays(days: DayOfWeek[]): string {
  if (days.length === 7) return 'Hàng ngày (T2 - CN)';
  const order: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
  return order
    .filter((d) => days.includes(d))
    .map((d) => DAY_NAMES[d])
    .join(', ');
}

export const ScheduleTable: React.FC<ScheduleTableProps> = ({
  schedules,
  playingId,
  isAdmin,
  onToggle,
  onTestPlay,
  onEdit,
  onDelete,
  onAddNew,
}) => {
  if (schedules.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <p className="text-base font-medium text-slate-900">Không tìm thấy kịch bản điều lệnh nào</p>
        <p className="mt-1 text-sm text-slate-500">
          Thử thay đổi bộ lọc chế độ hoặc thêm một điều lệnh mới vào thời gian biểu.
        </p>
        {isAdmin && (
          <button
            type="button"
            onClick={onAddNew}
            className="mt-4 inline-flex items-center rounded-lg bg-[#2E5A27] px-4 py-2 text-sm font-medium text-white hover:bg-[#24471e]"
          >
            Thêm điều lệnh mới
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-4 py-3">Giờ phát</th>
              <th className="px-4 py-3">Tên điều lệnh & Ghi chú</th>
              <th className="hidden px-4 py-3 md:table-cell">Lịch áp dụng</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm">
            {schedules.map((item) => {
              const isPlaying = playingId === item.id;
              return (
                <tr
                  key={item.id}
                  className={`transition-colors hover:bg-slate-50 ${
                    !item.enabled ? 'opacity-60' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <span className="font-mono-tabular text-base font-bold text-slate-900">
                      {item.time}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {item.note ? `${item.note} · ` : ''}
                      {MODE_LABELS[item.mode]}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 text-xs text-slate-600 md:table-cell">
                    {formatDays(item.days)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.enabled}
                      disabled={!isAdmin}
                      aria-label={`Bật hoặc tắt ${item.name}`}
                      onClick={() => isAdmin && onToggle(item.id)}
                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#2E5A27] focus:ring-offset-2 ${
                        isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'
                      } ${
                        item.enabled ? 'bg-[#2E5A27]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                          item.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onTestPlay(item)}
                        aria-label={`Phát thử ${item.name}`}
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          isPlaying
                            ? 'border-[#2E5A27] bg-[#2E5A27] text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {isPlaying ? (
                          <Volume2 className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {isPlaying ? 'Đang phát' : 'Phát thử'}
                        </span>
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(item)}
                            aria-label={`Sửa ${item.name}`}
                            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(item.id)}
                            aria-label={`Xóa ${item.name}`}
                            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
