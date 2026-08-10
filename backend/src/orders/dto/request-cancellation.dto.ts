import { IsOptional, IsString } from 'class-validator';

export class RequestCancellationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
