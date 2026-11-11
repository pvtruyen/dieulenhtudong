import { ADMIN_EMAIL } from '../firebase';
import { UserProfile } from '../types/user';

export function isUserAdmin(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return profile.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() || profile.role === 'admin';
}

export function hasActiveAccess(profile: UserProfile | null, now: Date = new Date()): boolean {
  if (!profile) return false;
  if (isUserAdmin(profile)) return true;

  if (profile.plan === 'annual') {
    if (!profile.subscriptionEndsAt) return true;
    return new Date(profile.subscriptionEndsAt).getTime() > now.getTime();
  }

  if (profile.plan === 'trial') {
    return new Date(profile.trialEndsAt).getTime() > now.getTime();
  }

  return false;
}

export function getRemainingDays(profile: UserProfile | null, now: Date = new Date()): number {
  if (!profile) return 0;
  if (isUserAdmin(profile)) return 9999;

  const targetDateStr =
    profile.plan === 'annual' ? profile.subscriptionEndsAt : profile.trialEndsAt;
  if (!targetDateStr) return 0;

  const diffMs = new Date(targetDateStr).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}
