import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { Role } from '../../../generated/prisma/client';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsEnum(Role)
  role?: Role;
}
