
-- =====================================================
-- 1. RoutePointPrice: validate FIXED / CONTACT pricing
-- =====================================================

ALTER TABLE "RoutePointPrice"
ADD CONSTRAINT "RoutePointPrice_price_type_check"
CHECK (
    ("priceType" = 'FIXED' AND "price" IS NOT NULL AND "price" > 0)
    OR
    ("priceType" = 'CONTACT' AND "price" IS NULL)
);

-- =====================================================
-- 2. ServicePointPrice: validate FIXED / CONTACT pricing
-- =====================================================

ALTER TABLE "ServicePointPrice"
ADD CONSTRAINT "ServicePointPrice_price_type_check"
CHECK (
    ("priceType" = 'FIXED' AND "price" IS NOT NULL AND "price" > 0)
    OR
    ("priceType" = 'CONTACT' AND "price" IS NULL)
);

-- =====================================================
-- 3. RoutePriceOverride: validate FIXED / CONTACT pricing
-- =====================================================

ALTER TABLE "RoutePriceOverride"
ADD CONSTRAINT "RoutePriceOverride_price_type_check"
CHECK (
    ("priceType" = 'FIXED' AND "price" IS NOT NULL AND "price" > 0)
    OR
    ("priceType" = 'CONTACT' AND "price" IS NULL)
);


