export interface DashboardSourceCoverage {
  coveredPersonCount: number;
  totalPersonCount: number;
  ratio: number;
}

export interface DashboardStats {
  personCount: number;
  livingPersonCount: number;
  sourceCount: number;
  openIssueCount: number;
  pendingDraftCount: number;
  pendingReviewCount: number;
  sourceCoverage: DashboardSourceCoverage;
}
