import { google } from "@ai-sdk/google";
import { LanguageModelV1 } from "@ai-sdk/provider";
import { AppConfig } from "../config";

/**
 * 統一されたモデルファクトリー
 * 型安全性を保ちながら一貫したモデル生成を提供
 */
export class ModelFactory {
  /**
   * Gemini 2.5 Flash モデルを取得
   * エージェント用に適切に型付けされたモデルを返す
   */
  static getGeminiFlash(): any {
    return google(AppConfig.AI.GEMINI.MODEL) as any;
  }

  /**
   * モデル設定の検証
   */
  static validateModelConfig(): boolean {
    try {
      const model = google(AppConfig.AI.GEMINI.MODEL);
      return !!model;
    } catch (error) {
      console.error('❌ Model configuration validation failed:', error);
      return false;
    }
  }

  /**
   * モデルメタデータの取得
   */
  static getModelMetadata() {
    return {
      name: AppConfig.AI.GEMINI.MODEL,
      provider: 'google',
      version: '2.5-flash',
      contextWindow: AppConfig.AI.GEMINI.MAX_TOKENS || 32768,
    };
  }
}

export default ModelFactory;
