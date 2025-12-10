import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hldbvjaplojqvchkwlda.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZGJ2amFwbG9qcXZjaGt3bGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2NDczMTIsImV4cCI6MjA3OTIyMzMxMn0.R-_vijM3kx2dIL_DgjRg2iWSUETxZ5aUIkO4msstV-o';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for our database tables
export interface Business {
  id: string;
  title: string;
  tagline: string | null;
  description: string | null;
  full_description: string | null;
  price: number;
  equity_percentage: number;
  status: 'draft' | 'active' | 'sold' | 'archived';
  industry: string | null;
  business_type: string | null;
  target_revenue: string | null;
  time_to_revenue: string | null;
  scalability_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessDocument {
  id: string;
  business_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface BusinessLink {
  id: string;
  business_id: string;
  title: string;
  url: string;
  category: 'reference' | 'competitor' | 'tool' | 'research' | 'other';
  description: string | null;
  created_at: string;
}

export interface BusinessImage {
  id: string;
  business_id: string;
  url: string;
  caption: string | null;
  is_primary: boolean;
  display_order: number;
  created_at: string;
}

export interface BusinessFeature {
  id: string;
  business_id: string;
  feature_text: string;
  icon: string | null;
  display_order: number;
  created_at: string;
}

export interface BusinessPackage {
  id: string;
  business_id: string;
  package_item: string;
  description: string | null;
  is_included: boolean;
  display_order: number;
  created_at: string;
}

export interface BusinessCustomerSegment {
  id: string;
  business_id: string;
  segment_name: string;
  description: string | null;
  created_at: string;
}