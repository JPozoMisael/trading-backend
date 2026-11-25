# Bitácora de trabajo

Registro corto de cada sesión, para retomar desde cualquier computadora. **Lo más reciente arriba.**
Formato: fecha · equipo · qué se hizo · qué quedó pendiente / siguiente paso.

---

## 2026-11-24 (creación) · DESKTOP-QQ3KOCN

- Proyecto NestJS 11 creado al lado de `forex-trading-system`. API de **solo lectura** de su Postgres y su Redis.
- Configuración con zod, Postgres en sesión de solo lectura, Redis con XREAD sin grupos, login de un usuario (bcrypt + JWT en cookie), endpoints de datos y canal en vivo por Socket.IO.
- Arreglado durante la prueba de arranque: con Redis caído `/api/health` se colgaba (el cliente de consultas no tenía límite de tiempo). Ahora responde 503 "degradado" en ~1,5 s.
- `@nestjs/config` y `@nestjs/jwt` bajados a 4 y 11 (las 12 son solo-ESM y rompían Jest).
- 11 pruebas pasan. `git init` hecho, sin commits.
- **Siguiente paso:** crear el repo en GitHub, ejecutar `sql/usuario_solo_lectura.sql` en el Postgres de Dokploy, `npm run hash-password`, desplegar y correr `npm run diagnostico` con acceso a la BD real (A1).
