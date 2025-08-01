/**
 * 統一エラーハンドリングサービス
 * アプリケーション全体で一貫したエラー処理を提供
 */

import { AppConfig } from '../config';

// エラーレベル定義
export enum ErrorLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// エラーカテゴリ定義
export enum ErrorCategory {
  DATABASE = 'database',
  API = 'api',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  EMBEDDING = 'embedding',
  AGENT = 'agent',
  LINE = 'line',
  SYSTEM = 'system',
}

// 構造化エラー情報
export interface ErrorInfo {
  code: string;
  message: string;
  level: ErrorLevel;
  category: ErrorCategory;
  details?: Record<string, unknown>;
  timestamp: Date;
  userId?: string;
  sessionId?: string;
}

// エラーレスポンス
export interface ErrorResponse {
  error: boolean;
  code: string;
  message: string;
  userMessage?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * アプリケーション用カスタムエラークラス
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly level: ErrorLevel;
  public readonly category: ErrorCategory;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: Date;
  public readonly userId?: string;
  public readonly sessionId?: string;

  constructor(
    message: string,
    code: string,
    level: ErrorLevel = ErrorLevel.MEDIUM,
    category: ErrorCategory = ErrorCategory.SYSTEM,
    details?: Record<string, unknown>,
    userId?: string,
    sessionId?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.level = level;
    this.category = category;
    this.details = details;
    this.timestamp = new Date();
    this.userId = userId;
    this.sessionId = sessionId;

    // スタックトレースを適切に設定
    Error.captureStackTrace(this, AppError);
  }

  toJSON(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      level: this.level,
      category: this.category,
      details: this.details,
      timestamp: this.timestamp,
      userId: this.userId,
      sessionId: this.sessionId,
    };
  }
}

/**
 * エラーハンドリングサービス
 */
export class ErrorHandler {
  /**
   * エラーを安全にログ出力（機密情報をマスク）
   */
  static logError(error: Error | AppError, context?: Record<string, unknown>): void {
    const sanitizedError = this.sanitizeError(error);
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: error instanceof AppError ? error.level : ErrorLevel.MEDIUM,
      category: error instanceof AppError ? error.category : ErrorCategory.SYSTEM,
      message: sanitizedError.message,
      code: error instanceof AppError ? error.code : 'UNKNOWN_ERROR',
      stack: AppConfig.ENVIRONMENT.IS_DEVELOPMENT ? error.stack : undefined,
      context: context ? this.sanitizeContext(context) : undefined,
    };

