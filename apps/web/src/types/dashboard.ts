export interface DashboardSummary {
  totalInspections: number;
  compliant: number;
  nonCompliant: number;
  reviewRequired: number;
  openViolations: number;
}

export interface RecentInspection {
  id: string;
  inspectionNumber: string;
  status: string;
  overallResult: string | null;
  isDemo?: boolean;
  product: string | null;
  inspector: string | null;
  createdAt: string;
}

export interface DashboardViolation {
  id: string;
  ruleId: string;
  category: string;
  status: string;
  description: string;
  date: string;
  product: string | null;
  productCategory: string | null;
  inspectionNumber: string;
  inspectionId: string;
}

export interface Trends {
  inspectionOutcomes: Array<{ month: string; total: number; compliant: number; nonCompliant: number; reviewRequired: number }>;
  violationsByRule: Array<{ ruleId: string; count: number }>;
  violationsByCategory: Array<{ category: string; count: number }>;
  reviewRate: number | null;
  commonMissingDeclarations: Array<{ ruleId: string; count: number }>;
}

export interface HistoryResponse {
  items: Array<{
    id: string;
    inspectionNumber: string;
    status: string;
    overallResult: string | null;
    inspectionDate: string;
    location: string | null;
    createdAt: string;
    product: { id: string; name: string; brand: string | null; category: string | null } | null;
    inspector: { id: string; name: string } | null;
    _count: { violations: number };
    isDemo?: boolean;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ProductsResponse {
  items: Array<{
    id: string;
    name: string;
    brand: string | null;
    genericName: string | null;
    manufacturer: string | null;
    category: string | null;
    _count: { inspections: number };
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
