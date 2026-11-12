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
  Settings,
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
import { CustomAudioPreset, ScheduleItem, ScheduleMode, SystemAudioStatus } from './types/schedule';
import { RegistrationNotification, SubscriptionPlan, UserProfile } from './types/user';
import { isUserAdmin } from './utils/subscription';
import {
  buildTriggerKey,
  filterSchedules,
  formatDateVN,
  formatMinutesRemaining,
  formatTimeHHMMSS,
  getDateInTimezone,
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
  const [emergencyAudioUrl, setEmergencyAudioUrl] = useState<string>(() => {
    return localStorage.getItem('gdqp_emergency_audio_v1') || '';
  });
  const [isEmergencyConfigOpen, setIsEmergencyConfigOpen] = useState(false);
  const [timezone, setTimezone] = useState<string>(() => {
    return localStorage.getItem('gdqp_timezone_v1') || 'Asia/Ho_Chi_Minh';
  });
  const [customPresets, setCustomPresets] = useState<CustomAudioPreset[]>(() => {
    try {
      const saved = localStorage.getItem('gdqp_custom_presets_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isPresetsModalOpen, setIsPresetsModalOpen] = useState(false);
  const [newPresetLabel, setNewPresetLabel] = useState('');
  const [newPresetUrl, setNewPresetUrl] = useState('');
  const [presetOverrides, setPresetOverrides] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('gdqp_preset_overrides_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [localSession, setLocalSession] = useState<{ username: string; isAdmin: boolean } | null>(
    () => {
      try {
        const saved = localStorage.getItem('gdqp_local_session_v1');
        return saved ? JSON.parse(saved) : null;
      } catch {
        return null;
      }
    }
  );

  const accountId = user
    ? user.uid
    : localSession
    ? `local_${localSession.username.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`
    : null;

  const isAdmin = isUserAdmin(userProfile) || Boolean(localSession?.isAdmin);

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

  // Sync user's schedules, presets, and audio settings from Firestore when signed in
  useEffect(() => {
    if (!accountId) return;
    const schedCol = collection(db, 'users', accountId, 'schedules');
    const unsubSched = onSnapshot(schedCol, (snapshot) => {
      if (!snapshot.empty) {
        const cloudItems = snapshot.docs.map((d) => d.data() as ScheduleItem);
        setSchedules(cloudItems);
      }
    });

    const presetsCol = collection(db, 'users', accountId, 'presets');
    const unsubPresets = onSnapshot(presetsCol, (snapshot) => {
      const cloudCustom: CustomAudioPreset[] = [];
      const cloudOverrides: Record<string, string> = {};
      snapshot.docs.forEach((d) => {
        const data = d.data() as CustomAudioPreset;
        if (['bao_thuc', 'tap_hop', 'bao_an', 'tat_den'].includes(data.id)) {
          cloudOverrides[data.id] = data.url;
        } else {
          cloudCustom.push(data);
        }
      });
      if (cloudCustom.length > 0) {
        setCustomPresets(cloudCustom);
        localStorage.setItem('gdqp_custom_presets_v1', JSON.stringify(cloudCustom));
      }
      if (Object.keys(cloudOverrides).length > 0) {
        setPresetOverrides(cloudOverrides);
        localStorage.setItem('gdqp_preset_overrides_v1', JSON.stringify(cloudOverrides));
      }
    });

    const settingsDoc = doc(db, 'users', accountId, 'settings', 'audio');
    const unsubSettings = onSnapshot(settingsDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as {
          presetOverrides?: Record<string, string>;
          emergencyAudioUrl?: string;
          timezone?: string;
        };
        if (data.presetOverrides) {
          setPresetOverrides(data.presetOverrides);
          localStorage.setItem('gdqp_preset_overrides_v1', JSON.stringify(data.presetOverrides));
        }
        if (typeof data.emergencyAudioUrl === 'string') {
          setEmergencyAudioUrl(data.emergencyAudioUrl);
          localStorage.setItem('gdqp_emergency_audio_v1', data.emergencyAudioUrl);
        }
        if (data.timezone) {
          setTimezone(data.timezone);
          localStorage.setItem('gdqp_timezone_v1', data.timezone);
        }
      }
    });

    return () => {
      unsubSched();
      unsubPresets();
      unsubSettings();
    };
  }, [accountId]);

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
      const current = getDateInTimezone(new Date(), timezone);
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
  }, [timezone]);

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
    startEmergencyAlarm(emergencyAudioUrl);
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
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập Google.';
      if (msg.includes('auth/unauthorized-domain')) {
        setAuthError(
          `Tên miền hiện tại (${window.location.hostname}) chưa được cấp phép trong Firebase. Vào Firebase Console → Authentication → Settings → Authorized domains và thêm "${window.location.hostname}".`
        );
      } else {
        setAuthError(msg);
      }
    }
  };

  const handleSignOut = async () => {
    if (user) {
      await signOut(auth);
    }
    setLocalSession(null);
    localStorage.removeItem('gdqp_local_session_v1');
  };

  const handleLocalLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const u = loginUsername.trim();
    const p = loginPassword.trim();
    if (!u || !p) {
      setAuthError('Vui lòng nhập tên đăng nhập và mật khẩu.');
      return;
    }
    const isAdminCreds = (u === 'admin' || u === ADMIN_EMAIL) && p === 'admin123';
    const session = { username: u, isAdmin: isAdminCreds };
    setLocalSession(session);
    localStorage.setItem('gdqp_local_session_v1', JSON.stringify(session));
    setIsLoginModalOpen(false);
    setLoginUsername('');
    setLoginPassword('');
    setAuthError('');
  };

  const syncAudioSettingsToCloud = async (
    overrides: Record<string, string>,
    emergencyUrl: string,
    tz: string
  ) => {
    if (!accountId) return;
    await setDoc(doc(db, 'users', accountId, 'settings', 'audio'), {
      presetOverrides: overrides,
      emergencyAudioUrl: emergencyUrl,
      timezone: tz,
    });
  };

  const syncScheduleToCloud = async (item: ScheduleItem) => {
    if (!accountId) return;
    await setDoc(doc(db, 'users', accountId, 'schedules', item.id), item);
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
    if (accountId) {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'users', accountId, 'schedules', id));
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
            {(isUserAdmin(userProfile) || localSession?.isAdmin) && (
              <button
                type="button"
                onClick={() => setIsAdminOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-[#2E5A27] bg-[#2E5A27]/10 px-3 py-2 text-xs font-semibold text-[#2E5A27] hover:bg-[#2E5A27]/20"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Quản trị</span>
              </button>
            )}
            {user || localSession ? (
              <button
                type="button"
                onClick={handleSignOut}
                title={user?.email || localSession?.username || ''}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsLoginModalOpen(true)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Đăng nhập</span>
              </button>
            )}
            {isAdmin && (
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
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {authError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError('')}
              className="shrink-0 text-xs font-semibold underline"
            >
              Đóng
            </button>
          </div>
        )}
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
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500">{formatDateVN(now)}</p>
              <select
                aria-label="Chọn múi giờ"
                value={timezone}
                onChange={(e) => {
                  const tz = e.target.value;
                  setTimezone(tz);
                  localStorage.setItem('gdqp_timezone_v1', tz);
                  setNow(getDateInTimezone(new Date(), tz));
                }}
                className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600 focus:border-[#2E5A27] focus:outline-none"
              >
                <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
                <option value="local">Giờ thiết bị</option>
                <option value="Asia/Tokyo">Tokyo (UTC+9)</option>
                <option value="UTC">UTC (UTC+0)</option>
                <option value="Europe/London">London</option>
                <option value="America/New_York">New York</option>
              </select>
            </div>
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

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleEmergencyToggle}
                className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-bold text-white transition-colors ${
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
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsEmergencyConfigOpen(true)}
                  title="Tùy chỉnh âm thanh báo động khẩn cấp"
                  aria-label="Tùy chỉnh âm thanh báo động khẩn cấp"
                  className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  <Settings className="h-4 w-4" />
                </button>
              )}
            </div>
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
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => setIsPresetsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Volume2 className="h-3.5 w-3.5 text-[#2E5A27]" />
                    <span>Âm thanh mẫu</span>
                  </button>
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
                </>
              )}
            </div>
          </div>

          <ScheduleTable
            schedules={filteredSchedules}
            playingId={playingId}
            isAdmin={isAdmin}
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
        customPresets={customPresets}
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

      {isEmergencyConfigOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emergency-config-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="emergency-config-title" className="text-base font-semibold text-slate-900">
              Tùy chỉnh âm thanh Báo động khẩn cấp
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Nhập link MP3/WAV hoặc tải tệp âm thanh từ máy. Để trống để dùng còi báo động mặc định.
            </p>
            <div className="mt-4 space-y-3">
              <input
                type="url"
                aria-label="Link URL âm thanh báo động"
                value={emergencyAudioUrl.startsWith('data:') ? '' : emergencyAudioUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmergencyAudioUrl(val);
                  localStorage.setItem('gdqp_emergency_audio_v1', val);
                }}
                placeholder="https://example.com/coi-bao-dong.mp3"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#D9534F] focus:outline-none"
              />
              <div>
                <input
                  id="emergency-file-upload"
                  type="file"
                  accept="audio/mp3,audio/wav,audio/mpeg,audio/ogg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file || file.size > 3 * 1024 * 1024) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setEmergencyAudioUrl(reader.result);
                        localStorage.setItem('gdqp_emergency_audio_v1', reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="emergency-file-upload"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Tải tệp MP3 / WAV từ máy
                </label>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  setEmergencyAudioUrl('');
                  localStorage.removeItem('gdqp_emergency_audio_v1');
                }}
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Khôi phục còi mặc định
              </button>
              <button
                type="button"
                onClick={() => setIsEmergencyConfigOpen(false)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
      {isPresetsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="presets-modal-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="presets-modal-title" className="text-base font-semibold text-slate-900">
              Quản lý Nguồn âm thanh mẫu
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Tùy chỉnh 04 âm thanh mẫu sẵn có hoặc thêm âm thanh mẫu mới (MP3/WAV).
            </p>

            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">04 Âm thanh mẫu sẵn có</p>
              {(
                [
                  { id: 'bao_thuc', label: '1. Nhạc hiệu Báo thức' },
                  { id: 'tap_hop', label: '2. Nhạc hiệu Tập hợp / Lên lớp / Điểm danh' },
                  { id: 'bao_an', label: '3. Nhạc hiệu Báo ăn' },
                  { id: 'tat_den', label: '4. Nhạc hiệu Tắt đèn đi ngủ' },
                  { id: 'chuong_reo', label: '5. Chuông reo (Vào học / Giải lao / Nghỉ)' },
                  { id: 'canh_bao', label: '6. Còi cảnh báo' },
                ] as const
              ).map((item) => {
                const hasOverride = Boolean(presetOverrides[item.id]);
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-800">{item.label}</p>
                      <p className="text-[11px] text-slate-500">
                        {hasOverride ? 'Đã tùy chỉnh file riêng' : 'Đang dùng mặc định'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <label className="cursor-pointer rounded border border-slate-300 bg-slate-50 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100">
                        <input
                          type="file"
                          accept="audio/mp3,audio/wav,audio/mpeg,audio/ogg"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 700 * 1024) {
                              setAuthError('Tệp âm thanh vượt quá 700KB. Vui lòng chọn tệp nhỏ hơn để lưu lên hệ thống.');
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = async () => {
                              if (typeof reader.result === 'string') {
                                const url = reader.result;
                                const next = { ...presetOverrides, [item.id]: url };
                                setPresetOverrides(next);
                                localStorage.setItem('gdqp_preset_overrides_v1', JSON.stringify(next));
                                if (accountId) {
                                  await setDoc(doc(db, 'users', accountId, 'presets', item.id), {
                                    id: item.id,
                                    label: item.label,
                                    url,
                                  });
                                }
                              }
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                        Đổi file
                      </label>
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={async () => {
                            const next = { ...presetOverrides };
                            delete next[item.id];
                            setPresetOverrides(next);
                            localStorage.setItem('gdqp_preset_overrides_v1', JSON.stringify(next));
                            if (accountId) {
                              const { deleteDoc } = await import('firebase/firestore');
                              await deleteDoc(doc(db, 'users', accountId, 'presets', item.id));
                            }
                          }}
                          className="text-red-600 hover:underline"
                        >
                          Mặc định
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-4 text-xs font-semibold text-slate-700">Thêm âm thanh mẫu khác</p>

            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <input
                type="text"
                value={newPresetLabel}
                onChange={(e) => setNewPresetLabel(e.target.value)}
                placeholder="Tên âm thanh mẫu (VD: Kèn chào cờ)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={newPresetUrl.startsWith('data:') ? '' : newPresetUrl}
                  onChange={(e) => setNewPresetUrl(e.target.value)}
                  placeholder="Link URL MP3/WAV..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#2E5A27] focus:outline-none"
                />
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">
                  <input
                    type="file"
                    accept="audio/mp3,audio/wav,audio/mpeg,audio/ogg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file || file.size > 3 * 1024 * 1024) return;
                      if (!newPresetLabel) setNewPresetLabel(file.name.replace(/\.[^/.]+$/, ''));
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (typeof reader.result === 'string') setNewPresetUrl(reader.result);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  Tải file
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newPresetLabel.trim() || !newPresetUrl.trim()) return;
                    const newPreset: CustomAudioPreset = {
                      id: `custom-${Date.now()}`,
                      label: newPresetLabel.trim(),
                      url: newPresetUrl.trim(),
                    };
                    const next = [...customPresets, newPreset];
                    setCustomPresets(next);
                    localStorage.setItem('gdqp_custom_presets_v1', JSON.stringify(next));
                    setNewPresetLabel('');
                    setNewPresetUrl('');
                    if (accountId) {
                      await setDoc(doc(db, 'users', accountId, 'presets', newPreset.id), newPreset);
                    }
                  }}
                  className="rounded-lg bg-[#2E5A27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#24471e]"
                >
                  Thêm
                </button>
              </div>
            </div>

            <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
              {customPresets.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-3">
                  Chưa có âm thanh mẫu tùy chỉnh nào.
                </p>
              ) : (
                customPresets.map((cp) => (
                  <div
                    key={cp.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <span className="truncate font-medium text-slate-800">{cp.label}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        const next = customPresets.filter((x) => x.id !== cp.id);
                        setCustomPresets(next);
                        localStorage.setItem('gdqp_custom_presets_v1', JSON.stringify(next));
                        if (accountId) {
                          const { deleteDoc } = await import('firebase/firestore');
                          await deleteDoc(doc(db, 'users', accountId, 'presets', cp.id));
                        }
                      }}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Xóa
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => {
                  syncAudioSettingsToCloud(presetOverrides, emergencyAudioUrl, timezone);
                  setIsPresetsModalOpen(false);
                }}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoginModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 id="login-modal-title" className="text-base font-semibold text-slate-900">
              Đăng nhập Hệ thống
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Đăng nhập bằng tài khoản tạm (Admin: <code className="font-mono">admin</code> /{' '}
              <code className="font-mono">admin123</code>) hoặc tài khoản Google.
            </p>
            <form onSubmit={handleLocalLogin} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Tên đăng nhập
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#2E5A27] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Mật khẩu</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#2E5A27] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-[#2E5A27] px-4 py-2 text-sm font-semibold text-white hover:bg-[#24471e]"
              >
                Đăng nhập
              </button>
            </form>

            <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
              <div className="h-px flex-1 bg-slate-200" />
              <span>hoặc</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={() => {
                setIsLoginModalOpen(false);
                handleGoogleSignIn();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <LogIn className="h-4 w-4" />
              <span>Đăng nhập bằng Google</span>
            </button>

            <button
              type="button"
              onClick={() => setIsLoginModalOpen(false)}
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-900"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
