import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Plus,
  RotateCcw,
  Search,
  Volume2,
  VolumeX,
  Square,
  LogIn,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch,
  addDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider, ADMIN_EMAIL, testFirestoreConnection } from './firebase';
import { DEFAULT_SCHEDULES } from './data/defaultSchedules';
import { ScheduleItem, ScheduleMode, SystemAudioStatus } from './types/schedule';
import { RegistrationNotification, SubscriptionPlan, UserProfile } from './types/user';
import { isUserAdmin } from './utils/subscription';
import {
  buildTriggerKey,
  filterSchedules,
  formatDateVN,
  formatMinutesRemaining,
  formatTimeHHMMSS,
  getNextSchedule,
  shouldTriggerSchedule,
} from './utils/scheduleEngine';
import {
  isAudioUnlocked,
  playScheduleAudio,
  startEmergencyAlarm,
  stopAllAudio,
  unlockAudioContext,
} from './utils/audioEngine';
import { ScheduleTable } from './components/ScheduleTable';
import { ScheduleModal } from './components/ScheduleModal';
import { AdminPanelModal } from './components/AdminPanelModal';

const STORAGE_KEY_SCHEDULES = 'gdqp_schedules_v1';
const STORAGE_KEY_MODE = 'gdqp_mode_v1';

const MODE_TABS: Array<{ id: ScheduleMode; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'summer', label: 'Chế độ Mùa Hè' },
  { id: 'winter', label: 'Chế độ Mùa Đông' },
  { id: 'holiday', label: 'Ngày Lễ / Cuối tuần' },
];

