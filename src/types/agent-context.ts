/**
 * エージェント実行コンテキストの型定義
 * Mastra v0.12.0 API互換性とタイプセーフティを提供
 */

// Mastra v0.12.0 互換の基本コンテキスト型
export interface MastraContext {
  userId: string;
  fieldId?: string;
  sessionId?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

// Mastra v0.12.0 互換のランタイムコンテキスト型
export interface MastraRuntimeContext {
  tools?: Record<string, unknown>;
  config?: Record<string, unknown>;
  environment?: 'development' | 'production' | 'test';
}

// ツール実行コンテキスト（Mastra v0.12.0形式）
export interface ToolExecutionParams<T = Record<string, unknown>> {
  context: T;
  runtimeContext?: MastraRuntimeContext;
}

// 日記録ツール専用コンテキスト
export interface DailyRecordToolContext extends MastraContext {
  workRecord: {
    date: string;
    workType: string;
    description: string;
    materials?: Array<{
      name: string;
      amount: string;
      unit: string;
    }>;
    weather?: {
      condition: string;
      temperature?: number;
      humidity?: number;
    };
    duration?: number;
    workers?: number;
    equipment?: string[];
    notes?: string;
  };
  result: {
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    effectiveness?: 'high' | 'medium' | 'low';
    issues?: string[];
    improvements?: string[];
    satisfaction?: number;
  };
  followUpNeeded?: boolean;
  nextActions?: string[];
}

// 天気ツール専用コンテキスト
export interface WeatherToolContext extends MastraContext {
  location: string;
  days?: number;
}

// 圃場情報ツール専用コンテキスト
export interface FieldInfoToolContext extends MastraContext {
  includeHistory?: boolean;
}

// 記録検索ツール専用コンテキスト
export interface RecordSearchToolContext extends MastraContext {
  workType?: string;
  dateRange?: {
    start: string;
    end: string;
  };
  quality?: 'excellent' | 'good' | 'fair' | 'poor';
  limit?: number;
  includeAnalysis?: boolean;
  allowMockData?: boolean;
}

// エージェント間通信用コンテキスト
export interface AgentCommunicationContext {
  sourceAgent: string;
  targetAgent: string;
  operation: string;
  parameters: Record<string, unknown>;
  sessionId: string;
  timestamp: Date;
}

// Default export removed to prevent type/value conflicts