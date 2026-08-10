-- Backs the gallery cart & inquiry flow (docs/superpowers/specs/2026-08-10-gallery-cart-inquiry-design.md).
-- One row per cart submission, not per item — there's no need to track each
-- piece's follow-up status independently; the whole inquiry is one
-- conversation with one buyer.

CREATE TABLE IF NOT EXISTS gallery_inquiries (
    id SERIAL PRIMARY KEY,
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_message TEXT,
    items JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
