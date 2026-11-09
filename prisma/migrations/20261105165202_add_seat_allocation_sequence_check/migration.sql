-- This is an empty migration.
ALTER TABLE "SeatAllocation"
ADD CONSTRAINT "seat_allocation_valid_sequence"
CHECK ("pickupSequence" < "dropoffSequence");