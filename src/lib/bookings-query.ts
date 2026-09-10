export const BOOKING_LIST_SELECT = `
  id,
  tenant_id,
  accommodation_id,
  room_id,
  client_id,
  booking_code,
  check_in_date,
  check_out_date,
  check_in_time,
  check_out_time,
  actual_check_in,
  actual_check_out,
  base_price,
  negotiated_price,
  nights_count,
  total_amount,
  amount_paid,
  payment_status,
  payment_method,
  booking_source,
  status,
  number_of_guests,
  special_requests,
  is_overstay,
  overstay_detected_at,
  overstay_auto_checked_out,
  is_third_party,
  occupant_full_name,
  occupant_phone,
  occupant_id_type,
  occupant_id_number,
  occupant_nationality,
  occupant_address,
  id_registration_status,
  created_at,
  client:clients(id, full_name, phone, email, nationality, id_number, id_type, address, emergency_contact),
  room:rooms(id, room_number, room_type_id, status, room_type:room_types(id, name))
`;

export const CLIENT_LIST_SELECT =
  "id, tenant_id, accommodation_id, full_name, phone, email, nationality, id_number, id_type, address, emergency_contact";

export const ACCOMMODATION_LIST_SELECT =
  "id, tenant_id, name, is_active, tourist_tax_enabled, tourist_tax_rate";

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function bookingListDateWindow(now = new Date()): { from: string; to: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  from.setUTCMonth(from.getUTCMonth() - 6);
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  to.setUTCMonth(to.getUTCMonth() + 3);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function bookingListOverlapFilter(from: string, to: string): string {
  return `and(check_out_date.gte.${from},check_in_date.lte.${to}),status.eq.checked_in`;
}
