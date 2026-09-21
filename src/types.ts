export interface VendorContext {
  vendor_name: string;
  vendor_domain: string;
}

export interface Vendor {
  id: number;
  vendor_name: string;
  vendor_domain: string;
  current_srs_score: number | null;
  current_shodan_score: number | null;
  business_impact?: string;
  pii_record_count?: number;
  spii_record_count?: number;
  sox_record_count?: number;
  [key: string]: unknown;
}

export interface ScoreChange {
  metric: string;
  previous: number;
  current: number;
  delta: number;
}

export interface Classification {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  summary: string;
  recommendation: string;
}

export interface Issue {
  title: string;
  body: string;
  labels: string[];
}

export interface CreatedIssue {
  number: number;
  html_url?: string;
  [key: string]: unknown;
}

export interface Question {
  id: string;
  label: string;
  required?: boolean;
  type: 'radio' | 'select' | 'textarea' | 'number' | 'date' | 'text' | 'skip';
  options?: string[];
}

export interface VendorRecord {
  scores: Record<string, number> | null;
  tickets: Record<string, number>;
}

export interface VendorState {
  vendors: Record<string, VendorRecord>;
}
