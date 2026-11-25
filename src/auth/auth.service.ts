import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';
import { AppConfig } from '../config/app-config.service';
import { SessionPayload } from './auth.constants';

/**
 * Un solo usuario definido en el .env (AUTH_USERNAME + AUTH_PASSWORD_HASH_B64).
 * Cuando haya más usuarios, este servicio es el único lugar que cambia: se
 * reemplaza la comparación por una búsqueda en una tabla propia del dashboard.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string): Promise<string> {
    const expected = Buffer.from(this.config.get('AUTH_USERNAME'));
    const given = Buffer.from(username);
    const userOk =
      expected.length === given.length && timingSafeEqual(expected, given);
    // Siempre se compara la contraseña, exista o no el usuario: mismo tiempo de respuesta.
    const passOk = await bcrypt.compare(
      password,
      this.config.get('AUTH_PASSWORD_HASH_B64'),
    );
    if (!userOk || !passOk) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }
    const payload: SessionPayload = { sub: username };
    return this.jwt.signAsync(payload);
  }

  async verify(token: string | undefined): Promise<SessionPayload | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<SessionPayload>(token);
    } catch {
      return null;
    }
  }

  cookieOptions() {
    return {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict' as const,
      path: '/',
      maxAge: this.config.get('SESSION_HOURS') * 3600 * 1000,
    };
  }
}
