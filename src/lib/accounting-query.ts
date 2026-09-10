export const ACCOUNTING_EXPENSE_SELECT =
  "id, tenant_id, accommodation_id, category, description, amount, expense_date, created_by, created_at";

export const ACCOUNTING_PAYMENT_SELECT =
  "id, tenant_id, booking_id, accommodation_id, amount, payment_method, mobile_money_operator, payment_date, reference, received_by, operation_type, notes, created_at";

export const ACCOUNTING_AUDIT_SELECT =
  "id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, ip_address, created_at";

export const ACCOUNTING_INVOICE_SELECT =
  "id, tenant_id, booking_id, invoice_number, amount, tax_amount, total_amount, status, pdf_url, access_token, sent_at, sent_to, created_by, created_at";

export const ACCOUNTING_CLIENT_SELECT = `
  id, tenant_id, accommodation_id, full_name, phone, email, nationality, id_number, id_type, address, created_at,
  bookings(id, booking_code, check_in_date, check_out_date, status, total_amount, amount_paid, payment_status, nights_count, accommodation_id)
`;
