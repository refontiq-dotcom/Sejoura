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

export type SubscriptionPlan =
  | "free"
  | "standard"
  | "essentiel"
  | "enterprise"
  | "entreprise";

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

export type PaymentMethod = "cash" | "wave" | "pi_spi" | "mobile_money" | "bank" | "other";

export type BookingSource = "manual" | "external" | "client_request";

export type IdRegistrationStatus = "pending" | "registered" | "not_required";

export type ExpenseCategory =
  | "salaries"
  | "utilities"
  | "maintenance"
  | "supplies"
  | "marketing"
  | "rent"
  | "taxes"
  | "other";

export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "cancelled";

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
  theme_color?: string | null;
  primary_color?: string | null;
  default_currency?: string | null;
  default_currency_symbol?: string | null;
  guest_info?: GuestInfo | null;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Une ligne d'info pratique affichée sur la page client (icône + libellé + valeur). */
export interface GuestInfoItem {
  icon: string;
  label: string;
  value: string;
}

/** Une règle du règlement intérieur affichée sur la page client. */
export interface HouseRule {
  title: string;
  description?: string;
}

/**
 * Conditions & infos client configurées par l'établissement (Paramètres →
 * Espace client) et affichées sur la page /stay.
 */
export interface GuestInfo {
  practical_info: GuestInfoItem[];
  house_rules: HouseRule[];
  checkin_note?: string;
  emergency_phone?: string;
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
  // Paiement semi-automatisé (lien Wave + validation Super Admin)
  subscription_status?: "pending" | "active" | "expired" | null;
  subscription_end_date?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Demande de paiement d'abonnement déclarée par le gérant après un paiement
 * effectué via un lien Wave (pay.wave.com). Le Super Admin la valide
 * manuellement pour activer l'abonnement.
 */
export interface SubscriptionPaymentRequest {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  plan: string;
  amount: number;
  status: "pending" | "validated" | "rejected";
  requested_by: string | null;
  validated_by: string | null;
  validated_at: string | null;
  sender_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string | null;
  accommodation_id: string | null;
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

export interface EmployeeAssignment {
  id: string;
  user_id: string;
  accommodation_id: string;
  start_date: string;       // DATE — ISO format YYYY-MM-DD
  end_date: string | null;  // null = affectation permanente
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Relations optionnelles (via join)
  accommodation?: Accommodation;
  user?: User;
}

export type FeatureRequestCategory = "new_feature" | "page_improvement" | "bug_report";
export type FeatureRequestImpact = "essential" | "nice_to_have";
export type FeatureRequestStatus = "under_review" | "planned" | "in_development" | "shipped";

/**
 * Suggestion d'un client dans la boîte à idées / roadmap participative.
 * Les idées sont globales : visibles par tous les tenants.
 */
export interface FeatureRequest {
  id: string;
  tenant_id: string;
  created_by: string;
  title: string;
  description: string;
  category: FeatureRequestCategory;
  impact: FeatureRequestImpact;
  screenshot_url: string | null;
  status: FeatureRequestStatus;
  hidden: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string;
  // Relations optionnelles (via join)
  creator?: Pick<User, "full_name"> | null;
  tenant_name?: string | null;
}

export interface FeatureRequestVote {
  id: string;
  feature_request_id: string;
  user_id: string;
  created_at: string;
}



export interface Accommodation {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  country: string;
  currency: string;
  currency_symbol: string;
  phone_code: string;
  language: string;
  latitude: number | null;
  longitude: number | null;
  contact_phone: string | null;
  total_rooms: number;
  is_active: boolean;
  is_boosted: boolean;
  boost_expires_at: string | null;
  is_permanently_boosted?: boolean;
  boost_express_expires_at?: string | null;
  boost_express_price_paid?: number | null;
  logo_url?: string | null;
  theme_color?: string | null;
  image_url?: string | null;
  guest_info?: GuestInfo | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalApiKey {
  id: string;
  tenant_id: string;
  name: string;
  api_key: string;
  scopes: string[];
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
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
  surface_m2: number | null;
  is_listed_on_trouvetou: boolean;
  featured_images: string[];
  check_out_time: string;
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

export interface TrouvetouListing {
  id: string;
  unit_id: string;
  establishment_id: string;
  is_published: boolean;
  public_title: string | null;
  public_description: string | null;
  featured_images: string[];
  amenities_badges: string[];
  direct_whatsapp: string | null;
  views_count: number;
  whatsapp_clicks_count: number;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  tenant_id: string;
  accommodation_id: string | null;
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
  booking_source: BookingSource;
  status: BookingStatus;
  number_of_guests: number;
  special_requests: string | null;
  is_overstay: boolean;
  overstay_detected_at: string | null;
  overstay_auto_checked_out: boolean;
  is_third_party: boolean;
  occupant_full_name: string | null;
  occupant_phone: string | null;
  occupant_id_type: string | null;
  occupant_id_number: string | null;
  occupant_nationality: string | null;
  occupant_address: string | null;
  id_registration_status: IdRegistrationStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** Une prolongation de séjour enregistrée (extend_booking ou dépassement auto). */
export interface BookingExtension {
  id: string;
  tenant_id: string;
  booking_id: string;
  previous_check_out_date: string;
  new_check_out_date: string;
  extra_nights: number;
  source: "manual" | "client_request" | "overstay";
  created_by: string | null;
  created_at: string;
}

export type StayActivityType =
  | "booking_created"
  | "check_in"
  | "check_out"
  | "booking_extended"
  | "overstay_detected"
  | "overstay_auto_checkout"
  | "service_request"
  | "service_request_done"
  | "stay_extension_requested"
  | "stay_extension_approved"
  | "stay_extension_rejected"
  | "payment"
  | "room_change";

export interface StayActivity {
  id: string;
  tenant_id: string;
  booking_id: string;
  client_id: string | null;
  activity_type: StayActivityType;
  title: string;
  description: string | null;
  meta: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
}

export type StayNoteType = "incident" | "damage" | "forgotten_object" | "feedback" | "other";
export type StayNoteSeverity = "low" | "medium" | "high";

export interface StayNote {
  id: string;
  tenant_id: string;
  booking_id: string;
  client_id: string | null;
  note_type: StayNoteType;
  description: string;
  severity: StayNoteSeverity;
  created_by: string | null;
  created_at: string;
}

export type ClientScoreTier = "excellent" | "bon" | "moyen" | "a_surveiller" | "mauvais";

/**
 * Ligne de la vue client_profiles (score agrégé pour les listes / badges).
 */
export interface ClientProfile {
  client_id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  stay_count: number;
  total_nights: number;
  total_revenue: number;
  balance_due: number;
  avg_stay_amount: number;
  preferred_room_type: string | null;
  last_stay_date: string | null;
  score: number;
  tier: ClientScoreTier;
}

export interface ClientProfileSignal {
  tone: "positive" | "negative" | "neutral";
  text: string;
}

export interface ClientProfileDimensions {
  reliability: number;
  behavior: number;
  loyalty: number;
  value: number;
}

/**
 * Payload renvoyé par le RPC get_client_profile (fiche client dédiée).
 */
export interface ClientProfilePayload {
  ok: boolean;
  error?: string;
  client?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    nationality: string | null;
    id_type: string | null;
    id_number: string | null;
    address: string | null;
    emergency_contact: string | null;
    created_at: string;
  };
  profile?: {
    stats: {
      stay_count: number;
      total_nights: number;
      total_revenue: number;
      total_paid: number;
      balance_due: number;
      avg_stay_amount: number;
      preferred_room_type: string | null;
      last_stay_date: string | null;
    };
    score: {
      total: number;
      tier: ClientScoreTier;
      dimensions: ClientProfileDimensions;
    };
    signals: ClientProfileSignal[];
  };
}

export interface Payment {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  accommodation_id: string | null;
  amount: number;
  payment_method: PaymentMethod;
  mobile_money_operator?: string | null;
  payment_date: string;
  reference: string | null;
  received_by: string;
  operation_type?: string;
  notes: string | null;
  created_at: string;
}

/** Shift de caisse : période d'encaissement d'une réceptionniste */
export interface Shift {
  id: string;
  tenant_id: string;
  accommodation_id: string | null;
  receptionist_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  expected_cash: number | null;
  counted_cash: number | null;
  difference: number | null;
  status: "open" | "closed";
  notes: string | null;
  created_at: string;
  updated_at: string;
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

export interface Invoice {
  id: string;
  tenant_id: string;
  booking_id: string;
  invoice_number: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  pdf_url: string | null;
  sent_at: string | null;
  sent_to: string | null;
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

export type ClientServiceRequestType = "cleaning" | "linen" | "assistance";

export interface ClientServiceRequest {
  id: string;
  tenant_id: string;
  booking_id: string;
  client_id: string;
  request_type: ClientServiceRequestType;
  message: string | null;
  status: "pending" | "done" | "cancelled";
  created_at: string;
}

export type ClientStayExtensionStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ClientStayExtensionRequest {
  id: string;
  tenant_id: string;
  booking_id: string;
  client_id: string;
  requested_check_out_date: string;
  message: string | null;
  status: ClientStayExtensionStatus;
  created_at: string;
  processed_at: string | null;
  processed_by: string | null;
  processed_note: string | null;
}

/**
 * Payload renvoyé par la fonction RPC get_client_stay (espace client public).
 */
export interface ClientStayPayload {
  valid: boolean;
  state: "active" | "ended" | "expired" | "cancelled" | "invalid" | "unavailable";
  reason?: string;
  session?: {
    id: string;
    expires_at: string;
    is_overstay: boolean;
  };
  tenant?: {
    company_name: string;
    logo_url: string | null;
    primary_color: string;
    contact_phone: string | null;
    guest_info: GuestInfo | null;
    /** "readonly" (Croissance : consultation seule) ou "full" (Entreprise : services + prolongation) */
    portal_mode: "readonly" | "full";
  };
  accommodation?: {
    name: string;
    address: string | null;
    city: string | null;
    contact_phone: string | null;
  };
  room?: {
    room_number: string;
    floor: number | null;
    room_type_name: string;
    capacity: number;
    amenities: unknown[];
  };
  booking?: {
    id: string;
    booking_code: string;
    check_in_date: string;
    check_out_date: string;
    check_in_time: string;
    check_out_time: string;
    nights_count: number;
    status: BookingStatus;
    payment_status: PaymentStatus;
    total_amount: number;
    amount_paid: number;
    special_requests: string | null;
  };
  client?: {
    full_name: string;
  };
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
      subscription_payment_requests: {
        Row: SubscriptionPaymentRequest;
        Insert: Omit<SubscriptionPaymentRequest, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<SubscriptionPaymentRequest, "id" | "created_at" | "updated_at">>;
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
      client_profiles: {
        Row: ClientProfile;
        Insert: never;
        Update: never;
      };
      bookings: {
        Row: Booking;
        Insert: Omit<Booking, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Booking, "id" | "created_at" | "updated_at">>;
      };
      booking_extensions: {
        Row: BookingExtension;
        Insert: Omit<BookingExtension, "id" | "created_at">;
        Update: Partial<Omit<BookingExtension, "id" | "created_at">>;
      };
      stay_activities: {
        Row: StayActivity;
        Insert: Omit<StayActivity, "id" | "created_at">;
        Update: Partial<Omit<StayActivity, "id" | "created_at">>;
      };
      stay_notes: {
        Row: StayNote;
        Insert: Omit<StayNote, "id" | "created_at">;
        Update: Partial<Omit<StayNote, "id" | "created_at">>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, "id" | "created_at">;
        Update: Partial<Omit<Payment, "id" | "created_at">>;
      };
      shifts: {
        Row: Shift;
        Insert: Omit<Shift, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Shift, "id" | "created_at" | "updated_at">>;
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
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Invoice, "id" | "created_at" | "updated_at">>;
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
      client_service_requests: {
        Row: ClientServiceRequest;
        Insert: Omit<ClientServiceRequest, "id" | "created_at">;
        Update: Partial<Omit<ClientServiceRequest, "id" | "created_at">>;
      };
      client_stay_extension_requests: {
        Row: ClientStayExtensionRequest;
        Insert: Omit<ClientStayExtensionRequest, "id" | "created_at" | "processed_at" | "processed_by" | "processed_note">;
        Update: Partial<Omit<ClientStayExtensionRequest, "id" | "created_at">>;
      };
      whatsapp_messages: {
        Row: WhatsAppMessage;
        Insert: Omit<WhatsAppMessage, "id" | "created_at">;
        Update: Partial<Omit<WhatsAppMessage, "id" | "created_at">>;
      };
      feature_requests: {
        Row: FeatureRequest;
        Insert: Omit<FeatureRequest, "id" | "created_at" | "updated_at" | "upvotes" | "status" | "hidden">;
        Update: Partial<Omit<FeatureRequest, "id" | "created_at">>;
      };
      feature_request_votes: {
        Row: FeatureRequestVote;
        Insert: Omit<FeatureRequestVote, "id" | "created_at">;
        Update: Partial<Omit<FeatureRequestVote, "id" | "created_at">>;
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
      reopen_cleaning_task: {
        Args: { p_task_id: string };
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
          p_base_price: number;
          p_negotiated_price: number;
          p_nights_count: number;
          p_total_amount: number;
          p_created_by: string;
          p_check_in_time?: string;
          p_check_out_time?: string;
          p_number_of_guests?: number;
          p_special_requests?: string;
        };
        Returns: Booking;
      };
      check_in_booking: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      check_out_booking: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      update_booking: {
        Args: {
          p_booking_id: string;
          p_user_id: string;
          p_check_in_date?: string;
          p_check_out_date?: string;
          p_room_id?: string;
          p_negotiated_price?: number;
        };
        Returns: Booking;
      };
      cancel_booking: {
        Args: { p_booking_id: string; p_user_id: string; p_reason?: string };
        Returns: Booking;
      };
      mark_no_show: { Args: { p_booking_id: string; p_user_id: string }; Returns: Booking };
      check_cleaning_alerts: { Args: Record<string, never>; Returns: void };
      sync_room_type_checkout_time: {
        Args: { p_room_type_id: string };
        Returns: number;
      };
      check_overstays: {
        Args: {
          p_alert_after_minutes?: number;
          p_auto_checkout_after_minutes?: number;
        };
        Returns: number;
      };
      extend_booking: {
        Args: {
          p_booking_id: string;
          p_new_check_out_date: string;
          p_user_id: string;
        };
        Returns: Booking;
      };
      suspend_tenant: { Args: { p_tenant_id: string; p_reason: string }; Returns: Tenant };
      reactivate_tenant: { Args: { p_tenant_id: string }; Returns: Tenant };
      request_mid_stay_cleaning: {
        Args: { p_booking_id: string; p_user_id: string };
        Returns: CleaningTask;
      };
      generate_invoice: {
        Args: { p_booking_id: string; p_user_id: string; p_invoice_number: string };
        Returns: Invoice;
      };
      validate_subscription_payment: {
        Args: { p_request_id: string };
        Returns: SubscriptionPaymentRequest;
      };
      reject_subscription_payment: {
        Args: { p_request_id: string };
        Returns: SubscriptionPaymentRequest;
      };
      sync_subscription_statuses: {
        Args: Record<string, never>;
        Returns: number;
      };
      get_client_stay: {
        Args: { p_token: string };
        Returns: ClientStayPayload;
      };
      create_service_request: {
        Args: { p_token: string; p_request_type: string; p_message?: string };
        Returns: { ok: boolean; error?: string; id?: string; request_type?: string; status?: string };
      };
      request_stay_extension: {
        Args: { p_token: string; p_new_check_out_date: string; p_message?: string | null };
        Returns: { ok: boolean; error?: string; id?: string; requested_check_out_date?: string; status?: string };
      };
      process_stay_extension: {
        Args: { p_request_id: string; p_decision: string; p_user_id: string; p_note?: string | null };
        Returns: { ok: boolean; error?: string; id?: string; status?: string };
      };
      open_shift: {
        Args: {
          p_user_id: string;
          p_accommodation_id?: string | null;
          p_opening_cash?: number;
          p_notes?: string | null;
        };
        Returns: Shift;
      };
      close_shift: {
        Args: { p_shift_id: string; p_counted_cash: number; p_notes?: string | null };
        Returns: Shift;
      };
    };
  };
}