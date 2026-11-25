// Diagnóstico del entorno de ESTA computadora para la API del dashboard.
// No muestra credenciales ni escribe en la BD o Redis.
//
//   npm run diagnostico                 # revisa todo, incluidas las pruebas
//   npm run diagnostico -- --sin-tests  # más rápido
//   npm run diagnostico -- --guardar    # además guarda docs/diagnosticos/<fecha>_<equipo>.md
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { hostname, platform, release } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const secciones = []
const problemas = []
let actual

const seccion = (t) => secciones.push((actual = { titulo: t, lineas: [] }))
const ok = (t) => actual.lineas.push(`- [v] ${t}`)
const info = (t) => actual.lineas.push(`- [i] ${t}`)
const mal = (t) => {
  actual.lineas.push(`- [x] ${t}`)
  problemas.push(t)
}
const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim()
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ sistema
seccion('Sistema')
info(`Equipo: ${hostname()} | ${platform()} ${release()} | Node ${process.version}`)
const [major, minor] = process.versions.node.split('.').map(Number)
if (major > 20 || (major === 20 && minor >= 11)) ok('Node >= 20.11 (NestJS 11)')
else mal(`Node ${process.version} es muy viejo: instala Node 22 LTS`)
existsSync(join(ROOT, 'node_modules')) ? ok('node_modules instalado') : mal('Falta node_modules -> npm install')

// ------------------------------------------------------------------ git
seccion('Git')
const rama = sh('git rev-parse --abbrev-ref HEAD')
if (!rama) info('No es un repositorio git o no hay commits todavía')
else {
  const ultimo = sh('git log -1 --format="%h %s (%cr)"')
  info(`Rama ${rama} | último commit: ${ultimo ?? 'ninguno'}`)
  const sucio = sh('git status --porcelain')
  sucio ? info(`Cambios sin commitear: ${sucio.split('\n').length} archivos`) : ok('Árbol de trabajo limpio')
}

// ------------------------------------------------------------------ .env
seccion('.env (solo se indica si cada variable tiene valor)')
const env = { ...process.env }
const envPath = join(ROOT, '.env')
if (!existsSync(envPath)) mal('No existe .env -> copy .env.example .env y complétalo')
else {
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  const req = ['POSTGRES_HOST', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'REDIS_HOST', 'AUTH_USERNAME', 'AUTH_PASSWORD_HASH_B64', 'JWT_SECRET']
  for (const k of req) {
    const v = env[k]
    if (!v || v.includes('<CAMBIAR>')) mal(`${k}: vacío o sin completar`)
    else ok(`${k}: con valor`)
  }
  if (env.JWT_SECRET && env.JWT_SECRET.length < 32) mal('JWT_SECRET tiene menos de 32 caracteres -> npm run hash-password')
  if (env.AUTH_PASSWORD_HASH_B64 && !env.AUTH_PASSWORD_HASH_B64.includes('<')) {
    const h = Buffer.from(env.AUTH_PASSWORD_HASH_B64, 'base64').toString('utf8')
    ;/^\$2[aby]\$\d{2}\$/.test(h) ? ok('AUTH_PASSWORD_HASH_B64 es un hash bcrypt válido') : mal('AUTH_PASSWORD_HASH_B64 no es un hash bcrypt en base64 -> npm run hash-password')
  }
  if (env.POSTGRES_USER && env.POSTGRES_USER !== 'dashboard_ro')
    info(`POSTGRES_USER no es dashboard_ro: se recomienda el usuario de solo lectura (sql/usuario_solo_lectura.sql)`)
  if (env.NODE_ENV === 'production' && env.COOKIE_SECURE !== 'true') mal('En producción COOKIE_SECURE debe ser true')
}

