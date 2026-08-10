import { IsIn } from 'class-validator';
import { EditRequestStatus } from '../../../generated/prisma/client';

const decisions: string[] = [
  EditRequestStatus.APPROVED,
  EditRequestStatus.REJECTED,
];

export class DecideEditDto {
  @IsIn(decisions)
  decision: string;
}
