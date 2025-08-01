/**
 * アプリケーション設定管理クラス
 * ハードコードされた値を集約し、設定の一元管理を行う
 */

import { EmbeddingDimensions, TaskType } from '../types';

export class AppConfig {
  // ===========================================
  // エンベディング関連設定
  // ===========================================
  static readonly EMBEDDING = {
    MODEL: 'models/text-embedding-004',
    DEFAULT_DIMENSIONS: 1536 as EmbeddingDimensions,
    AVAILABLE_DIMENSIONS: [768, 1536, 3072] as EmbeddingDimensions[],
    BATCH_SIZE: 5,
    MAX_TEXT_LENGTH: 8000,
    DEFAULT_TASK_TYPE: 'RETRIEVAL_DOCUMENT' as TaskType,
  } as const;

  // ===========================================
  // Gemini関連設定
  // ===========================================
  static readonly GEMINI = {
    MODEL: 'models/gemini-2.5-flash',
    MAX_TOKENS: 8000,
    TEMPERATURE: 0.7,
    TOP_P: 0.9,
    TOP_K: 40,
  } as const;

  // ===========================================
  // データベース関連設定
  // ===========================================
  static readonly DATABASE = {
    DEFAULT_DB: 'agri_assistant',
    CONNECTION_TIMEOUT: 30000,
    SOCKET_TIMEOUT: 45000,
    MAX_POOL_SIZE: 10,
    MIN_POOL_SIZE: 2,
    // コレクション名
    COLLECTIONS: {
      DAILY_WORK: 'dailyWork',
      PERSONAL_KNOWLEDGE: 'personalKnowledge',
      USERS: 'users',
      FARMS: 'farms',
      FIELDS: 'fields',
    },
    // インデックス名
    INDEXES: {
      VECTOR_SEARCH: {
        DAILY_WORK: 'dailyWork_vector_index',
        PERSONAL_KNOWLEDGE: 'personalKnowledge_vector_index',
      },
      TEXT_SEARCH: {
        DAILY_WORK: 'dailyWork_text_index',
        PERSONAL_KNOWLEDGE: 'personalKnowledge_text_index',
      },
    },
  } as const;

  // ===========================================
  // 検索関連設定
  // ===========================================
  static readonly SEARCH = {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 50,
    RRF_K: 60,
    SIMILARITY_THRESHOLD: 0.7,
    MIN_CONFIDENCE: 0.5,
    VECTOR_SEARCH: {
      NUM_CANDIDATES_MULTIPLIER: 5, // limit * この値がnumCandidates
      MAX_NUM_CANDIDATES: 1000,
    },
  } as const;

  // ===========================================
  // LINE関連設定
  // ===========================================
  static readonly LINE = {
    API_VERSION: 'v2',
    MESSAGE_TYPE: {
      TEXT: 'text',
      IMAGE: 'image',
      VIDEO: 'video',
      AUDIO: 'audio',
    },
    MAX_MESSAGE_LENGTH: 5000,
    WEBHOOK_TIMEOUT: 30000,
  } as const;

  // ===========================================
  // ログ関連設定
  // ===========================================
  static readonly LOGGING = {
    LEVEL: process.env.LOG_LEVEL || 'info',
    FORMAT: 'json',
    MAX_LOG_SIZE: '10mb',
    MAX_FILES: 5,
    SENSITIVE_FIELDS: [
      'password',
      'token',
      'key',
      'secret',
      'credential',
      'authorization',
    ],
  } as const;

