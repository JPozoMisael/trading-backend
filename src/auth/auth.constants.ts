import { SetMetadata } from '@nestjs/common';

export const SESSION_COOKIE = 'td_session';

export const IS_PUBLIC = 'isPublic';
/** Marca una ruta como accesible sin sesión (login y health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface SessionPayload {
  sub: string;
}
