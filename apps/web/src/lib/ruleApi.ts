import { api } from "./api";

export interface SerializedRule {
  ruleId: string;
  ruleNumber: string;
  subRule?: string;
  version: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  scope: string;
  title: string;
  conditions: { description: string }[];
  exceptions: string[];
  source: string;
  status: "ACTIVE" | "SUPERSEDED" | "WITHDRAWN" | "NOT_YET_IMPLEMENTED";
  notes?: string;
  automation?: string;
}

export async function getRules(): Promise<SerializedRule[]> {
  const { data } = await api.get<{ data: SerializedRule[] }>("/rules");
  return data.data;
}

export async function getRule(ruleId: string): Promise<SerializedRule> {
  const { data } = await api.get<{ data: SerializedRule }>(`/rules/${ruleId}`);
  return data.data;
}
