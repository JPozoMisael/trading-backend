# Diagnóstico técnico de la API del dashboard

> Estado del **código** (no de una computadora). El estado de cada equipo se genera con
> `npm run diagnostico -- --guardar` y queda en [diagnosticos/](diagnosticos/).
> Actualizar este archivo cada vez que se cierre o aparezca un pendiente.

**Última revisión:** 2026-11-24 · 11 pruebas pasan (7 unitarias, 4 e2e) · lint y tipos sin errores.

## 1. Qué funciona hoy

| Área | Estado | Dónde |
|---|---|---|
| Configuración validada con zod: si falta una variable o es débil, no arranca y dice cuál | ✅ | `src/config/env.ts` |
| Postgres de solo lectura: cada sesión con `default_transaction_read_only=on`, `statement_timeout` 15 s | ✅ probado con BD simulada | `src/database/database.service.ts` |
| Usuario `dashboard_ro` (segunda barrera) | ✅ SQL listo · ⏳ ejecutarlo en Dokploy (A1) | `sql/usuario_solo_lectura.sql` |
| Redis sin escribir y sin grupos de consumidores (XREAD simple, desde el último id) | ✅ código | `src/redis/redis.service.ts`, `src/live/stream-reader.service.ts` |
| Login de un usuario: bcrypt, JWT en cookie httpOnly SameSite=Strict, 5 intentos/min | ✅ e2e | `src/auth/` |
| Endpoints de cuenta, posiciones, operaciones, rendimiento, curva, PnL diario, embudo, gráfico, modelo | ✅ e2e de filtros · ⏳ contra BD real | `src/trading/` |
| Modelo / práctica / prueba y sim / MT5 siempre separados | ✅ | `src/trading/filters.ts` |
| Eventos en vivo por Socket.IO (`/live`), con la misma cookie | ✅ código · ⏳ contra Redis real | `src/live/live.gateway.ts` |
| `/api/health` para Dokploy, responde en < 3 s aunque BD o Redis estén caídos | ✅ probado arrancando sin BD ni Redis | `src/health/health.controller.ts` |
| Dockerfile multi-etapa, usuario sin privilegios, health check | ✅ · ⏳ primer despliegue | `Dockerfile` |

## 2. Problemas conocidos

| # | Prioridad | Problema | Arreglo propuesto |
|---|---|---|---|
| A1 | **Alta** | Nunca se probó contra el Postgres y el Redis reales del sistema (esta PC no los tiene). Los nombres de columnas y streams se tomaron de `init.sql` v4 y `shared/config.py` | Primer despliegue en Dokploy + `npm run diagnostico` en el contenedor o en una PC con acceso |
| A2 | Media | `init.sql` del sistema hace `DROP VIEW` + `CREATE VIEW` en cada arranque. Si las vistas las recrea otro usuario que el que ejecutó `ALTER DEFAULT PRIVILEGES`, `dashboard_ro` pierde el `SELECT` sobre ellas | Ejecutar el SQL como el mismo usuario que corre `init_db.py`. El diagnóstico avisa si no puede leer las vistas |
| A3 | Media | Un WebSocket ya conectado no se corta cuando vence la sesión (12 h); sigue recibiendo eventos hasta que se desconecta | Programar la desconexión al vencer el JWT (`exp`) en `LiveGateway` |
| A4 | Baja | El límite de intentos de login vive en memoria: se reinicia con cada redeploy | Aceptable con un usuario. Con varios: Redis propio del dashboard (no el del sistema) |
| A5 | Baja | Un solo usuario en variables de entorno | Al haber más usuarios: tabla propia del dashboard (nunca en la BD de trading) y solo cambia `AuthService` |
| A6 | Baja | Falta la calibración en vivo (tramos de probabilidad vs. % que tocó el objetivo) | Portar `services/monitoring/src/review.py` con los costes de `shared/fx.py`, o que el sistema la guarde en una tabla |
| A7 | Baja | `npm audit`: 2 avisos moderados (`glob`, `minimatch`) solo en herramientas de desarrollo (`@nestjs/cli`, Jest). Producción: 0 | Se resuelve al pasar a `@nestjs/cli` 12 junto con Nest 12 |
| A8 | Baja | Sin CI | GitHub Actions con `npm test`, `npm run test:e2e`, `npm run lint` al crear el repo |

## 3. Riesgos a vigilar

- **Nunca agregar escritura**: ningún endpoint que modifique la BD o Redis, ni `XREADGROUP`/`XACK`/`XGROUP`. Un grupo de consumidores nuevo podría quitarle mensajes al risk-manager o al monitoring del sistema. Si un día se quieren acciones (p. ej. apagar la práctica), se piden al sistema por un canal propio, nunca escribiendo en sus tablas.
- **Contrato con el sistema**: la API depende de nombres del sistema de trading (tablas y vistas de `init.sql`, streams y claves de `shared/config.py`, `SIDE_STRATEGIES` de `shared/models.py`). Si cambian allá, revisar `src/trading/trading.repository.ts`, `src/live/stream-reader.service.ts` y `SIDE_STRATEGIES` del `.env`.
- **Versiones**: se usa la línea de Nest 11 (`@nestjs/config` 4, `@nestjs/jwt` 11). Las 12 de esos paquetes son solo-ESM y rompen Jest con Nest 11: no actualizarlas sueltas.
- **Credenciales**: el `.env` no viaja con git. `JWT_SECRET` y el hash se regeneran con `npm run hash-password`; cambiarlos cierra todas las sesiones.
