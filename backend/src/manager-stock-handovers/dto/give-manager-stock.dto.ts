import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GiveManagerStockItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  givenQty: number;
}

export class GiveManagerStockDto {
  @IsString()
  @IsNotEmpty()
  managerId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GiveManagerStockItemDto)
  items: GiveManagerStockItemDto[];
}
