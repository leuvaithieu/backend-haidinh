-- Hỗ trợ toán tử so sánh bằng trong GiST cho text và enum.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Ngăn hai lượt giữ/đặt cùng ghế trên các đoạn đường bị trùng nhau.
ALTER TABLE "SeatAllocation"
ADD CONSTRAINT "seat_allocation_no_overlapping_active"
EXCLUDE USING GIST (
    "tripSeatId" WITH =,
    "direction" WITH =,
    int4range(
        "pickupSequence",
        "dropoffSequence",
        '[)'
    ) WITH &&
)
WHERE ("status" IN ('HELD', 'BOOKED'));