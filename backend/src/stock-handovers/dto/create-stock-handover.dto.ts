import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockHandoverItemInputDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(0.0001)
  givenQty: number;
}

export class CreateStockHandoverDto {
  @IsString()
  @IsNotEmpty()
  barmanId: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StockHandoverItemInputDto)
  items: StockHandoverItemInputDto[];
}