export default function App() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SCHEDULES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_SCHEDULES;
  });

  const [activeMode, setActiveMode] = useState<ScheduleMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_MODE) as ScheduleMode | null;
    return saved || 'all';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [now, setNow] = useState<Date>(() => new Date());
  const [audioStatus, setAudioStatus] = useState<SystemAudioStatus>(() =>
    isAudioUnlocked() ? 'ready' : 'locked'
  );
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<RegistrationNotification[]>([]);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    testFirestoreConnection();
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserProfile(null);
        setAdminUsers([]);
        setNotifications([]);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        const nowIso = new Date().toISOString();
        const trialEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const isDefaultAdmin =
          (firebaseUser.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase();
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Người dùng',
          role: isDefaultAdmin ? 'admin' : 'user',
          plan: isDefaultAdmin ? 'annual' : 'trial',
          trialEndsAt: trialEnd,
          createdAt: nowIso,
        };
        await setDoc(userRef, newProfile);
        setUserProfile(newProfile);

        // Notify admin of new registration
        if (!isDefaultAdmin) {
          await addDoc(collection(db, 'notifications'), {
            userId: firebaseUser.uid,
            email: newProfile.email,
            displayName: newProfile.displayName,
            read: false,
            createdAt: nowIso,
          });
        }
      } else {
        setUserProfile(snap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, []);

  // Sync user's schedules from Firestore when signed in
  useEffect(() => {
    if (!user) return;
    const schedCol = collection(db, 'users', user.uid, 'schedules');
    const unsub = onSnapshot(schedCol, (snapshot) => {
      if (!snapshot.empty) {
        const cloudItems = snapshot.docs.map((d) => d.data() as ScheduleItem);
        setSchedules(cloudItems);
      }
    });
    return () => unsub();
  }, [user]);

  // Admin listeners for users and registration notifications
  useEffect(() => {
    if (!isUserAdmin(userProfile)) return;
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setAdminUsers(snap.docs.map((d) => d.data() as UserProfile));
    });
    const unsubNotifs = onSnapshot(collection(db, 'notifications'), (snap) => {
      setNotifications(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RegistrationNotification, 'id'>) }))
      );
    });
    return () => {
      unsubUsers();
      unsubNotifs();
    };
  }, [userProfile]);

  const lastTriggeredKeyRef = useRef<string | null>(null);
  const schedulesRef = useRef(schedules);
  const activeModeRef = useRef(activeMode);
  const audioStatusRef = useRef(audioStatus);

  useEffect(() => {
    schedulesRef.current = schedules;
    localStorage.setItem(STORAGE_KEY_SCHEDULES, JSON.stringify(schedules));
  }, [schedules]);

  useEffect(() => {
    activeModeRef.current = activeMode;
    localStorage.setItem(STORAGE_KEY_MODE, activeMode);
  }, [activeMode]);

  useEffect(() => {
    audioStatusRef.current = audioStatus;
  }, [audioStatus]);

  // Real-time 1-second clock and schedule checker
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = new Date();
      setNow(current);

      if (audioStatusRef.current === 'emergency') return;

      for (const item of schedulesRef.current) {
        if (
          shouldTriggerSchedule(
            item,
            current,
            activeModeRef.current,
            lastTriggeredKeyRef.current
          )
        ) {
          lastTriggeredKeyRef.current = buildTriggerKey(item.id, current);
          setPlayingId(item.id);
          setAudioStatus('playing');
          playScheduleAudio(item, () => {
            setPlayingId(null);
            setAudioStatus(isAudioUnlocked() ? 'ready' : 'locked');
          });
          break;
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const handleUnlockAudio = async () => {
    const ok = await unlockAudioContext();
    if (ok) {
      setAudioStatus('ready');
    }
  };

  const handleEmergencyToggle = async () => {
    if (audioStatus === 'emergency') {
      stopAllAudio();
      setPlayingId(null);
      setAudioStatus(isAudioUnlocked() ? 'ready' : 'locked');
      return;
    }
    await unlockAudioContext();
    setPlayingId(null);
    setAudioStatus('emergency');
    startEmergencyAlarm();
  };

  const handleTestPlay = async (item: ScheduleItem) => {
    if (audioStatus === 'emergency') return;
    if (playingId === item.id) {
      stopAllAudio();
      setPlayingId(null);
      setAudioStatus(isAudioUnlocked() ? 'ready' : 'locked');
      return;
    }
    await unlockAudioContext();
    setPlayingId(item.id);
    setAudioStatus('playing');
    playScheduleAudio(item, () => {
      setPlayingId(null);
      setAudioStatus(isAudioUnlocked() ? 'ready' : 'locked');
    });
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Không thể đăng nhập Google.');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const syncScheduleToCloud = async (item: ScheduleItem) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid, 'schedules', item.id), item);
  };

  const handleToggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, enabled: !item.enabled };
          syncScheduleToCloud(updated);
          return updated;
        }
        return item;
      })
    );
  };

  const handleDeleteSchedule = async (id: string) => {
    if (playingId === id) {
      stopAllAudio();
      setPlayingId(null);
      setAudioStatus(isAudioUnlocked() ? 'ready' : 'locked');
    }
    setSchedules((prev) => prev.filter((item) => item.id !== id));
    if (user) {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', user.uid, 'schedules', id));
    }
  };

  const handleSaveSchedule = (data: Omit<ScheduleItem, 'id'>, existingId?: string) => {
    if (existingId) {
      const updatedItem: ScheduleItem = { ...data, id: existingId };
      setSchedules((prev) =>
        prev.map((item) => (item.id === existingId ? updatedItem : item))
      );
      syncScheduleToCloud(updatedItem);
    } else {
      const newItem: ScheduleItem = {
        ...data,
        id: `cmd-${Date.now()}`,
      };
      setSchedules((prev) => [...prev, newItem]);
      syncScheduleToCloud(newItem);
    }
  };

  const handleUpdateUserPlan = async (uid: string, plan: SubscriptionPlan) => {
    const updates: Partial<UserProfile> = { plan };
    if (plan === 'annual') {
      updates.subscriptionEndsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    } else if (plan === 'trial') {
      updates.trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    await updateDoc(doc(db, 'users', uid), updates);
  };

  const handleMarkAllRead = async () => {
    const batch = writeBatch(db);
    notifications.filter((n) => !n.read).forEach((n) => {
      batch.update(doc(db, 'notifications', n.id), { read: true });
    });
    await batch.commit();
  };

  const handleResetDefaults = () => {
    stopAllAudio();
    setPlayingId(null);
    setSchedules(DEFAULT_SCHEDULES);
    setActiveMode('all');
    setSearchQuery('');
  };

  const filteredSchedules = useMemo(
    () => filterSchedules(schedules, activeMode, searchQuery),
    [schedules, activeMode, searchQuery]
  );

  const nextSchedule = useMemo(
    () => getNextSchedule(schedules, now, activeMode),
    [schedules, now, activeMode]
  );

  const statusText =
    audioStatus === 'emergency'
      ? 'ĐANG BÁO ĐỘNG KHẨN CẤP'
      : audioStatus === 'playing'
      ? 'Đang phát điều lệnh'
      : audioStatus === 'ready'
      ? 'Sẵn sàng phát tự động'
      : 'Chờ kích hoạt âm thanh';

  return (
    <div className="min-h-screen bg-[#f4f6f4] text-slate-900">
      {/* 3-Zone Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            className="whitespace-nowrap shrink-0 text-base font-bold tracking-tight text-[#2E5A27] sm:text-lg"
          >
            Trung tâm Điều lệnh GDQP-AN
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#dong-ho" className="whitespace-nowrap shrink-0 hover:text-slate-900">
              Đồng hồ
            </a>
            <a href="#kich-ban" className="whitespace-nowrap shrink-0 hover:text-slate-900">
              Kịch bản
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {isUserAdmin(userProfile) && (
              <button
                type="button"
                onClick={() => setIsAdminOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#2E5A27] bg-[#2E5A27]/10 px-3 py-2 text-xs font-semibold text-[#2E5A27] hover:bg-[#2E5A27]/20"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Quản trị</span>
              </button>
            )}
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                title={user.email || ''}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Đăng nhập Google</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg bg-[#2E5A27] px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#24471e] sm:text-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm điều lệnh</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* Emergency Banner if active */}
        {audioStatus === 'emergency' && (
          <div
            role="alert"
            className="flex flex-col items-start justify-between gap-4 rounded-xl border border-red-300 bg-[#D9534F] px-5 py-4 text-white sm:flex-row sm:items-center"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <div>
                <p className="text-base font-bold">BÁO ĐỘNG KHẨN CẤP ĐANG KÍCH HOẠT</p>
                <p className="text-sm text-red-50">
                  Còi báo động ưu tiên cao nhất đang phát liên tục trên toàn đơn vị.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleEmergencyToggle}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#D9534F] hover:bg-red-50"
            >
              <Square className="h-4 w-4 fill-current" />
              <span>Dừng báo động</span>
            </button>
          </div>
        )}

        {/* Real-time Clock & System Control Panel */}
        <section
          id="dong-ho"
          className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 lg:grid-cols-12 lg:items-center"
        >
          <div className="lg:col-span-5">
            <p className="text-xs font-semibold text-slate-500">{formatDateVN(now)}</p>
            <div
              data-testid="realtime-clock"
              className="font-mono-tabular mt-1 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl"
            >
              {formatTimeHHMMSS(now)}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Trạng thái:{' '}
              <span
                className={`font-semibold ${
                  audioStatus === 'emergency'
                    ? 'text-[#D9534F]'
                    : audioStatus === 'ready' || audioStatus === 'playing'
                    ? 'text-[#2E5A27]'
                    : 'text-amber-700'
                }`}
              >
                {statusText}
              </span>
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 lg:col-span-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <p className="text-xs font-semibold text-slate-500">Điều lệnh sắp tới</p>
            {nextSchedule ? (
              <div className="mt-1">
                <p className="text-base font-semibold text-slate-900">
                  <span className="font-mono-tabular mr-2 text-[#2E5A27]">
                    {nextSchedule.item.time}
                  </span>
                  {nextSchedule.item.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatMinutesRemaining(nextSchedule.minutesRemaining)}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Không còn điều lệnh nào trong ngày hôm nay.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-slate-200 pt-4 sm:flex-row lg:col-span-3 lg:flex-col lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <button
              type="button"
              onClick={handleUnlockAudio}
              className={`inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors ${
                audioStatus === 'locked'
                  ? 'border-[#2E5A27] bg-[#2E5A27]/10 text-[#2E5A27] hover:bg-[#2E5A27]/20'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {audioStatus === 'locked' ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4 text-[#2E5A27]" />
              )}
              <span>
                {audioStatus === 'locked'
                  ? 'Kích hoạt âm thanh trình duyệt'
                  : 'Âm thanh đã sẵn sàng'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleEmergencyToggle}
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold text-white transition-colors ${
                audioStatus === 'emergency'
                  ? 'bg-slate-900 hover:bg-slate-800'
                  : 'bg-[#D9534F] hover:bg-[#c9302c]'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
              <span>
                {audioStatus === 'emergency' ? 'DỪNG BÁO ĐỘNG' : 'BÁO ĐỘNG KHẨN CẤP'}
              </span>
            </button>
          </div>
        </section>

        {/* Filter Bar & Schedule Table */}
        <section id="kich-ban" className="space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div
              className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1"
              role="tablist"
              aria-label="Lọc theo chế độ"
            >
              {MODE_TABS.map((tab) => {
                const active = activeMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveMode(tab.id)}
                    className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  aria-label="Tìm kiếm điều lệnh"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm điều lệnh..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleResetDefaults}
                title="Khôi phục dữ liệu mẫu mặc định"
                aria-label="Khôi phục mặc định"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mặc định</span>
              </button>
            </div>
          </div>

          <ScheduleTable
            schedules={filteredSchedules}
            playingId={playingId}
            onToggle={handleToggleSchedule}
            onTestPlay={handleTestPlay}
            onEdit={(item) => {
              setEditingItem(item);
              setIsModalOpen(true);
            }}
            onDelete={handleDeleteSchedule}
            onAddNew={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
          />
        </section>
      </main>

      <ScheduleModal
        isOpen={isModalOpen}
        editingItem={editingItem}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveSchedule}
      />

      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        users={adminUsers}
        notifications={notifications}
        onUpdatePlan={handleUpdateUserPlan}
        onMarkAllRead={handleMarkAllRead}
      />
    </div>
  );
}
