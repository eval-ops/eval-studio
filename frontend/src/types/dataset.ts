import type { components } from './generated/api';

export type Dataset = components['schemas']['DatasetResponse'];
export type DatasetDetail = components['schemas']['DatasetDetailResponse'];
export type DatasetItem = components['schemas']['DatasetItemResponse'];
export type DatasetItemCreate = components['schemas']['DatasetItemCreate'];
export type FileAnalysisResult = components['schemas']['FileAnalysisResult'];
export type SuggestedMapping = components['schemas']['SuggestedMappingResponse'];
export type AnalyzeResponse = components['schemas']['AnalyzeResponse'];

export interface DatasetItemUpdate {
  question?: string;
  expected_answer?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type DatasetFormat = 'qa_pairs' | 'jsonl' | 'csv';

export interface CreateDatasetRequest {
  name: string;
  description?: string;
  format: DatasetFormat;
  tags?: string[];
  items?: DatasetItemCreate[];
}

export interface FieldMapping {
  question_field: string;
  answer_field: string;
}

export type MergeMode = 'single' | 'separate';

export interface ImportRequest {
  analysis_id: string;
  name: string;
  description?: string;
  tags?: string[];
  mapping: FieldMapping;
  merge_mode: MergeMode;
}

export interface DatasetVersion {
  id: string;
  dataset_id: string;
  created_at: string;
  change_note: string | null;
  item_count: number;
}

export interface DatasetVersionItem {
  id: string;
  question: string;
  expected_answer: string | null;
  metadata: Record<string, unknown> | null;
  order_index: number;
}

export interface DatasetVersionDetail extends DatasetVersion {
  items: DatasetVersionItem[];
}
