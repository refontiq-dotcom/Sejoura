// ============================================================================
// SÉJOURA — Types TypeScript pour la base de données
// Générés manuellement depuis supabase/schema.sql
// ============================================================================

export type UserRole =
  | "super_admin"
  | "admin_residence"
  | "receptionniste"
  | "menagere"
  | "client";

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "overdue"
  | "suspended"
  | "cancelled";

export type SubscriptionPlan = "standard" | "pro" | "enterprise";

export type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "checked_in"
  | "checked_out";

export type RoomStatus = "available" | "occupied" | "alert" | "cleaning";

export type CleaningTaskStatus =
  | "pending"
  | "claimed"
  | "in_progress"
  | "done"
  | "expired";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

export type PaymentMethod = "cash" | "wave" | "pi_spi" | "bank" | "other";

export type ExpenseCategory =
  | "salaries"
  | "utilities"
  | "maintenance"
  | "supplies"
  | "marketing"
  | "rent"
  | "taxes"
  | "other";

// ----------------------------------------------------------------------------
// Tables
// ----------------------------------------------------------------------------

export interface Tenant {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  country: string;
  city: string | null;
  address: string | null;
  logo_url: string | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  tenant_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trial_ends_at: string;
  current_period_start: string | null;
  current_period_end: string | null;
  monthly_price: number;
  payment_method: PaymentMethod | null;
  last_payment_at: string | null;
  last_payment_amount: number | null;
  is_soft_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string | null;
  auth_user_id: string | null;
  role: UserRole;
  full_name: string;
  phone: string;
  email: string | null;
  password_hash: string | null;
  is_active: boolean;
  activated_at: string | null;
  last_login_at: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Accommodation {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  total_rooms: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RoomType {
  id: string;
  accommodation_id: string;
  name: string;
  description: string | null;
  base_price: number;
  capacity: number;
  amenities: string[];
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  accommodation_id: string;
  room_type_id: string;
  room_number: string;
  floor: number | null;
  status: RoomStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  id_type: string | null;
  id_number: string | null;
  id_photo_url: string | null;
  nationality: string | null;
  address: string | null;
  emergency_contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  tenant_id: string;
  accommodation_id: string;
  room_id: string;
  client_id: string;
  booking_code: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  actual_check_in: string | null;
  actual_check_out: string | null;
  base_price: number;
  negotiated_price: number;
  nights_count: number;
  total_amount: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  status: BookingStatus;
  number_of_guests: number;
  special_requests: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  tenant_id: string;
  booking_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference: string | null;
  received_by: string;
  notes: string | null;
  created_at: string;
}

export interface CleaningTask {
  id: string;
  tenant_id: string;
  accommodation_id: string;
  room_id: string;
  booking_id: string | null;
  status: CleaningTaskStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  checkout_time: string | null;
  alert_time: string | null;
  force_release_time: string | null;
  is_alert_sent: boolean;
  is_force_released: boolean;
  priority: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  tenant_id: string;
  accommodation_id: string | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: string;
  receipt_url: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  tenant_id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ClientSession {
  id: string;
  tenant_id: string;
  booking_id: string;
  client_id: string;
  access_token: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
}

export interface WhatsAppMessage {
  id: string;
  tenant_id: string;
  client_id: string | null;
  booking_id: string | null;
  phone_number: string;
  message_type: string;
  message_content: string;
  template_name: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  provider_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Vues
// ----------------------------------------------------------------------------

export interface DashboardKPI {
  tenant_id: string;
  today: string;
  occupancy_rate: number | null;
  daily_revenue: number;
  expected_checkins: number;
  expected_checkouts: number;
}

export interface RoomStatusDistribution {
  tenant_id: string;
  status: RoomStatus;
  count: number;
}

export interface MonthlyRevenue {
  tenant_id: string;
  month: string;
  total_revenue: number;
  payment_count: number;
}

export interface DailyMovement {
  tenant_id: string;
  booking_id: string;
  booking_code: string;
  client_name: string;
  room_number: string;
  room_type_name: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  booking_status: BookingStatus;
  payment_status: PaymentStatus;
  total_amount: number;
  amount_paid: number;
  negotiated_price: number;
  movement_type: "check_in" | "check_out" | "stay";
}

// ----------------------------------------------------------------------------
// Types composés (avec relations)
// ----------------------------------------------------------------------------

export interface BookingWithRelations extends Booking {
  client?: Client;
  room?: Room;
  room_type?: RoomType;
  accommodation?: Accommodation;
  payments?: Payment[];
}

export interface RoomWithRelations extends Room {
  room_type?: RoomType;
  accommodation?: Accommodation;
  current_booking?: Booking | null;
}

export interface CleaningTaskWithRelations extends CleaningTask {
  room?: Room;
  accommodation?: Accommodation;
  booking?: Booking | null;
  claimed_by_user?: User | null;
  completed_by_user?: User | null;
}

// ----------------------------------------------------------------------------
// Database type pour Supabase
// ----------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: Tenant;
        Insert: Omit<Tenant, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Tenant, "id" | "created_at" | "updated_at">>;
      };
      subscriptions: {
        Row: Subscription;
        Insert: Omit<Subscription, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Subscription, "id" | "created_at" | "updated_at">>;
      };
      users: {
        Row: User;
        Insert: Omit<User, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<User, "id" | "created_at" | "updated_at">>;
      };
      accommodations: {
        Row: Accommodation;
        Insert: Omit<Accommodation, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Accommodation, "id" | "created_at" | "updated_at">>;
      };
      room_types: {
        Row: RoomType;
        Insert: Omit<RoomType, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<RoomType, "id" | "created_at" | "updated_at">>;
      };
      rooms: {
        Row: Room;
        Insert: Omit<Room, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Room, "id" | "created_at" | "updated_at">>;
      };
      clients: {
        Row: Client;
        Insert: Omit<Client, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Client, "id" | "created_at" | "updated_at">>;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Booking, "id" | "created_at" | "updated_at">>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, "id" | "created_at">;
        Update: Partial<Omit<Payment, "id" | "created_at">>;
      };
      cleaning_tasks: {
        Row: CleaningTask;
        Insert: Omit<CleaningTask, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<CleaningTask, "id" | "created_at" | "updated_at">>;
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Expense, "id" | "created_at" | "updated_at">>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, "id" | "created_at">;
        Update: Partial<Omit<AuditLog, "id" | "created_at">>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, "id" | "created_at">;
        Update: Partial<Omit<Notification, "id" | "created_at">>;
      };
      client_sessions: {
        Row: ClientSession;
        Insert: Omit<ClientSession, "id" | "created_at">;
        Update: Partial<Omit<ClientSession, "id" | "created_at">>;
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: Omit<WhatsAppMessage, "id" | "created_at">;
        Update: Partial<Omit<WhatsAppMessage, "id" | "created_at">>;
      };
    };
    Views: {
      v_dashboard_kpis: { Row: DashboardKPI };
      v_room_status_distribution: { Row: RoomStatusDistribution };
      v_monthly_revenue: { Row: MonthlyRevenue };
      v_daily_movements: { Row: DailyMovement };
    };
    Functions: {
      generate_booking_code: { Args: { p_tenant_id: string }; Returns: string };
      is_tenant_locked: { Args: { p_tenant_id: string }; Returns: boolean };
      get_current_user_tenant_id: { Args: Record<string, never>; Returns: string };
      get_current_user_role: { Args: Record<string, never>; Returns: UserRole };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      claim_cleaning_task: {
        Args: { p_task_id: string; p_user_id: string };
        Returns: CleaningTask;
      };
      complete_cleaning_task: {
        Args: { p_task_id: string; p_user_id: string };
        Returns: CleaningTask;
      };
      check_double_booking: {
        Args: {
          p_room_id: string;
          p_check_in: string;
          p_check_out: string;
          p_exclude_booking_id?: string;
        };
        Returns: boolean;
      };
      create_booking: {
        Args: {
          p_tenant_id: string;
          p_accommodation_id: string;
          p_room_id: string;
          p_client_id: string;
          p_check_in_date: string;
          p_check_out_date: string;
          p_check_in_time?: string;
          p_check_out_time?: string;
          p_base_price: number;
          p_negotiated_price: number;
          p_nights_count: number;
          p_total_amount: number;
          p_number_of_guests?: number;
          p_special_requests?: string;
          p_created_by: string;
        };
        Returns: Booking;
      };
      check_in_booking: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      check_out_booking: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      cancel_booking: {
        Args: { p_booking_id: string; p_user_id: string; p_reason?: string };
        Returns: Booking;
      };
      mark_no_show: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      check_cleaning_alerts: { Args: Record<string, never>; Returns: void };
      suspend_tenant: { Args: { p_tenant_id: string; p_reason: string }; Returns: Tenant };
      reactivate_tenant: { Args: { p_tenant_id: string }; Returns: Tenant };
    };
  };
}