import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsOptional()
  @IsString()
  sellingUnitId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
