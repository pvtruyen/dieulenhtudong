import React, { useEffect, useState } from 'react';
import { X, Upload, Link as LinkIcon, Volume2 } from 'lucide-react';
import { AudioPresetId, AudioSourceType, DayOfWeek, ScheduleItem, ScheduleMode } from '../types/schedule';

interface ScheduleModalProps {
  isOpen: boolean;
  editingItem: ScheduleItem | null;
  onClose: () => void;
  onSave: (item: Omit<ScheduleItem, 'id'>, existingId?: string) => void;
}

const DAY_OPTIONS: Array<{ value: DayOfWeek; label: string }> = [
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
  { value: 0, label: 'CN' },
];

const PRESET_OPTIONS: Array<{ value: AudioPresetId; label: string }> = [
  { value: 'reveille', label: 'Kèn báo thức (Reveille)' },
  { value: 'exercise', label: 'Nhạc hiệu thể dục sáng' },
  { value: 'bell_class', label: 'Kẻng / Chuông lên lớp' },
  { value: 'bell_meal', label: 'Kẻng báo ăn' },
  { value: 'whistle_check', label: 'Còi kiểm tra nội vụ / Điểm danh' },
  { value: 'taps', label: 'Nhạc hiệu tắt đèn đi ngủ' },
];

export const ScheduleModal: React.FC<ScheduleModalProps> = ({
  isOpen,
  editingItem,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [time, setTime] = useState('06:00');
  const [days, setDays] = useState<DayOfWeek[]>([1, 2, 3, 4, 5, 6, 0]);
  const [mode, setMode] = useState<ScheduleMode>('all');
  const [audioType, setAudioType] = useState<AudioSourceType>('preset');
  const [audioPreset, setAudioPreset] = useState<AudioPresetId>('bell_class');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFileName, setAudioFileName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setTime(editingItem.time);
      setDays(editingItem.days);
      setMode(editingItem.mode);
      setAudioType(editingItem.audioType);
      setAudioPreset(editingItem.audioPreset || 'bell_class');
      setAudioUrl(editingItem.audioUrl || '');
      setAudioFileName(editingItem.audioFileName || '');
      setNote(editingItem.note || '');
    } else {
      setName('');
      setTime('06:00');
      setDays([1, 2, 3, 4, 5, 6, 0]);
      setMode('all');
      setAudioType('preset');
      setAudioPreset('bell_class');
      setAudioUrl('');
      setAudioFileName('');
      setNote('');
    }
    setError('');
  }, [editingItem, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (d: DayOfWeek) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError('Tệp âm thanh vượt quá 3MB. Vui lòng chọn tệp nhỏ hơn để lưu trên trình duyệt.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAudioUrl(reader.result);
        setAudioFileName(file.name);
        setError('');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên điều lệnh.');
      return;
    }
    if (!time) {
      setError('Vui lòng chọn thời gian phát.');
      return;
    }
    if (days.length === 0) {
      setError('Vui lòng chọn ít nhất một ngày áp dụng trong tuần.');
      return;
    }
    if (audioType === 'url' && !audioUrl.trim()) {
      setError('Vui lòng nhập đường dẫn URL âm thanh.');
      return;
    }
    if (audioType === 'file' && !audioUrl) {
      setError('Vui lòng tải lên tệp âm thanh MP3/WAV.');
      return;
    }

    onSave(
      {
        name: name.trim(),
        time,
        days,
        mode,
        audioType,
        audioPreset: audioType === 'preset' ? audioPreset : undefined,
        audioUrl: audioType !== 'preset' ? audioUrl.trim() : undefined,
        audioFileName: audioType === 'file' ? audioFileName : undefined,
        enabled: editingItem ? editingItem.enabled : true,
        note: note.trim() || undefined,
      },
      editingItem?.id
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-slate-900">
            {editingItem ? 'Chỉnh sửa điều lệnh' : 'Thêm điều lệnh mới'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="cmd-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Tên điều lệnh / Sinh hoạt
            </label>
            <input
              id="cmd-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ví dụ: Báo thức buổi sáng"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none focus:ring-2 focus:ring-[#2E5A27]/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cmd-time" className="mb-1.5 block text-sm font-medium text-slate-700">
                Thời gian phát (24h)
              </label>
              <input
                id="cmd-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="font-mono-tabular w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none focus:ring-2 focus:ring-[#2E5A27]/20"
              />
            </div>

            <div>
              <label htmlFor="cmd-mode" className="mb-1.5 block text-sm font-medium text-slate-700">
                Chế độ áp dụng
              </label>
              <select
                id="cmd-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ScheduleMode)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none focus:ring-2 focus:ring-[#2E5A27]/20"
              >
                <option value="all">Tất cả các chế độ</option>
                <option value="summer">Chế độ Mùa Hè</option>
                <option value="winter">Chế độ Mùa Đông</option>
                <option value="holiday">Ngày Lễ / Cuối tuần</option>
              </select>
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Ngày áp dụng trong tuần
            </span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_OPTIONS.map((d) => {
                const active = days.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDay(d.value)}
                    aria-pressed={active}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[#2E5A27] bg-[#2E5A27] text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Nguồn âm thanh</span>
            <div className="mb-3 grid grid-cols-3 gap-1.5 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAudioType('preset')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  audioType === 'preset' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Âm thanh mẫu</span>
              </button>
              <button
                type="button"
                onClick={() => setAudioType('url')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  audioType === 'url' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span>Link URL</span>
              </button>
              <button
                type="button"
                onClick={() => setAudioType('file')}
                className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  audioType === 'file' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Tải file lên</span>
              </button>
            </div>

            {audioType === 'preset' && (
              <select
                aria-label="Chọn âm thanh mẫu"
                value={audioPreset}
                onChange={(e) => setAudioPreset(e.target.value as AudioPresetId)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
              >
                {PRESET_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            {audioType === 'url' && (
              <input
                type="url"
                aria-label="Đường dẫn URL âm thanh"
                value={audioUrl}
                onChange={(e) => setAudioUrl(e.target.value)}
                placeholder="https://example.com/am-thanh.mp3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
              />
            )}

            {audioType === 'file' && (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-center">
                <input
                  id="audio-file-upload"
                  type="file"
                  accept="audio/mp3,audio/wav,audio/mpeg,audio/ogg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="audio-file-upload"
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-300 hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Chọn tệp MP3 / WAV (tối đa 3MB)</span>
                </label>
                {audioFileName && (
                  <p className="mt-2 truncate text-xs font-medium text-[#2E5A27]">
                    Đã chọn: {audioFileName}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="cmd-note" className="mb-1.5 block text-sm font-medium text-slate-700">
              Ghi chú (tùy chọn)
            </label>
            <input
              id="cmd-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Tập trung tại sân chào cờ"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#2E5A27] px-4 py-2 text-sm font-medium text-white hover:bg-[#24471e]"
            >
              {editingItem ? 'Lưu thay đổi' : 'Thêm điều lệnh'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
