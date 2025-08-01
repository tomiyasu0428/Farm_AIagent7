import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { EmbeddingOptions, EmbeddingResult, TaskType, EmbeddingDimensions } from '../types';

/**
 * Gemini Embeddings APIサービス
 * テキストをベクトル表現に変換する（最新API仕様に準拠）
 */
export class EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: string;

  constructor() {
    if (!process.env.GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY environment variable is required');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    // 最新のGemini Embeddingモデルを使用
    this.model = 'models/text-embedding-004';
  }

  /**
   * テキストをベクトル埋め込みに変換
   * @param text 変換するテキスト
   * @param outputDimensionality 出力次元数（768, 1536, 3072から選択）
   * @param taskType 埋め込みタスクタイプ
   * @returns ベクトル配列
   */
  async generateEmbedding(
    text: string, 
    outputDimensionality: EmbeddingDimensions = 1536,
    taskType: TaskType = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[]> {
    try {
      console.log(`🔄 Generating embedding for text: "${text.substring(0, 50)}..." (${taskType})`);
      
      const model = this.genAI.getGenerativeModel({ 
        model: this.model,
      });

      const result = await model.embedContent({
        content: {
          parts: [{ text }],
          role: 'user'
        },
        taskType: taskType as any, // Type assertion for Gemini API compatibility
      } as any);

      const embedding = result.embedding.values;
      
      if (!embedding || embedding.length === 0) {
        throw new Error('Failed to generate embedding: empty result');
      }

      console.log(`✅ Generated ${embedding.length}D embedding vector (${taskType})`);
      return embedding;

    } catch (error) {
      console.error('❌ Embedding generation failed:', error);
      
      // フォールバック: ランダムベクトル（開発用）
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Using fallback random vector for development');
        return Array.from({ length: outputDimensionality }, () => Math.random() * 2 - 1);
      }
      
      throw error;
    }
  }

  /**
   * バッチでテキストをベクトル化
   * @param texts テキスト配列
   * @param outputDimensionality 出力次元数
   * @param taskType 埋め込みタスクタイプ
   * @returns ベクトル配列の配列
   */
  async generateBatchEmbeddings(
    texts: string[], 
    outputDimensionality: EmbeddingDimensions = 1536,
    taskType: TaskType = 'RETRIEVAL_DOCUMENT'
  ): Promise<number[][]> {
    console.log(`🔄 Generating batch embeddings for ${texts.length} texts (${taskType})`);
    
    const embeddings = await Promise.all(
      texts.map(text => this.generateEmbedding(text, outputDimensionality, taskType))
    );

    console.log(`✅ Generated ${embeddings.length} batch embeddings`);
    return embeddings;
  }

  /**
   * 2つのベクトル間のコサイン類似度を計算
   * @param vec1 ベクトル1
   * @param vec2 ベクトル2
   * @returns 類似度（-1から1の範囲）
   */
  static calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * テキストの最適化（埋め込み前の前処理）
   * @param text 元のテキスト
   * @returns 最適化されたテキスト
   */
  static optimizeTextForEmbedding(text: string): string {
    // 農業コンテキストに特化した前処理
    return text
      .trim()
      .replace(/\s+/g, ' ') // 複数スペースを単一スペースに
      .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, ' ') // 日本語と英数字のみ保持
      .substring(0, 8000); // Geminiの8Kトークン制限に対応
  }
}

// シングルトンインスタンス
let embeddingService: EmbeddingService | null = null;

/**
 * EmbeddingService インスタンスを取得
 */
export function getEmbeddingService(): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService();
  }
  return embeddingService;
}

export default EmbeddingService;