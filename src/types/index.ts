/**
 * 統一型定義ファイル
 * プロジェクト全体で使用する型定義を集約
 */

import { ObjectId, Document } from 'mongodb';

// ===========================================
// 基本型定義
// ===========================================

export interface BaseDocument extends Document {
  _id?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ===========================================
// 作業記録関連の型定義
// ===========================================

export interface MaterialType {
  name: string;
  amount: string;
  unit: string;
}

export interface WeatherType {
  condition: string;
  temperature?: number;
  humidity?: number;
}

export interface WorkResultType {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  effectiveness?: 'high' | 'medium' | 'low';
  issues?: string[];
  improvements?: string[];
  satisfaction?: number;
}

export interface DailyWorkRecord {
  recordId: string;
  userId: string;
  fieldId: string;
  date: Date;
  workType: '播種' | '施肥' | '防除' | '中耕' | '収穫' | 'その他';
  description: string;
  materials?: MaterialType[];
  weather?: WeatherType;
  duration?: number;
  workers: number;
  equipment?: string[];
  notes?: string;
  result: WorkResultType;
  followUpNeeded: boolean;
  nextActions?: string[];
  textContent: string;
  tags: string[];
  embedding?: number[];
  embeddingGeneratedAt?: Date;
  embeddingModel?: string;
  embeddingDimensions?: number;
}

export interface DailyWorkDocument extends BaseDocument, DailyWorkRecord {}

// ===========================================
// 個別農場知識関連の型定義
// ===========================================

export interface PersonalKnowledge {
  knowledgeId: string;
  farmId: string;
  userId: string;
  title: string;
  content: string;
  category: 'experience' | 'technique' | 'timing' | 'resource' | 'issue';
  relatedRecords: string[];
  confidence: number;
  frequency: number;
  tags: string[];
  lastUsed: Date;
}

export interface PersonalKnowledgeDocument extends BaseDocument, PersonalKnowledge {}

// ===========================================
// 検索結果関連の型定義
// ===========================================

export interface SearchMetadata {
  totalFound: number;
  searchMethod: 'keyword' | 'vector' | 'hybrid';
  relevanceScores?: number[];
}

export interface PersonalKnowledgeSearchMetadata {
  totalFound: number;
  avgConfidence: number;
  categories: string[];
}

export interface SearchResult<T> {
  records: T[];
  searchMetadata: SearchMetadata;
}

export interface PersonalKnowledgeSearchResult {
  knowledge: PersonalKnowledgeDocument[];
  searchMetadata: PersonalKnowledgeSearchMetadata;
}

// ===========================================
// ツール入力・出力関連の型定義
// ===========================================

export interface RecordDailyWorkInput {
  userId: string;
  fieldId: string;
  workRecord: {
    date: string;
    workType: '播種' | '施肥' | '防除' | '中耕' | '収穫' | 'その他';
    description: string;
    materials?: MaterialType[];
    weather?: WeatherType;
    duration?: number;
    workers: number;
    equipment?: string[];
    notes?: string;
  };
  result: WorkResultType;
  followUpNeeded: boolean;
  nextActions?: string[];
}

export interface RecordDailyWorkOutput {
  recordId: string;
  status: 'success' | 'partial' | 'failed';
  message: string;
  learnings: string[];
  recommendations: string[];
  relatedRecords?: {
    recordId: string;
    date: string;
    similarity: string;
  }[];
}

export interface GetDailyRecordsInput {
  userId: string;
  fieldId?: string;
  workType?: '播種' | '施肥' | '防除' | '中耕' | '収穫' | 'その他';
  dateRange?: {
    start: string;
    end: string;
  };
  quality?: 'excellent' | 'good' | 'fair' | 'poor';
  limit: number;
  includeAnalysis: boolean;
}

export interface GetDailyRecordsOutput {
  userId: string;
  totalRecords: number;
  records: {
    recordId: string;
    fieldName: string;
    date: string;
    workType: string;
    description: string;
    quality: string;
    effectiveness?: string;
    weather?: {
      condition: string;
      temperature?: number;
    };
    materials?: string[];
    notes?: string;
    learnings?: string[];
  }[];
  analysis?: {
    successRate: number;
    commonPatterns: string[];
    bestPractices: string[];
    seasonalTrends: string[];
    improvementAreas: string[];
  };
  recommendations: string[];
}

// ===========================================
// エンベディング関連の型定義
// ===========================================

export interface EmbeddingOptions {
  outputDimensionality: 768 | 1536 | 3072;
  taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT';
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
  tokenCount?: number;
}

// ===========================================
// ハイブリッド検索関連の型定義
// ===========================================

export interface HybridSearchParams {
  userId: string;
  query: string;
  fieldId?: string;
  workType?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  limit?: number;
}

export interface PersonalKnowledgeSearchParams {
  userId: string;
  farmId: string;
  query: string;
  category?: string;
  minConfidence?: number;
  limit?: number;
}

// ===========================================
// LINE関連の型定義
// ===========================================

export interface LineUserProfile {
  userId: string;
  displayName?: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export interface LineMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker';
  text?: string;
  id?: string;
}

export interface LineEvent {
  type: 'message' | 'follow' | 'unfollow' | 'postback' | 'beacon';
  source: {
    type: 'user' | 'group' | 'room';
    userId: string;
    groupId?: string;
    roomId?: string;
  };
  timestamp: number;
  message?: LineMessage;
  postback?: {
    data: string;
    params?: Record<string, any>;
  };
  replyToken?: string;
}

// ===========================================
// データベース関連の型定義
// ===========================================

export interface DatabaseConfig {
  uri: string;
  dbName: string;
  connectionTimeout: number;
  socketTimeout: number;
  maxPoolSize: number;
}

export interface CollectionOptions {
  createIndexes?: boolean;
  validateSchema?: boolean;
}

// ===========================================
// API レスポンス関連の型定義
// ===========================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  metadata?: {
    timestamp: Date;
    requestId?: string;
    version?: string;
  };
}

export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  metadata: {
    timestamp: Date;
    requestId?: string;
  };
}

// ===========================================
// ユーティリティ型定義
// ===========================================

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// ===========================================
// エクスポート用の型ユニオン
// ===========================================

export type WorkType = '播種' | '施肥' | '防除' | '中耕' | '収穫' | 'その他';
export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor';
export type EffectivenessLevel = 'high' | 'medium' | 'low';
export type KnowledgeCategory = 'experience' | 'technique' | 'timing' | 'resource' | 'issue';
export type SearchMethod = 'keyword' | 'vector' | 'hybrid';
export type TaskType = 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT' | 'SEMANTIC_SIMILARITY' | 'CLASSIFICATION' | 'CLUSTERING';
export type EmbeddingDimensions = 768 | 1536 | 3072;