// ------------------------------------------------------------------ Postgres
seccion('Postgres (solo lectura)')
if (env.POSTGRES_HOST && !String(env.POSTGRES_PASSWORD).includes('<')) {
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT || 5432),
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    ssl: env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on',
  })
  try {
    await client.connect()
    ok(`Conecta a ${env.POSTGRES_HOST}:${env.POSTGRES_PORT || 5432}/${env.POSTGRES_DB}`)
    const ro = (await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only
    ro === 'on' ? ok('Sesión en solo lectura (default_transaction_read_only=on)') : mal('La sesión NO está en solo lectura')
    const v = (await client.query('SELECT MAX(version) AS v FROM schema_version')).rows[0].v
    v >= 4 ? ok(`Esquema del sistema v${v}`) : mal(`Esquema del sistema v${v}: el dashboard espera v4 o más (init_db.py en el sistema)`)
    const priv = (
      await client.query(
        `SELECT has_table_privilege(current_user, 'orders', 'SELECT') AS lee,
                has_table_privilege(current_user, 'orders', 'INSERT') AS escribe,
                has_table_privilege(current_user, 'v_open_positions', 'SELECT') AS vistas`,
      )
    ).rows[0]
    priv.lee && priv.vistas ? ok('Puede leer tablas y vistas') : mal('No puede leer orders o las vistas -> GRANT SELECT (sql/usuario_solo_lectura.sql)')
    priv.escribe ? info('El usuario TIENE permiso de escribir (la sesión igual lo impide). Mejor usar dashboard_ro') : ok('El usuario no tiene permiso de escribir (segunda barrera)')
    const n = (await client.query(`SELECT (SELECT COUNT(*) FROM candles)::int AS velas, (SELECT COUNT(*) FROM model_evaluations)::int AS evals, (SELECT COUNT(*) FROM orders)::int AS ordenes`)).rows[0]
    info(`Datos: ${n.velas} velas, ${n.evals} evaluaciones del modelo, ${n.ordenes} órdenes`)
  } catch (e) {
    mal(`Postgres: ${e.message}`)
  } finally {
    await client.end().catch(() => {})
  }
} else info('Sin datos de Postgres en el .env: no se probó')

// ------------------------------------------------------------------ Redis
seccion('Redis (solo lectura, sin grupos de consumidores)')
if (env.REDIS_HOST) {
  const { Redis } = await import('ioredis')
  const r = new Redis({
    host: env.REDIS_HOST,
    port: Number(env.REDIS_PORT || 6379),
    db: Number(env.REDIS_DB || 0),
    password: env.REDIS_PASSWORD || undefined,
    connectTimeout: 5000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    lazyConnect: true,
  })
  r.on('error', () => {})
  try {
    await r.connect()
    ok(`Responde en ${env.REDIS_HOST}:${env.REDIS_PORT || 6379}`)
    const cuenta = await r.get('state:account')
    cuenta ? ok('state:account presente (el execution-engine está publicando)') : info('Sin state:account: el execution-engine no publica o está apagado')
    for (const s of ['signals:new', 'orders:executed', 'orders:closed', 'risk:alerts']) {
      const n = await r.xlen(s).catch(() => 0)
      info(`Stream ${s}: ${n} mensajes`)
    }
  } catch (e) {
    mal(`Redis: ${e.message}`)
  } finally {
    r.disconnect()
  }
} else info('Sin REDIS_HOST en el .env: no se probó')

// ------------------------------------------------------------------ pruebas
seccion('Pruebas')
if (args.has('--sin-tests')) info('Omitidas (--sin-tests)')
else {
  for (const [nombre, cmd] of [['unitarias', 'npx jest'], ['e2e', 'npx jest --config ./test/jest-e2e.json'], ['lint', 'npx eslint "{src,test}/**/*.ts"'], ['tipos', 'npx tsc --noEmit']]) {
    try {
      const out = execSync(`${cmd} 2>&1`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
      const resumen = out.match(/Tests:\s+.*/)?.[0]
      ok(`${nombre}: ${resumen ?? 'sin errores'}`)
    } catch (e) {
      const out = e.stdout?.toString() ?? ''
      mal(`${nombre}: falla. ${out.match(/Tests:\s+.*/)?.[0] ?? out.split('\n').slice(-3).join(' ').trim()}`)
    }
  }
}

// ------------------------------------------------------------------ salida
const fecha = new Date()
const stamp = fecha.toLocaleDateString('sv-SE') // AAAA-MM-DD en hora local
let md = `# Diagnóstico de entorno - ${hostname()} - ${fecha.toLocaleString('es-EC')}\n\n`
for (const s of secciones) md += `## ${s.titulo}\n\n${s.lineas.join('\n')}\n\n`
md += `## Resumen\n\n${problemas.length ? 'Problemas encontrados:\n' + problemas.map((p) => `1. ${p}`).join('\n') : 'Sin problemas.'}\n`

console.log(md)
if (args.has('--guardar')) {
  const dir = join(ROOT, 'docs', 'diagnosticos')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${stamp}_${hostname()}.md`)
  writeFileSync(file, md)
  console.log(`Guardado en ${file}`)
}
process.exit(problemas.length ? 1 : 0)
