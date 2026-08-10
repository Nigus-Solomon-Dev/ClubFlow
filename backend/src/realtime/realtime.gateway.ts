import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Role } from '../../generated/prisma/client';
import { RealtimeService } from './realtime.service';

interface HandshakeToken {
  sub: string;
  role: Role;
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
@Injectable()
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
  ) {}

  afterInit(server: Server): void {
    this.realtime.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<HandshakeToken>(token);
      this.realtime.handleConnection(client, [payload.role], payload.sub);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(): void {
    // Rooms are cleaned up automatically when sockets disconnect.
  }
}