  // ===========================================
  // セキュリティ関連設定
  // ===========================================
  static readonly SECURITY = {
    BCRYPT_ROUNDS: 12,
    JWT_EXPIRES_IN: '24h',
    RATE_LIMIT: {
      WINDOW_MS: 15 * 60 * 1000, // 15分
      MAX_REQUESTS: 100,
    },
    CORS: {
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      CREDENTIALS: true,
      METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] as const,
    },
  } as const;

  // ===========================================
  // 環境固有設定
  // ===========================================
  static readonly ENVIRONMENT = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3000', 10),
    IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
    IS_PRODUCTION: process.env.NODE_ENV === 'production',
    IS_TEST: process.env.NODE_ENV === 'test',
  } as const;

  // ===========================================
  // パフォーマンス関連設定
  // ===========================================
  static readonly PERFORMANCE = {
    // メモリ使用量制限
    MAX_MEMORY_USAGE: 512 * 1024 * 1024, // 512MB
    // バッチ処理制限
    MAX_BATCH_SIZE: 100,
    // ストリーミング処理のチャンクサイズ
    STREAM_CHUNK_SIZE: 1000,
    // キャッシュ設定
    CACHE: {
      TTL: 300, // 5分
      MAX_SIZE: 1000,
    },
  } as const;

  // ===========================================
  // バリデーション関連設定
  // ===========================================
  static readonly VALIDATION = {
    USER_ID_MIN_LENGTH: 1,
    USER_ID_MAX_LENGTH: 100,
    FIELD_ID_MIN_LENGTH: 1,
    FIELD_ID_MAX_LENGTH: 50,
    DESCRIPTION_MAX_LENGTH: 2000,
    NOTES_MAX_LENGTH: 1000,
    TAGS_MAX_COUNT: 20,
    MATERIALS_MAX_COUNT: 50,
  } as const;

  // ===========================================
  // ヘルパーメソッド
  // ===========================================

  /**
   * 環境変数から設定値を取得（デフォルト値付き）
   */
  static getEnvVar(key: string, defaultValue: string): string {
    return process.env[key] || defaultValue;
  }

  /**
   * 数値型の環境変数を取得
   */
  static getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * ブール型の環境変数を取得
   */
  static getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * 必須環境変数を取得（存在しない場合はエラー）
   */
  static getRequiredEnvVar(key: string): string {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
  }

  /**
   * データベース接続文字列を取得
   */
  static getDatabaseConfig() {
    return {
      uri: this.getRequiredEnvVar('MONGODB_URI'),
      dbName: this.getEnvVar('MONGODB_DATABASE', this.DATABASE.DEFAULT_DB),
      connectionTimeout: this.getEnvNumber('MONGODB_CONNECTION_TIMEOUT', this.DATABASE.CONNECTION_TIMEOUT),
      socketTimeout: this.getEnvNumber('MONGODB_SOCKET_TIMEOUT', this.DATABASE.SOCKET_TIMEOUT),
      maxPoolSize: this.getEnvNumber('MONGODB_MAX_POOL_SIZE', this.DATABASE.MAX_POOL_SIZE),
    };
  }

  /**
   * LINE設定を取得
   */
  static getLineConfig() {
    return {
      channelSecret: this.getRequiredEnvVar('LINE_CHANNEL_SECRET'),
      accessToken: this.getRequiredEnvVar('LINE_CHANNEL_ACCESS_TOKEN'),
    };
  }

  /**
   * Gemini API設定を取得
   */
  static getGeminiConfig() {
    return {
      apiKey: this.getRequiredEnvVar('GOOGLE_API_KEY'),
      model: this.GEMINI.MODEL,
      maxTokens: this.GEMINI.MAX_TOKENS,
    };
  }

  /**
   * 現在の設定をJSON形式で出力（デバッグ用）
   */
  static dumpConfig(): Record<string, unknown> {
    return {
      embedding: this.EMBEDDING,
      gemini: this.GEMINI,
      database: this.DATABASE,
      search: this.SEARCH,
      line: this.LINE,
      logging: this.LOGGING,
      security: this.SECURITY,
      environment: this.ENVIRONMENT,
      performance: this.PERFORMANCE,
      validation: this.VALIDATION,
    };
  }
}

// デフォルトエクスポート
export default AppConfig;