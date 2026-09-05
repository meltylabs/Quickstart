# Admin: Gestión de invitados / Guest Management

## Setup inicial de Supabase

1. Creá una cuenta gratuita en [supabase.com](https://supabase.com)
2. Creá un nuevo proyecto (free tier)
3. Anotá: **Project URL** y **anon public key** (en Settings → API)
4. Reemplazá estos valores en `js/rsvp.js`:
   ```js
   const SUPABASE_URL = 'https://xxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```

## Crear la tabla de invitados

En Supabase → SQL Editor, ejecutá:

```sql
CREATE TABLE guests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  group_name   TEXT,
  email        TEXT,
  phone        TEXT,
  is_attending BOOLEAN,
  plus_one_confirmed BOOLEAN,
  plus_one_name TEXT,
  arrival_day  DATE,
  notes        TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar acceso anónimo (los tokens son UUIDs indescifrables)
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read"   ON guests FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update" ON guests FOR UPDATE TO anon USING (true) WITH CHECK (true);
```

## Cargar invitados

### Opción A — Importar CSV (más rápido para listas grandes)
1. Preparar el CSV usando `seed-template.csv` como base
2. En Supabase → Table Editor → guests → Import Data
3. Subir el CSV (las columnas `token`, `id`, `updated_at` se generan solas)

### Opción B — Ingresar manualmente
1. Supabase → Table Editor → guests → Insert Row
2. Llenar: `name` (requerido), `group_name` (ej: "Familia Kremer")
3. El `token` se genera automáticamente

## Generar links personalizados

Una vez creados los invitados:

1. En Table Editor, abrí la tabla `guests`
2. Copiá el `token` de cada invitado
3. Armá el link: `https://TU-DOMINIO.com/?t=TOKEN`
4. Envialo por WhatsApp o email

Ejemplo:
```
https://sara-y-mauricio.com/?t=550e8400-e29b-41d4-a716-446655440000
```

## Ver RSVPs en tiempo real

- Supabase → Table Editor → guests
- Columnas clave: `is_attending`, `plus_one_confirmed`, `arrival_day`, `updated_at`
- Podés filtrar, ordenar y exportar a CSV desde ahí

## Columnas del CSV

| Columna | Requerido | Descripción |
|---------|-----------|-------------|
| name | ✅ | Nombre tal como aparece en el formulario |
| group_name | — | Familia o pareja (ej: "Familia Van Velkinburgh") |
| email | — | Email pre-cargado (pueden editarlo) |
| phone | — | Celular pre-cargado (pueden editarlo) |
