# CLAUDE.md

Guía para Claude Code en este repositorio. Responde al usuario en **español**.

## Qué es

API **de solo lectura** (NestJS 11) del dashboard del sistema de trading Forex
(`../forex-trading-system`, Python). Lee su Postgres y su Redis y los entrega al front
(`../trading-dashboard-web`). No envía órdenes ni escribe nada. Guía de usuario en `README.md`.

## Comandos

```powershell
npm install
copy .env.example .env          # completar; .env NUNCA se commitea
npm run hash-password           # AUTH_PASSWORD_HASH_B64 y JWT_SECRET
npm run start:dev               # http://localhost:3001/api

npm test                        # unitarias (deben pasar antes de cada commit)
npm run test:e2e                # API completa con BD y Redis simulados
npm run lint
npm run diagnostico             # entorno de esta PC (--guardar lo deja en docs/diagnosticos/)
```

## Arquitectura

| Carpeta | Qué hace |
|---|---|
| `src/config/` | `env.ts`: esquema zod de toda la configuración. `AppConfig` la entrega tipada. No leer `process.env` fuera de aquí |
| `src/database/` | Pool de `pg` en solo lectura (`default_transaction_read_only=on`) |
| `src/redis/` | Cliente de consultas (timeout 3 s) y `createClient()` para lecturas bloqueantes |
| `src/auth/` | Login, cookie `td_session`, guard global (`@Public()` para excepciones) |
| `src/trading/` | `TradingRepository` (todo el SQL, solo SELECT) y `TradingController` (valida con zod) |
| `src/live/` | `StreamReaderService` (XREAD de los streams + estado cada 5 s) y `LiveGateway` (Socket.IO `/live`) |
| `src/health/` | `/api/health` público para Dokploy |

## Reglas (no romper)

- **Solo lectura.** Ningún INSERT/UPDATE/DELETE, ningún `SET` en Redis, nunca `XREADGROUP`, `XACK` ni `XGROUP`: un grupo de consumidores le quitaría mensajes a los servicios del sistema.
- Todo valor de la URL pasa por zod y va como parámetro (`$1`) con la clase `Where`; nunca concatenar valores en SQL.
- Modelo, práctica y prueba se filtran siempre por separado (`SIDE_STRATEGIES`), y nunca se mezclan `sim` y `mt5`.
- Mantener la línea de Nest 11 (`@nestjs/config` 4, `@nestjs/jwt` 11): las 12 son solo-ESM.
- Código, comentarios, logs y mensajes en español. Nunca commitear `.env`.

## Estado del proyecto

| Archivo | Para qué |
|---|---|
| `docs/BITACORA.md` | Qué se hizo en cada sesión y el **siguiente paso**. Leer primero |
| `docs/DIAGNOSTICO.md` | Estado del código: qué funciona, problemas A1..An, riesgos |
| `docs/diagnosticos/<fecha>_<equipo>.md` | Entorno de cada computadora (`npm run diagnostico -- --guardar`) |

**Al empezar:** `git pull`, leer la bitácora y correr `npm run diagnostico -- --sin-tests`.
**Al terminar una tarea relevante:** entrada nueva arriba en la bitácora, actualizar el diagnóstico si cambió y proponer commit + push.
Si un cambio depende del sistema de trading (tablas, streams, `SIDE_STRATEGIES`), anotarlo también en `../forex-trading-system/docs/BITACORA.md`.
