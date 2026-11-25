import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodPipe } from '../common/zod.pipe';
import { Public, SESSION_COOKIE, SessionPayload } from './auth.constants';
import { AuthService } from './auth.service';

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 intentos por minuto e IP
  async login(
    @Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(body.username, body.password);
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return { username: body.username };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    const opts = { ...this.auth.cookieOptions(), maxAge: undefined };
    res.clearCookie(SESSION_COOKIE, opts);
  }

  @Get('me')
  me(@Req() req: Request & { user: SessionPayload }) {
    return { username: req.user.sub };
  }
}
