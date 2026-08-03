-- Ported from museum_server.py's ensure_schema() / COUNTRIES_SEED.

CREATE TABLE IF NOT EXISTS museum_countries (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    native_name TEXT,
    region TEXT,
    tag TEXT,
    lat DOUBLE PRECISION,
    lon DOUBLE PRECISION,
    lang_label TEXT,
    accent_class TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS museum_submissions (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('voices','perspectives')),
    country_slug TEXT REFERENCES museum_countries(slug),
    display_name TEXT,
    contact_email TEXT,
    language TEXT,
    title TEXT,
    original_text TEXT,
    english_text TEXT,
    image_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_review','approved','rejected')),
    ai_screening JSONB,
    moderator_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

INSERT INTO museum_countries (slug, name, native_name, region, tag, lat, lon, lang_label, accent_class) VALUES
    ('iraq', 'Iraq', 'العراق', 'Middle East', 'Mesopotamia', 33.2232, 43.6793, 'العربية', 'country-iraq'),
    ('eritrea', 'Eritrea', 'ኤርትራ', 'Africa', 'Horn of Africa', 15.1794, 39.7823, 'ትግርኛ', 'country-eritrea'),
    ('south_sudan', 'South Sudan', 'جنوب السودان', 'Africa', 'East Africa', 7.8627, 29.6949, 'العربية', 'country-south_sudan'),
    ('ethiopia', 'Ethiopia', 'ኢትዮጵያ', 'Africa', 'Horn of Africa', 9.1450, 40.4897, 'አማርኛ', 'country-ethiopia'),
    ('venezuela', 'Venezuela', 'Venezuela', 'Latin America', 'South America', 6.4238, -66.5897, 'Español', 'country-venezuela'),
    ('haiti', 'Haiti', 'Ayiti', 'Caribbean', 'Caribbean', 18.9712, -72.2852, 'Kreyòl', 'country-haiti'),
    ('somalia', 'Somalia', 'Soomaaliya', 'Africa', 'Horn of Africa', 5.1521, 46.1996, 'Soomaali', 'country-somalia'),
    ('myanmar', 'Myanmar', 'မြန်မာ', 'Southeast Asia', 'Golden Land', 21.9162, 95.9560, 'မြန်မာ', 'country-myanmar'),
    ('afghanistan', 'Afghanistan', 'افغانستان', 'Central Asia', 'Silk Road', 33.9391, 67.7100, 'دری', 'country-afghanistan'),
    ('bhutan', 'Bhutan', 'भुटान', 'South Asia', 'Himalaya', 27.5142, 90.4336, 'नेपाली', 'country-bhutan'),
    ('dr_congo', 'DR Congo', 'Jamhuri ya Kidemokrasia ya Kongo', 'Africa', 'Congo Basin', -4.0383, 21.7587, 'Kiswahili', 'country-dr_congo'),
    ('nigeria', 'Nigeria', 'Nàìjíríà', 'Africa', 'West Africa', 9.0820, 8.6753, 'Yorùbá', 'country-nigeria'),
    ('syria', 'Syria', 'سوريا', 'Middle East', 'Levant', 34.8021, 38.9968, 'العربية', 'country-syria'),
    ('vietnam', 'Vietnam', 'Việt Nam', 'Southeast Asia', 'Southeast Asia', 14.0583, 108.2772, 'Tiếng Việt', 'country-vietnam'),
    ('ukraine', 'Ukraine', 'Україна', 'Eastern Europe', 'Eastern Europe', 48.3794, 31.1656, 'Українська', 'country-ukraine')
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, native_name = EXCLUDED.native_name, region = EXCLUDED.region,
    tag = EXCLUDED.tag, lat = EXCLUDED.lat, lon = EXCLUDED.lon,
    lang_label = EXCLUDED.lang_label, accent_class = EXCLUDED.accent_class;
