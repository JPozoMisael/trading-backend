-- Usuario de Postgres SOLO LECTURA para el dashboard.
-- Ejecutar UNA vez como el dueño de la BD (el usuario `trader` en Dokploy, o `postgres`).
-- Cambiar la contraseña antes de ejecutarlo. Es idempotente.
--
-- Aunque la API ya abre cada sesión con default_transaction_read_only=on, este usuario
-- es la segunda barrera: no tiene permiso de escribir aunque alguien cambiara el código.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_ro') THEN
        CREATE ROLE dashboard_ro LOGIN PASSWORD 'CAMBIAR_ESTA_CONTRASENA';
    END IF;
END $$;

ALTER ROLE dashboard_ro SET default_transaction_read_only = on;
ALTER ROLE dashboard_ro CONNECTION LIMIT 10;

GRANT CONNECT ON DATABASE trading TO dashboard_ro;   -- cambiar "trading" si tu BD se llama distinto
GRANT USAGE ON SCHEMA public TO dashboard_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dashboard_ro;   -- incluye las vistas

-- Las tablas y vistas que cree init.sql más adelante también serán legibles.
-- Ejecutar como el MISMO usuario que corre init.sql (el dueño de las tablas).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dashboard_ro;

-- Ojo: init.sql hace DROP VIEW + CREATE VIEW en cada arranque. Si las vistas se recrean
-- con un usuario distinto al que ejecutó el ALTER DEFAULT PRIVILEGES, volver a ejecutar
-- el GRANT SELECT ON ALL TABLES de arriba.

-- Comprobar:
--   SELECT has_table_privilege('dashboard_ro', 'orders', 'SELECT')  AS lee,
--          has_table_privilege('dashboard_ro', 'orders', 'INSERT')  AS escribe;  -- debe dar t / f
