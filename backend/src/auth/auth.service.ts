import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/client';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export const REFRESH_JWT_SERVICE = 'REFRESH_JWT_SERVICE';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(REFRESH_JWT_SERVICE) private readonly refreshJwt: JwtService,
  ) {}

  async register(dto: RegisterDto, actorRole: string): Promise<AuthResponse> {
    if (dto.role === Role.OWNER && actorRole !== Role.OWNER) {
      throw new ForbiddenException('Only an OWNER can create an OWNER account');
    }

    const exists = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (exists) {
      throw new ConflictException('Phone number is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        passwordHash,
        role: dto.role ?? 'WAITER',
      },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid phone or password');
    }

    await this.logActivity(user.id, 'auth.login', 'User', user.id);
    return this.buildAuthResponse(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    let payload: { sub: string };
    try {
      payload = await this.refreshJwt.verifyAsync<{ sub: string }>(
        refreshToken,
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || !user.refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const matches = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.buildAuthResponse(user);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    await this.logActivity(userId, 'auth.logout', 'User', userId);
  }

  private async logActivity(
    userId: string,
    action: string,
    entity?: string,
    entityId?: string,
    details?: unknown,
  ) {
    await this.prisma.activityLog.create({
      data: { userId, action, entity, entityId, details: details as never },
    });
  }

  private async buildAuthResponse(user: {
    id: string;
    name: string;
    phone: string;
    role: string;
  }): Promise<AuthResponse> {
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      phone: user.phone,
      role: user.role,
    });
    const refreshToken = await this.refreshJwt.signAsync({ sub: user.id });
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    };
  }
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserAuthInfo;
}

export interface UserAuthInfo {
  id: string;
  name: string;
  phone: string;
  role: string;
}
