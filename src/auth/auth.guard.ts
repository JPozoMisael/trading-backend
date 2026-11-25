import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { IS_PUBLIC, SESSION_COOKIE } from './auth.constants';

/** Guard global: toda ruta HTTP exige sesión salvo las marcadas con @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true; // el WebSocket valida en su gateway
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const cookies = req.cookies as Record<string, string> | undefined;
    const session = await this.auth.verify(cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('Sesión no válida o vencida');
    (req as Request & { user?: unknown }).user = session;
    return true;
  }
}
