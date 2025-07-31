import { getMongoClient } from '../database/mongodb-client';
import { DailyWorkDocument, PersonalKnowledgeDocument } from '../database/mongodb-client';
import { getEmbeddingService, EmbeddingService } from './embedding-service';

/**
 * ハイブリッド検索サービス
 * キーワード検索とベクトル検索を統合
 */
export class HybridSearchService {
  private mongoClient = getMongoClient();
  private embeddingService = getEmbeddingService();

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

      // 2. ベクトル検索
      let vectorResults: DailyWorkDocument[] = [];
      try {
        vectorResults = await this.vectorSearchDailyWork(query, baseFilter, limit);
      } catch (error) {
        console.log('⚠️  Vector search not available, using keyword search only:', error.message);
      }

      // 3. 結果統合（ハイブリッド検索）
      let results: DailyWorkDocument[];
      let searchMethod: 'keyword' | 'vector' | 'hybrid';

      if (vectorResults.length > 0 && keywordResults.length > 0) {
        // ハイブリッド：両方の結果をRRFで統合
        results = this.fuseResults(keywordResults, vectorResults, 60).slice(0, limit);
        searchMethod = 'hybrid';
      } else if (vectorResults.length > 0) {
        // ベクトル検索のみ
        results = vectorResults.slice(0, limit);
        searchMethod = 'vector';
      } else {
        // キーワード検索のみ
        results = keywordResults.slice(0, limit);
        searchMethod = 'keyword';
      }

      return {
        records: results,
        searchMetadata: {
          totalFound: results.length,
          searchMethod,
          relevanceScores: results.map(r => (r as any).score || (r as any).vectorScore || 0),
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
   */
  private fuseResults<T extends { _id?: any }>(
    keywordResults: T[],
    vectorResults: T[],
    k: number = 60
  ): T[] {
    // 各結果にスコアを付与
    const keywordScores = new Map<string, number>();
    const vectorScores = new Map<string, number>();
    
    keywordResults.forEach((result, index) => {
      const id = result._id?.toString() || `keyword_${index}`;
      keywordScores.set(id, 1 / (k + index + 1));
    });
    
    vectorResults.forEach((result, index) => {
      const id = result._id?.toString() || `vector_${index}`;
      vectorScores.set(id, 1 / (k + index + 1));
    });
    
    // 全ユニーク結果を取得
    const allResults = new Map<string, T>();
    keywordResults.forEach(result => {
      const id = result._id?.toString() || JSON.stringify(result);
      allResults.set(id, result);
    });
    vectorResults.forEach(result => {
      const id = result._id?.toString() || JSON.stringify(result);
      allResults.set(id, result);
    });
    
    // RRFスコア計算
    const scoredResults = Array.from(allResults.entries()).map(([id, result]) => {
      const keywordScore = keywordScores.get(id) || 0;
      const vectorScore = vectorScores.get(id) || 0;
      const fusedScore = keywordScore + vectorScore;
      
      return {
        result,
        score: fusedScore,
      };
    });
    
    // スコア順にソート
    scoredResults.sort((a, b) => b.score - a.score);
    
    return scoredResults.map(item => item.result);
  }

  /**
   * 作業記録のベクトル検索
   */
  private async vectorSearchDailyWork(
    query: string, 
    baseFilter: any, 
    limit: number
  ): Promise<DailyWorkDocument[]> {
    try {
      // クエリをベクトル化（検索クエリ用のタスクタイプを使用）
      const optimizedQuery = EmbeddingService.optimizeTextForEmbedding(query);
      const queryVector = await this.embeddingService.generateEmbedding(
        optimizedQuery, 
        1536, 
        'RETRIEVAL_QUERY'
      );

      const collection = this.mongoClient.getCollection<DailyWorkDocument>('dailyWork');

      // MongoDB Atlas Vector Search
      // 注意: Atlas Vector Searchインデックスが設定されている必要があります
      const vectorResults = await collection.aggregate([
        {
          $vectorSearch: {
            index: "dailyWork_vector_index", // Atlas UIで作成するインデックス名
            path: "embedding",
            queryVector: queryVector,
            numCandidates: limit * 5,
            limit: limit,
            filter: baseFilter
          }
        },
        {
          $addFields: {
            vectorScore: { $meta: "vectorSearchScore" }
          }
        }
      ]).toArray();

      return vectorResults as DailyWorkDocument[];

    } catch (error) {
      console.log('Vector search failed, falling back to keyword search:', error.message);
      return [];
    }
  }

  /**
   * クエリからベクトル埋め込みを生成
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return await this.embeddingService.generateEmbedding(text, 1536, 'RETRIEVAL_QUERY');
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