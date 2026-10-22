import type { DashboardStats } from '../../../../shared/src/types/dashboard.ts';
import { getPrisma } from '../../lib/prisma.ts';

interface CountRow {
  count: bigint | number;
}

function toRatio(covered: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number((covered / total).toFixed(4));
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const prisma = getPrisma();

  const [
    personCount,
    livingPersonCount,
    sourceCount,
    openIssueCount,
    pendingDraftCount,
    pendingReviewCount,
    coverageRows,
  ] = await Promise.all([
    prisma.person.count({ where: { status: 'ACTIVE' } }),
    prisma.person.count({
      where: { status: 'ACTIVE', livingStatus: 'LIVING' },
    }),
    prisma.source.count(),
    prisma.consistencyIssue.count({ where: { status: 'OPEN' } }),
    prisma.aiDraft.count({ where: { status: 'PENDING' } }),
    prisma.reviewRequest.count({ where: { status: 'PENDING' } }),
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(DISTINCT c."targetId") AS "count"
      FROM "Citation" c
      JOIN "Person" p ON p."id" = c."targetId"
      WHERE c."targetType" = 'PERSON' AND p."status" = 'ACTIVE'
    `,
  ]);

  const coveredPersonCount = Number(coverageRows[0]?.count ?? 0);

  return {
    personCount,
    livingPersonCount,
    sourceCount,
    openIssueCount,
    pendingDraftCount,
    pendingReviewCount,
    sourceCoverage: {
      coveredPersonCount,
      totalPersonCount: personCount,
      ratio: toRatio(coveredPersonCount, personCount),
    },
  };
}
