import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Subscription } from 'rxjs';
import type { Server, Socket } from 'socket.io';
import { SESSION_COOKIE } from '../auth/auth.constants';
import { AuthService } from '../auth/auth.service';
import { StreamReaderService } from './stream-reader.service';

function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/**
 * Eventos en vivo para el navegador (solo servidor -> cliente).
 * Exige la misma cookie de sesión que la API; sin ella, desconecta.
 */
@WebSocketGateway({ namespace: '/live', path: '/socket.io', cors: false })
export class LiveGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  private readonly log = new Logger(LiveGateway.name);
  private sub?: Subscription;
  @WebSocketServer() server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly reader: StreamReaderService,
  ) {}

  afterInit() {
    this.sub = this.reader.events$.subscribe(({ event, data }) =>
      this.server.emit(event, data),
    );
  }

  async handleConnection(client: Socket) {
    const token = readCookie(client.handshake.headers.cookie, SESSION_COOKIE);
    const session = await this.auth.verify(token);
    if (!session) {
      client.emit('auth:error', 'Sesión no válida');
      client.disconnect(true);
      return;
    }
    this.log.debug(`Cliente en vivo conectado (${session.sub})`);
  }

  onModuleDestroy() {
    this.sub?.unsubscribe();
  }
}
