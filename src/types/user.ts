export type UserRole = 'admin' | 'user';
export type SubscriptionPlan = 'trial' | 'annual' | 'expired';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: SubscriptionPlan;
  trialEndsAt: string;
  subscriptionEndsAt?: string;
  createdAt: string;
}

export interface RegistrationNotification {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  read: boolean;
  createdAt: string;
}
