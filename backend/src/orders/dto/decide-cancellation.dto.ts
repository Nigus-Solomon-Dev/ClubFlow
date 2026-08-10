import { IsIn } from 'class-validator';
import { CancellationStatus } from '../../../generated/prisma/client';

const decisions: string[] = [
  CancellationStatus.APPROVED,
  CancellationStatus.REJECTED,
];

export class DecideCancellationDto {
  @IsIn(decisions)
  decision: string;
}
