import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Role } from '../../generated/prisma/client';

export function roleRoom(role: Role): string {
  return `role:${role}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

@Injectable()
export class RealtimeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emitToRoles(roles: Role[], event: string, payload: unknown): void {
    if (!this.server) return;
    for (const role of roles) {
      this.server.to(roleRoom(role)).emit(event, payload);
    }
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  handleConnection(client: Socket, roles: Role[], userId: string): void {
    for (const role of roles) {
      client.join(roleRoom(role));
    }
    client.join(userRoom(userId));
  }
}
