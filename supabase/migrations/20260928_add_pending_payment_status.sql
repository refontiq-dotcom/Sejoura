-- Add pending_payment to booking_status enum for online bookings
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'pending_payment';
