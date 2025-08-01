import { google } from "@ai-sdk/google";
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
    // 設定検証を実行
    if (!this.validateModelConfig()) {
      throw new Error('Invalid model configuration. Please check your Gemini API settings.');
    }
    
    const model = google(AppConfig.AI.GEMINI.MODEL);
    return model as any;
  }

  /**
   * モデル設定の検証
   */
  static validateModelConfig(): boolean {
    try {
      // 1. モデル名の存在確認
      const modelName = AppConfig.AI.GEMINI.MODEL;
      if (!modelName || typeof modelName !== 'string') {
        console.error('❌ Invalid model name configuration');
        return false;
      }
      
      // 2. API キーの存在確認
      const apiKey = AppConfig.getGeminiConfig().apiKey;
      if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        console.error('❌ Missing or invalid Google API key');
        return false;
      }
      
      // 3. モデルインスタンス生成テスト
      const model = google(modelName);
      if (!model) {
        console.error('❌ Failed to create model instance');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('❌ Model configuration validation failed:', error instanceof Error ? error.message : String(error));
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
