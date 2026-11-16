/**
 * src/config/appConfig.ts
 * Master configuration for "سوق المستلزمات الطبية" (Iraq)
 */

export interface AppConfig {
  appName: string;
  currency: 'IQD';
  nearExpiryWarningDays: number;
  defaultReorderLevel: number;
  allowNegativeStock: boolean;
  sessionTimeoutMinutes: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  timezone: string;
  dateFormat: string;
}

export const APP_CONFIG: AppConfig = {
  appName: 'سوق المستلزمات الطبية',
  currency: 'IQD',
  nearExpiryWarningDays: 90,
  defaultReorderLevel: 20,
  allowNegativeStock: false,
  sessionTimeoutMinutes: 30,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  timezone: 'Asia/Baghdad',
  dateFormat: 'dd/mm/yyyy',
};
