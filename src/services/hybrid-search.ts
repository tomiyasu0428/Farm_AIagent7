import { getMongoClient } from '../database/mongodb-client';
import { DailyWorkDocument, PersonalKnowledgeDocument, HybridSearchParams, PersonalKnowledgeSearchParams, SearchResult, PersonalKnowledgeSearchResult } from '../types';
import { getEmbeddingService, EmbeddingService } from './embedding-service';
import { AppConfig } from '../config';

/**
 * ハイブリッド検索サービス
 * キーワード検索とベクトル検索を統合
 */
export class HybridSearchService {
  private mongoClient: MongoDBClient | null = null;
  private embeddingService: EmbeddingService | null = null;
  
  private getClient(): MongoDBClient {
    if (!this.mongoClient) {
      this.mongoClient = getMongoClient();
    }
    return this.mongoClient;
  }
  
  private getEmbeddingService(): EmbeddingService {
    if (!this.embeddingService) {
      this.embeddingService = getEmbeddingService();
    }
    return this.embeddingService;
  }

  /**
   * 作業記録のハイブリッド検索
   */
  async searchDailyRecords(params: HybridSearchParams): Promise<SearchResult<DailyWorkDocument>> {
    const { userId, query, fieldId, workType, dateRange, limit = AppConfig.SEARCH.DEFAULT_LIMIT } = params;
    
    try {
      const collection = this.mongoClient.getCollection<DailyWorkDocument>(AppConfig.DATABASE.COLLECTIONS.DAILY_WORK);
      
      // 基本フィルター条件
      const baseFilter: Record<string, unknown> = { userId };
      if (fieldId) baseFilter.fieldId = fieldId;
      if (workType) baseFilter.workType = workType;
      if (dateRange) {
        baseFilter.date = {
          $gte: dateRange.start,
          $lte: dateRange.end,
        };
      }

      // 1. キーワード検索
      let keywordResults: DailyWorkDocument[] = [];
      try {
        keywordResults = await collection.find({
          ...baseFilter,
          $text: { $search: query }
        }, {
          score: { $meta: 'textScore' }
        }).sort({ score: { $meta: 'textScore' } }).limit(limit * 2).toArray();
      } catch (error: any) {
        if (error.code === 27 || error.codeName === 'IndexNotFound') {
          console.warn('⚠️  Text index not found, falling back to basic text search');
          // フォールバック: 基本的な正規表現検索
          keywordResults = await collection.find({
            ...baseFilter,
            $or: [
              { description: { $regex: query, $options: 'i' } },
              { notes: { $regex: query, $options: 'i' } },
              { textContent: { $regex: query, $options: 'i' } }
            ]
          }).limit(limit * 2).toArray();
        } else {
          throw error;
        }
      }

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
        results = this.fuseResults(keywordResults, vectorResults, AppConfig.SEARCH.RRF_K).slice(0, limit);
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
  async searchPersonalKnowledge(params: PersonalKnowledgeSearchParams): Promise<PersonalKnowledgeSearchResult> {
    const { userId, farmId, query, category, minConfidence = AppConfig.SEARCH.MIN_CONFIDENCE, limit = 5 } = params;
    
    try {
      const collection = this.mongoClient.getCollection<PersonalKnowledgeDocument>(AppConfig.DATABASE.COLLECTIONS.PERSONAL_KNOWLEDGE);
      
      const filter: Record<string, unknown> = { 
        farmId, 
        userId,
        confidence: { $gte: minConfidence }
      };
      if (category) filter.category = category;

      // テキスト検索
      let results: PersonalKnowledgeDocument[] = [];
      try {
        results = await collection.find({
          ...filter,
          $text: { $search: query }
        }, {
          score: { $meta: 'textScore' }
        }).sort({ 
          score: { $meta: 'textScore' },
          confidence: -1,
          lastUsed: -1 
        }).limit(limit).toArray();
      } catch (error: any) {
        if (error.code === 27 || error.codeName === 'IndexNotFound') {
          console.warn('⚠️  Text index not found on personalKnowledge collection, using basic search');
          // フォールバック: 基本的な正規表現検索
          results = await collection.find({
            ...filter,
            $or: [
              { title: { $regex: query, $options: 'i' } },
              { content: { $regex: query, $options: 'i' } }
            ]
          }).sort({ 
            confidence: -1,
            lastUsed: -1 
          }).limit(limit).toArray();
        } else {
          throw error;
        }
      }

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
  private fuseResults<T extends { _id?: unknown }>(
    keywordResults: T[],
    vectorResults: T[],
    k: number = AppConfig.SEARCH.RRF_K
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
    baseFilter: Record<string, unknown>, 
    limit: number
  ): Promise<DailyWorkDocument[]> {
    try {
      // クエリをベクトル化（検索クエリ用のタスクタイプを使用）
      const optimizedQuery = EmbeddingService.optimizeTextForEmbedding(query);
      const queryVector = await this.embeddingService.generateEmbedding(
        optimizedQuery, 
        AppConfig.EMBEDDING.DEFAULT_DIMENSIONS, 
        'RETRIEVAL_QUERY'
      );

      const collection = this.mongoClient.getCollection<DailyWorkDocument>(AppConfig.DATABASE.COLLECTIONS.DAILY_WORK);

      // MongoDB Atlas Vector Search
      // 注意: Atlas Vector Searchインデックスが設定されている必要があります
      const vectorResults = await collection.aggregate([
        {
          $vectorSearch: {
            index: AppConfig.DATABASE.INDEXES.VECTOR_SEARCH.DAILY_WORK,
            path: "embedding",
            queryVector: queryVector,
            numCandidates: Math.min(limit * AppConfig.SEARCH.VECTOR_SEARCH.NUM_CANDIDATES_MULTIPLIER, AppConfig.SEARCH.VECTOR_SEARCH.MAX_NUM_CANDIDATES),
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
    return await this.embeddingService.generateEmbedding(
      text, 
      AppConfig.EMBEDDING.DEFAULT_DIMENSIONS, 
      'RETRIEVAL_QUERY'
    );
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
      const collection = this.mongoClient.getCollection<DailyWorkDocument>(AppConfig.DATABASE.COLLECTIONS.DAILY_WORK);
      
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