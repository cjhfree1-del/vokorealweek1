import type { EvidenceItem } from "../types/analysis";

type BuildEvidenceInput = {
  category: string;
  source: string;
  metric: string;
  value: number;
  confidence: number;
  impactScore: number;
  note: string;
  direction?: "increase_risk" | "decrease_risk";
};

export function buildEvidence(input: BuildEvidenceInput): EvidenceItem {
  return {
    category: input.category,
    source: input.source,
    metric: input.metric,
    value: input.value,
    value_text: `${Math.round(input.value * 100)}%`,
    confidence: input.confidence,
    impact_score: input.impactScore,
    direction: input.direction ?? "increase_risk",
    note: input.note,
  };
}
