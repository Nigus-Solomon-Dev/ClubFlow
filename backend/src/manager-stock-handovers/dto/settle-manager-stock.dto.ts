import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SettleManagerStockItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0)
  countedQty: number;
}

export class SettleManagerStockDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettleManagerStockItemDto)
  items: SettleManagerStockItemDto[];
}
