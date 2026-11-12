CREATE TABLE IF NOT EXISTS demo_configuration (
  id integer PRIMARY KEY CHECK (id = 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id text PRIMARY KEY,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 0),
  unit text NOT NULL,
  low_at integer NOT NULL CHECK (low_at >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_key uuid NOT NULL UNIQUE,
  request_hash text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('DINE_IN', 'TAKEAWAY')),
  table_number integer,
  status text NOT NULL DEFAULT 'PLACED' CHECK (status IN ('PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  total integer NOT NULL CHECK (total > 0),
  items jsonb NOT NULL,
  requirements jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mode = 'DINE_IN' AND table_number IS NOT NULL AND table_number BETWEEN 1 AND 6) OR (mode = 'TAKEAWAY' AND table_number IS NULL))
);

CREATE TABLE IF NOT EXISTS order_history (
  order_id uuid NOT NULL REFERENCES orders (id),
  version integer NOT NULL,
  status text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, version)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  order_id uuid NOT NULL REFERENCES orders (id),
  ingredient_id text NOT NULL REFERENCES ingredients (id),
  quantity integer NOT NULL CHECK (quantity < 0),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS register_sessions (
  id uuid PRIMARY KEY,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening integer NOT NULL CHECK (opening >= 0),
  closed_at timestamptz,
  counted integer CHECK (counted >= 0),
  expected integer CHECK (expected >= 0),
  note text,
  CHECK ((closed_at IS NULL AND counted IS NULL AND expected IS NULL) OR
         (closed_at IS NOT NULL AND counted IS NOT NULL AND expected IS NOT NULL)),
  CHECK (counted IS NULL OR counted = expected OR length(trim(note)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS only_open_register ON register_sessions ((1)) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS cash_payments (
  order_id uuid PRIMARY KEY REFERENCES orders (id),
  number integer GENERATED ALWAYS AS IDENTITY UNIQUE,
  request_key uuid NOT NULL UNIQUE,
  session_id uuid NOT NULL REFERENCES register_sessions (id),
  applied integer NOT NULL CHECK (applied > 0),
  received integer NOT NULL CHECK (received >= applied),
  created_at timestamptz NOT NULL DEFAULT now()
);
