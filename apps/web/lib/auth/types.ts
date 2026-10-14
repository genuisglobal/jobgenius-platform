/**
 * Authentication Types
 */

export type UserType = "am" | "job_seeker";

export interface AuthUser {
  id: string;
  email: string;
  userType: UserType;
  name?: string;
  role?: string; // For internal staff: 'am', 'ops_manager', 'accountant', 'admin', 'superadmin'
  status?: string; // For AMs: 'pending', 'approved', 'rejected'
  amCode?: string; // For AMs: unique code for extension login
}

export interface AccountManager {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  am_code: string | null;
  auth_id: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface JobSeeker {
  id: string;
  email: string;
  full_name: string | null;
  auth_id: string | null;
  status: string;
  created_at: string;
  last_login_at: string | null;
}

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  session?: Session;
  error?: string;
}

export interface SignUpData {
  email: string;
  password: string;
  name?: string;
  userType: UserType;
  inviteToken?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface PasswordResetData {
  email: string;
  userType: UserType;
}

export interface PasswordUpdateData {
  token: string;
  newPassword: string;
}
