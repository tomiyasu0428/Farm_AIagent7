import { getMongoClient } from '../database/mongodb-client';
import { DailyWorkDocument, PersonalKnowledgeDocument } from '../database/mongodb-client';

/**
 * ハイブリッド検索サービス
 * キーワード検索とベクトル検索を統合
 */
export class HybridSearchService {
  private mongoClient = getMongoClient();

  /**
   * 作業記録のハイブリッド検索
   */
  async searchDailyRecords(params: {
    userId: string;
    query: string;
    fieldId?: string;
    workType?: string;
    dateRange?: { start: Date; end: Date };
    limit?: number;
  }): Promise<{
    records: DailyWorkDocument[];
    searchMetadata: {
      totalFound: number;
      searchMethod: 'keyword' | 'vector' | 'hybrid';
      relevanceScores?: number[];
    };
  }> {
    const { userId, query, fieldId, workType, dateRange, limit = 10 } = params;
    
    try {
      const collection = this.mongoClient.getCollection<DailyWorkDocument>('dailyWork');
      
      // 基本フィルター条件
      const baseFilter: any = { userId };
      if (fieldId) baseFilter.fieldId = fieldId;
      if (workType) baseFilter.workType = workType;
      if (dateRange) {
        baseFilter.date = {
          $gte: dateRange.start,
          $lte: dateRange.end,
        };
      }

      // 1. キーワード検索
      const keywordResults = await collection.find({
        ...baseFilter,
        $text: { $search: query }
      }, {
        score: { $meta: 'textScore' }
      }).sort({ score: { $meta: 'textScore' } }).limit(limit * 2).toArray();

      // 2. ベクトル検索（TODO: 実装予定）
      // const vectorResults = await this.vectorSearch(query, baseFilter, limit);

      // 3. 結果統合（現在はキーワード検索のみ）
      const results = keywordResults.slice(0, limit);

      return {
        records: results,
        searchMetadata: {
          totalFound: results.length,
          searchMethod: 'keyword',
          relevanceScores: results.map(r => (r as any).score || 0),
        },
      };
    } catch (error) {
      console.error('❌ Hybrid search failed:', error);
      throw error;
    }
  }

  /**
   * 個別農場知識のハイブリッド検索
   */
  async searchPersonalKnowledge(params: {
    userId: string;
    farmId: string;
    query: string;
    category?: string;
    minConfidence?: number;
    limit?: number;
  }): Promise<{
    knowledge: PersonalKnowledgeDocument[];
    searchMetadata: {
      totalFound: number;
      avgConfidence: number;
      categories: string[];
    };
  }> {
    const { userId, farmId, query, category, minConfidence = 0.5, limit = 5 } = params;
    
    try {
      const collection = this.mongoClient.getCollection<PersonalKnowledgeDocument>('personalKnowledge');
      
      const filter: any = { 
        farmId, 
        userId,
        confidence: { $gte: minConfidence }
      };
      if (category) filter.category = category;

      // テキスト検索
      const results = await collection.find({
        ...filter,
        $text: { $search: query }
      }, {
        score: { $meta: 'textScore' }
      }).sort({ 
        score: { $meta: 'textScore' },
        confidence: -1,
        lastUsed: -1 
      }).limit(limit).toArray();

      const avgConfidence = results.length > 0 
        ? results.reduce((sum, doc) => sum + doc.confidence, 0) / results.length 
        : 0;

      const categories = [...new Set(results.map(doc => doc.category))];

      return {
        knowledge: results,
        searchMetadata: {
          totalFound: results.length,
          avgConfidence,
          categories,
        },
      };
    } catch (error) {
      console.error('❌ Personal knowledge search failed:', error);
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF)による結果統合
   * TODO: ベクトル検索実装後に統合
   */
  private fuseResults<T>(
    keywordResults: T[],
    vectorResults: T[],
    k: number = 60
  ): T[] {
    // RRFスコア計算とマージロジック
    // 現在は未実装（将来のベクトル検索統合時に実装）
    return keywordResults;
  }

  /**
   * クエリからベクトル埋め込みを生成
   * TODO: OpenAI Embeddings APIとの統合
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // TODO: OpenAI text-embedding-3-small/large API呼び出し
    // 現在はモック実装
    return new Array(1536).fill(0).map(() => Math.random());
  }

  /**
   * 類似記録の推奨
   */
  async findSimilarRecords(params: {
    userId: string;
    referenceRecordId: string;
    limit?: number;
  }): Promise<DailyWorkDocument[]> {
    const { userId, referenceRecordId, limit = 3 } = params;
    
    try {
      const collection = this.mongoClient.getCollection<DailyWorkDocument>('dailyWork');
      
      // 参照記録を取得
      const referenceRecord = await collection.findOne({ 
        userId, 
        recordId: referenceRecordId 
      });
      
      if (!referenceRecord) {
        throw new Error('Reference record not found');
      }

      // 類似条件での検索
      const similarRecords = await collection.find({
        userId,
        recordId: { $ne: referenceRecordId },
        workType: referenceRecord.workType,
        $or: [
          { fieldId: referenceRecord.fieldId },
          { 'result.quality': referenceRecord.result.quality },
          { tags: { $in: referenceRecord.tags } }
        ]
      }).sort({ 
        createdAt: -1 
      }).limit(limit).toArray();

      return similarRecords;
    } catch (error) {
      console.error('❌ Similar records search failed:', error);
      throw error;
    }
  }
}

// シングルトンインスタンス
let hybridSearchService: HybridSearchService | null = null;

export function getHybridSearchService(): HybridSearchService {
  if (!hybridSearchService) {
    hybridSearchService = new HybridSearchService();
  }
  return hybridSearchService;
}

export default HybridSearchService;