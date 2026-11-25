// Genera AUTH_PASSWORD_HASH_B64 y un JWT_SECRET para el .env / Dokploy.
// Uso: npm run hash-password            (pide la contraseña sin mostrarla)
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(texto)) rl.output.write(s);
    };
    rl.question(texto, (v) => {
      rl.close();
      process.stdout.write('\n');
      resolve(v);
    });
  });
}

const pass = await preguntarOculto('Contraseña del dashboard (mín. 12 caracteres): ');
if (!pass || pass.length < 12) {
  console.error('Muy corta: usa al menos 12 caracteres.');
  process.exit(1);
}
const hash = await bcrypt.hash(pass, 12);
console.log('\nCopia estas líneas a tu .env (y a Dokploy):\n');
console.log(`AUTH_PASSWORD_HASH_B64=${Buffer.from(hash).toString('base64')}`);
console.log(`JWT_SECRET=${randomBytes(48).toString('base64url')}`);
