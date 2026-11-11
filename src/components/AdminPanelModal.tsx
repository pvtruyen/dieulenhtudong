import React from 'react';
import { X, ShieldCheck, Crown, Clock, Ban, Mail } from 'lucide-react';
import { RegistrationNotification, SubscriptionPlan, UserProfile } from '../types/user';
import { ADMIN_EMAIL } from '../firebase';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  notifications: RegistrationNotification[];
  onUpdatePlan: (uid: string, plan: SubscriptionPlan) => void;
  onMarkAllRead: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  users,
  notifications,
  onUpdatePlan,
  onMarkAllRead,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-modal-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#2E5A27]" />
            <h2 id="admin-modal-title" className="text-lg font-semibold text-slate-900">
              Quản trị Thành viên & Gói dịch vụ
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bảng quản trị"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {notifications.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-amber-900">
                  Thông báo đăng ký mới ({unreadCount} chưa đọc)
                </p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="text-xs font-medium text-[#2E5A27] hover:underline"
                  >
                    Đánh dấu đã đọc
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
                {notifications.slice(0, 5).map((n) => (
                  <li key={n.id} className="flex items-center justify-between">
                    <span>
                      <strong>{n.displayName || n.email}</strong> ({n.email}) vừa đăng ký tài khoản
                    </span>
                    <a
                      href={`mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(
                        `[GDQP-AN] Thành viên mới đăng ký: ${n.email}`
                      )}&body=${encodeURIComponent(
                        `Tài khoản ${n.displayName} (${n.email}) đã đăng ký sử dụng Hệ thống Điều lệnh GDQP-AN.`
                      )}`}
                      className="inline-flex items-center gap-1 font-medium text-[#2E5A27] hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      <span>Gửi email lưu trữ</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">Thành viên</th>
                  <th className="px-4 py-3">Gói hiện tại</th>
                  <th className="px-4 py-3 text-right">Cấp quyền sử dụng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((u) => {
                  const isAdminAccount = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                  return (
                    <tr key={u.uid} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {u.displayName || 'Người dùng'}
                        </div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium">
                        {isAdminAccount ? (
                          <span className="text-[#2E5A27]">Quản trị viên (Full quyền)</span>
                        ) : u.plan === 'annual' ? (
                          <span className="text-[#2E5A27]">Gói Năm (Full quyền)</span>
                        ) : u.plan === 'trial' ? (
                          <span className="text-amber-700">Dùng thử 1 tháng</span>
                        ) : (
                          <span className="text-red-600">Hết hạn / Khóa</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!isAdminAccount && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onUpdatePlan(u.uid, 'annual')}
                              className="inline-flex items-center gap-1 rounded-md border border-[#2E5A27] bg-[#2E5A27]/10 px-2.5 py-1 text-xs font-medium text-[#2E5A27] hover:bg-[#2E5A27]/20"
                            >
                              <Crown className="h-3 w-3" />
                              <span>Cấp 1 năm</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdatePlan(u.uid, 'trial')}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Clock className="h-3 w-3" />
                              <span>Dùng thử</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onUpdatePlan(u.uid, 'expired')}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                            >
                              <Ban className="h-3 w-3" />
                              <span>Khóa</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
