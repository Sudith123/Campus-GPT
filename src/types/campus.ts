export type UserRole = 'student' | 'teacher' | 'admin';
export type SupportedLanguage = 'English' | 'Kannada' | 'Hindi';

export interface AuthUser {
  id: number;
  roleId: number;
  roleName: UserRole;
  fullName: string;
  email: string;
  collegeId: string;
  status: string;
  emailVerified: boolean;
  preferredLanguage: SupportedLanguage;
  notificationPrefs: Record<string, boolean>;
  phone: string | null;
  isDemo: boolean;
  studentId?: number;
  teacherId?: number;
  departmentId?: number;
  departmentCode?: string;
  departmentName?: string;
  semester?: number;
  section?: string;
  cgpa?: number;
  activeBacklogs?: number;
  designation?: string;
  canPublishResults?: boolean;
}

export interface PlatformMeta {
  institutionName: string;
  requiredAttendancePct: number;
  smtpConfigured: boolean;
  allowedCollegeDomain: string;
}

export interface ChatCitation {
  type: 'database' | 'document' | 'general';
  title: string;
  detail: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  classification?: string;
  citations?: ChatCitation[];
  created_at: string;
}

export interface ConversationItem {
  id: number;
  title: string;
  language: SupportedLanguage;
  last_message?: string;
  updated_at: string;
}
