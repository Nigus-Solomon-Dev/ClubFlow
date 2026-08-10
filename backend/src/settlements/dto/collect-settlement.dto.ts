import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CollectEntry {
  @IsString()
  employeeId: string;

  @IsOptional()
  @IsNumber()
  collected?: number;
}

export class CollectSettlementDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectEntry)
  entries: CollectEntry[];
}