    if (error instanceof AppError && error.level === ErrorLevel.CRITICAL) {
      console.error('🚨 CRITICAL ERROR:', JSON.stringify(logEntry, null, 2));
    } else if (error instanceof AppError && error.level === ErrorLevel.HIGH) {
      console.error('❌ HIGH PRIORITY ERROR:', JSON.stringify(logEntry, null, 2));
    } else {
      console.error('⚠️  ERROR:', JSON.stringify(logEntry, null, 2));
    }
  }

  /**
   * エラーを統一フォーマットでレスポンスに変換
   */
  static createErrorResponse(
    error: Error | AppError,
    userFriendlyMessage?: string
  ): ErrorResponse {
    const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
    const message = this.sanitizeError(error).message;
    
    return {
      error: true,
      code,
      message,
      userMessage: userFriendlyMessage || this.getUserFriendlyMessage(error),
      details: error instanceof AppError && AppConfig.ENVIRONMENT.IS_DEVELOPMENT 
        ? error.details : undefined,
      timestamp: new Date(),
    };
  }

  /**
   * データベースエラーを適切に処理
   */
  static handleDatabaseError(error: unknown, operation: string, userId?: string): AppError {
    // 安全な型キャスト
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const sanitizedMessage = this.sanitizeError(errorObj).message;
    
    if (sanitizedMessage.includes('duplicate key')) {
      return new AppError(
        'Duplicate entry detected',
        'DB_DUPLICATE_KEY',
        ErrorLevel.MEDIUM,
        ErrorCategory.DATABASE,
        { operation },
        userId
      );
    }
    
    if (sanitizedMessage.includes('connection')) {
      return new AppError(
        'Database connection failed',
        'DB_CONNECTION_ERROR',
        ErrorLevel.HIGH,
        ErrorCategory.DATABASE,
        { operation },
        userId
      );
    }
    
    return new AppError(
      `Database operation failed: ${operation}`,
      'DB_OPERATION_ERROR',
      ErrorLevel.MEDIUM,
      ErrorCategory.DATABASE,
      { operation, originalMessage: sanitizedMessage },
      userId
    );
  }

  /**
   * Mastraエージェントエラーを適切に処理
   */
  static handleAgentError(error: unknown, agentName: string, operation: string, userId?: string): AppError {
    // 安全な型キャスト
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const sanitizedMessage = this.sanitizeError(errorObj).message;
    
    return new AppError(
      `Agent ${agentName} operation failed: ${operation}`,
      'AGENT_OPERATION_ERROR',
      ErrorLevel.MEDIUM,
      ErrorCategory.AGENT,
      { agentName, operation, originalMessage: sanitizedMessage },
      userId
    );
  }

  /**
   * エンベディング生成エラーを適切に処理
   */
  static handleEmbeddingError(error: unknown, text: string, userId?: string): AppError {
    // 安全な型キャスト
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const sanitizedMessage = this.sanitizeError(errorObj).message;
    
    return new AppError(
      'Embedding generation failed',
      'EMBEDDING_ERROR',
      ErrorLevel.MEDIUM,
      ErrorCategory.EMBEDDING,
      { textLength: text.length, originalMessage: sanitizedMessage },
      userId
    );
  }

  /**
   * LINEメッセージ処理エラーを適切に処理
   */
  static handleLineError(error: unknown, messageType: string, userId?: string): AppError {
    // 安全な型キャスト
    const errorObj = error instanceof Error ? error : new Error(String(error));
    const sanitizedMessage = this.sanitizeError(errorObj).message;
    
    return new AppError(
      `LINE message processing failed: ${messageType}`,
      'LINE_MESSAGE_ERROR',
      ErrorLevel.MEDIUM,
      ErrorCategory.LINE,
      { messageType, originalMessage: sanitizedMessage },
      userId
    );
  }

  /**
   * エラーから機密情報を除去
   * 安全なエラー処理とユーザーフレンドリーなメッセージを提供
   */
  private static sanitizeError(error: Error): { message: string; stack?: string } {
    // 入力検証
    if (!error || typeof error !== 'object') {
      return { message: 'Unknown error occurred' };
    }
    
    let message = error.message || 'Unknown error occurred';
    let stack = error.stack;

    // 機密情報のパターンを除去
    AppConfig.LOGGING.SENSITIVE_FIELDS.forEach(field => {
      const patterns = [
        new RegExp(`${field}[=:]\\s*[^\\s&]+`, 'gi'),
        new RegExp(`"${field}"\\s*:\\s*"[^"]+"`, 'gi'),
        new RegExp(`'${field}'\\s*:\\s*'[^']+'`, 'gi'),
      ];
      
      patterns.forEach(pattern => {
        message = message.replace(pattern, `${field}=***`);
        if (stack) {
          stack = stack.replace(pattern, `${field}=***`);
        }
      });
    });

    // より包括的な機密情報パターンの除去
    const sensitivePatterns = [
      /mongodb\+srv:\/\/[^@\/\s]+@/gi,           // MongoDB接続文字列
      /postgresql:\/\/[^@\/\s]+@/gi,            // PostgreSQL接続文字列
      /mysql:\/\/[^@\/\s]+@/gi,                 // MySQL接続文字列
      /['"]?[A-Za-z0-9_-]{32,}['"]?/g,          // APIキーらしき長い文字列
      /Bearer\s+[A-Za-z0-9_-]+/gi,              // Bearerトークン
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g // クレジットカードらしき数字
    ];
    
    sensitivePatterns.forEach(pattern => {
      message = message.replace(pattern, '***');
      if (stack) {
        stack = stack.replace(pattern, '***');
      }
    });

    return { message, stack };
  }

  /**
   * コンテキスト情報から機密情報を除去
   */
  private static sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    
    Object.entries(context).forEach(([key, value]) => {
      if (AppConfig.LOGGING.SENSITIVE_FIELDS.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      )) {
        sanitized[key] = '***';
      } else if (typeof value === 'string' && value.length > 200) {
        // 長い文字列は切り詰め
        sanitized[key] = value.substring(0, 200) + '...';
      } else {
        sanitized[key] = value;
      }
    });
    
    return sanitized;
  }

  /**
   * ユーザーフレンドリーなエラーメッセージを生成
   * 内部詳細を露出せず、ユーザーにとって有用な情報を提供
   */
  private static getUserFriendlyMessage(error: Error | AppError): string {
    if (error instanceof AppError) {
      // エラーレベルに基づいたメッセージ調整
      const isCritical = error.level === ErrorLevel.CRITICAL || error.level === ErrorLevel.HIGH;
      const urgencyPrefix = isCritical ? '緊急: ' : '';
      
      switch (error.category) {
        case ErrorCategory.DATABASE:
          return `${urgencyPrefix}データベースの処理中にエラーが発生しました。${isCritical ? '管理者にお問い合わせください。' : 'しばらく時間をおいて再度お試しください。'}`;
        case ErrorCategory.AGENT:
          return `${urgencyPrefix}AI処理中にエラーが発生しました。再度お試しください。`;
        case ErrorCategory.EMBEDDING:
          return 'テキスト解析中にエラーが発生しました。文章を短くして再度お試しください。';
        case ErrorCategory.LINE:
          return 'LINEメッセージの処理中にエラーが発生しました。再度お送りください。';
        case ErrorCategory.VALIDATION:
          return '入力内容に問題があります。内容を確認して再度お試しください。';
        case ErrorCategory.API:
          return '外部サービスとの通信でエラーが発生しました。しばらく時間をおいて再度お試しください。';
        case ErrorCategory.AUTHENTICATION:
          return '認証エラーが発生しました。ログインし直してください。';
        default:
          return `${urgencyPrefix}システムエラーが発生しました。${isCritical ? '管理者にお問い合わせください。' : 'しばらく時間をおいて再度お試しください。'}`;
      }
    }
    
    // AppErrorではない一般的なエラーの場合
    return '予期しないエラーが発生しました。しばらく時間をおいて再度お試しください。';
  }

  /**
   * 非同期処理のエラーを安全にキャッチ
   */
  static async safeAsync<T>(
    asyncFn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
    try {
      const data = await asyncFn();
      return { success: true, data };
    } catch (error) {
      const appError = error instanceof AppError 
        ? error 
        : new AppError(
            error instanceof Error ? error.message : 'Unknown async error',
            'ASYNC_ERROR',
            ErrorLevel.MEDIUM,
            ErrorCategory.SYSTEM
          );
      
      this.logError(appError, context);
      return { success: false, error: appError };
    }
  }
}

export default ErrorHandler;