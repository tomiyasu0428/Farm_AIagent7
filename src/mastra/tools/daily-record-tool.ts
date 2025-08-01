import { createTool } from "@mastra/core";
import { z } from "zod";
import { 
  MaterialType, 
  WeatherType, 
  WorkResultType,
  RecordDailyWorkInput,
  RecordDailyWorkOutput,
  GetDailyRecordsInput,
  GetDailyRecordsOutput,
  DailyWorkDocument,
  PersonalKnowledgeDocument,
  ToolExecutionParams,
  DailyRecordToolContext,
  RecordSearchToolContext
} from "../../types";
import { AppConfig } from "../../config";
import { ErrorHandler, ErrorCategory, ErrorLevel } from "../../services/error-handler";

/**
 * 日々の作業記録書き込みツール
 * WriteAgentで使用し、作業実績を記録・学習データとして蓄積
 */
export const recordDailyWorkTool = createTool({
  id: "recordDailyWork",
  description: "日々の農作業を記録し、個別農場の経験データとして蓄積します。成功・失敗の経験を学習データとして活用します。",
  inputSchema: z.object({
    userId: z.string().describe("ユーザーID（LINEユーザーID）"),
    fieldId: z.string().describe("対象圃場ID"),
    workRecord: z.object({
      date: z.string().describe("作業日（YYYY-MM-DD形式）"),
      workType: z.enum(["播種", "施肥", "防除", "中耕", "収穫", "その他"]).describe("作業種別"),
      description: z.string().describe("作業内容の詳細"),
      materials: z.array(z.object({
        name: z.string(),
        amount: z.string(),
        unit: z.string(),
      })).optional().describe("使用した資材・薬剤"),
      weather: z.object({
        condition: z.string(),
        temperature: z.number().optional(),
        humidity: z.number().optional(),
      }).optional().describe("作業時の天候"),
      duration: z.number().optional().describe("作業時間（分）"),
      workers: z.number().default(1).describe("作業者数"),
      equipment: z.array(z.string()).optional().describe("使用機械・道具"),
      notes: z.string().optional().describe("メモ・気づき"),
    }),
    result: z.object({
      quality: z.enum(["excellent", "good", "fair", "poor"]).describe("作業品質"),
      effectiveness: z.enum(["high", "medium", "low"]).optional().describe("効果・成果"),
      issues: z.array(z.string()).optional().describe("発生した問題"),
      improvements: z.array(z.string()).optional().describe("次回への改善点"),
      satisfaction: z.number().min(1).max(5).optional().describe("満足度（1-5）"),
    }),
    followUpNeeded: z.boolean().default(false).describe("追跡調査が必要か"),
    nextActions: z.array(z.string()).optional().describe("今後の予定作業"),
  }),
  outputSchema: z.object({
    recordId: z.string(),
    status: z.enum(["success", "partial", "failed"]),
    message: z.string(),
    learnings: z.array(z.string()).describe("今回の記録から得られた学習ポイント"),
    recommendations: z.array(z.string()).describe("次回の作業への推奨事項"),
    relatedRecords: z.array(z.object({
      recordId: z.string(),
      date: z.string(),
      similarity: z.string(),
    })).optional().describe("類似した過去の記録"),
  }),
  execute: async ({ context: { userId, fieldId, workRecord, result, followUpNeeded, nextActions } }) => {
    try {
      // MongoDB統合: 実際のデータベースに保存
      const { getMongoClient } = await import("../../database/mongodb-client");
      const { getHybridSearchService } = await import("../../services/hybrid-search");
      const { getEmbeddingService, EmbeddingService } = await import("../../services/embedding-service");
      
      const mongoClient = getMongoClient();
      const searchService = getHybridSearchService();
      
      if (!mongoClient.isConnected()) {
        await mongoClient.connect();
      }
      
      // 接続成功を確認
      if (!mongoClient.isConnected()) {
        throw new Error('Failed to establish MongoDB connection');
      }

      const recordId = `record_${Date.now()}_${userId.slice(-4)}`;
      
      // テキストコンテンツを生成（検索用）
      const textContent = [
        workRecord.description,
        workRecord.notes || "",
        result.issues?.join(" ") || "",
        result.improvements?.join(" ") || "",
        workRecord.materials?.map((m: MaterialType) => `${m.name} ${m.amount}${m.unit}`).join(" ") || "",
      ].filter(Boolean).join(" ");

      // タグ生成
      const tags = [
        workRecord.workType,
        workRecord.weather?.condition || "",
        result.quality,
        result.effectiveness || "",
        ...workRecord.materials?.map((m: MaterialType) => m.name) || [],
      ].filter(Boolean);

      // ベクトル埋め込み生成
      const embeddingService = getEmbeddingService();
      const optimizedText = EmbeddingService.optimizeTextForEmbedding(textContent);
      let embedding: number[] | undefined;
      
      try {
        // ドキュメント保存用のタスクタイプを使用
        embedding = await embeddingService.generateEmbedding(
          optimizedText, 
          AppConfig.EMBEDDING.DEFAULT_DIMENSIONS, 
          AppConfig.EMBEDDING.DEFAULT_TASK_TYPE
        );
        console.log(`✅ Generated embedding: ${embedding.length}D vector`);
      } catch (error) {
        console.log(`⚠️  Embedding generation failed, saving without vector: ${(error as Error).message}`);
      }

      // データベースドキュメント構築
      const dailyWorkDoc = {
        recordId,
        userId,
        fieldId,
        date: new Date(workRecord.date),
        workType: workRecord.workType,
        description: workRecord.description,
        materials: workRecord.materials,
        weather: workRecord.weather,
        duration: workRecord.duration,
        workers: workRecord.workers,
        equipment: workRecord.equipment,
        notes: workRecord.notes,
        result,
        followUpNeeded,
        nextActions,
        textContent,
        tags,
        embedding,
        embeddingGeneratedAt: embedding ? new Date() : undefined,
        embeddingModel: embedding ? AppConfig.EMBEDDING.MODEL : undefined,
        embeddingDimensions: embedding ? AppConfig.EMBEDDING.DEFAULT_DIMENSIONS : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // データベースに保存
      const dailyWorkCollection = mongoClient.getCollection(AppConfig.DATABASE.COLLECTIONS.DAILY_WORK);
      await dailyWorkCollection.insertOne(dailyWorkDoc);
      
      console.log(`✅ 作業記録をデータベースに保存: ${recordId}`);
      
      // 記録の分析と学習ポイントの抽出
      const learnings = [];
      const recommendations = [];

      // 作業品質に基づく学習
      if (result.quality === "excellent" || result.quality === "good") {
        learnings.push(`${workRecord.workType}作業：良好な結果を達成`);
        if (workRecord.weather) {
          learnings.push(`天候条件「${workRecord.weather.condition}」での作業が効果的`);
        }
      } else {
        learnings.push(`${workRecord.workType}作業：改善の余地あり`);
        if (result.issues && result.issues.length > 0) {
          learnings.push(`課題：${result.issues.join(", ")}`);
        }
      }

      // 天候による推奨事項
      if (workRecord.weather?.condition === "雨") {
        recommendations.push("雨天時の作業は効果が限定的である可能性があります");
      }
      
      // 使用資材による推奨事項
      if (workRecord.materials && workRecord.materials.length > 0) {
        recommendations.push(`使用資材「${workRecord.materials[0].name}」の効果を追跡調査します`);
      }

      // 改善点がある場合
      if (result.improvements && result.improvements.length > 0) {
        recommendations.push(...result.improvements.map((imp: string) => `改善提案: ${imp}`));
      }

      // 類似記録の検索（実際のデータベースから）
      const relatedRecords = await searchService.findSimilarRecords({
        userId,
        referenceRecordId: recordId,
        limit: 3,
      });

      const relatedRecordsFormatted = relatedRecords.map((record: DailyWorkDocument) => ({
        recordId: record.recordId,
        date: record.date.toISOString().split('T')[0],
        similarity: `同じ${record.workType}作業`,
      }));

      // 個別農場知識として学習データを保存
      if (result.quality === 'excellent' || result.quality === 'good') {
        const knowledgeTitle = `${workRecord.workType}作業での成功事例`;
        const knowledgeContent = `${workRecord.description} - 結果: ${result.quality}`;
        
        // 圧場情報からfarmIdを取得
        const fieldCollection = mongoClient.getCollection('fields');
        const fieldDoc = await fieldCollection.findOne({ fieldId });
        const actualFarmId = fieldDoc?.farmId || `farm_${userId.slice(-4)}`; // フォールバックとしてユーザーIDベースのfarmIdを使用
        
        const personalKnowledgeDoc = {
          knowledgeId: `knowledge_${Date.now()}_${userId.slice(-4)}`,
          farmId: actualFarmId,
          userId,
          title: knowledgeTitle,
          content: knowledgeContent,
          category: 'experience',
          relatedRecords: [recordId],
          confidence: result.quality === 'excellent' ? 0.9 : 0.7,
          frequency: 1,
          tags: tags.slice(0, 5), // 最初の5つのタグ
          lastUsed: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const personalKnowledgeCollection = mongoClient.getCollection(AppConfig.DATABASE.COLLECTIONS.PERSONAL_KNOWLEDGE);
        await personalKnowledgeCollection.insertOne(personalKnowledgeDoc);
        
        console.log(`📚 個別農場知識として学習: ${knowledgeTitle}`);
      }

      console.log(`✅ 作業記録を保存: ${recordId}`);
      console.log(`📋 作業: ${workRecord.workType} - ${workRecord.description}`);
      console.log(`📊 品質: ${result.quality}`);
      console.log(`🎯 学習ポイント数: ${learnings.length}`);

      return {
        recordId,
        status: "success" as const,
        message: `${workRecord.date}の${workRecord.workType}作業を記録しました。あなたの農場の経験データとして蓄積され、今後の判断に活用されます。`,
        learnings,
        recommendations,
        relatedRecords: relatedRecordsFormatted,
      };
    } catch (error) {
      const appError = ErrorHandler.handleDatabaseError(error, 'recordDailyWork', userId);
      ErrorHandler.logError(appError, { userId, fieldId, workType: workRecord.workType });
      
      return {
        recordId: "",
        status: "failed" as const,
        message: appError.message,
        learnings: [],
        recommendations: [],
      };
    }
  },
});

/**
 * 日々の記録読み込みツール
 * ReadAgentで使用し、過去の作業記録を検索・参照
 */
export const getDailyRecordsTool = createTool({
  id: "getDailyRecords",
  description: "過去の作業記録を検索・参照します。類似条件での過去の経験を参考に、最適な判断を支援します。",
  inputSchema: z.object({
    userId: z.string().describe("ユーザーID（LINEユーザーID）"),
    fieldId: z.string().optional().describe("特定の圃場ID（指定しない場合は全圃場）"),
    workType: z.enum(["播種", "施肥", "防除", "中耕", "収穫", "その他"]).optional().describe("作業種別での絞り込み"),
    dateRange: z.object({
      start: z.string().describe("開始日（YYYY-MM-DD）"),
      end: z.string().describe("終了日（YYYY-MM-DD）"),
    }).optional().describe("期間での絞り込み"),
    quality: z.enum(["excellent", "good", "fair", "poor"]).optional().describe("作業品質での絞り込み"),
    limit: z.number().min(1).max(AppConfig.SEARCH.MAX_LIMIT).default(AppConfig.SEARCH.DEFAULT_LIMIT).describe("取得件数上限"),
    includeAnalysis: z.boolean().default(true).describe("分析情報を含めるか"),
    allowMockData: z.boolean().default(false).describe("レコードが見つからない場合にモックデータを返すか"),
  }),
  outputSchema: z.object({
    userId: z.string(),
    totalRecords: z.number(),
    records: z.array(z.object({
      recordId: z.string(),
      fieldName: z.string(),
      date: z.string(),
      workType: z.string(),
      description: z.string(),
      quality: z.string(),
      effectiveness: z.string().optional(),
      weather: z.object({
        condition: z.string(),
        temperature: z.number().optional(),
      }).optional(),
      materials: z.array(z.string()).optional(),
      notes: z.string().optional(),
      learnings: z.array(z.string()).optional(),
    })),
    analysis: z.object({
      successRate: z.number().describe("成功率（%）"),
      commonPatterns: z.array(z.string()).describe("共通パターン"),
      bestPractices: z.array(z.string()).describe("ベストプラクティス"),
      seasonalTrends: z.array(z.string()).describe("季節的傾向"),
      improvementAreas: z.array(z.string()).describe("改善領域"),
    }).optional(),
    recommendations: z.array(z.string()).describe("過去の経験に基づく推奨事項"),
  }),
  execute: async ({ context: { userId, fieldId, workType, dateRange, quality, limit, includeAnalysis, allowMockData } }) => {
    try {
      // MongoDB統合: 実際のデータベースから検索
      const { getMongoClient } = await import("../../database/mongodb-client");
      const { getHybridSearchService } = await import("../../services/hybrid-search");
      
      const mongoClient = getMongoClient();
      const searchService = getHybridSearchService();
      
      if (!mongoClient.isConnected()) {
        await mongoClient.connect();
      }
      
      // 接続成功を確認
      if (!mongoClient.isConnected()) {
        throw new Error('Failed to establish MongoDB connection');
      }

      // ハイブリッド検索実行
      const searchResults = await searchService.searchDailyRecords({
        userId,
        query: workType ? `${workType} 作業` : "農作業 記録",
        fieldId,
        workType,
        dateRange: dateRange ? {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end)
        } : undefined,
        limit,
      });

      const records = searchResults.records.map(record => ({
        recordId: record.recordId,
        fieldName: `圃場_${record.fieldId}`, // フィールド名解決は後で実装
        date: record.date.toISOString().split('T')[0],
        workType: record.workType,
        description: record.description,
        quality: record.result.quality,
        effectiveness: record.result.effectiveness,
        weather: record.weather,
        materials: record.materials?.map(m => m.name),
        notes: record.notes,
        learnings: [], // TODO: 学習ポイントを抽出
      }));

      // データが少ない場合はモックデータも含める（設定に基づく）
      if (records.length === 0 && allowMockData) {
        const mockRecords = [
        {
          recordId: "record_001",
          fieldName: "第一圃場",
          date: "2024-07-15",
          workType: "防除",
          description: "疫病予防のための薬剤散布",
          quality: "good",
          effectiveness: "high",
          weather: {
            condition: "曇り",
            temperature: 22,
          },
          materials: ["銅水和剤", "展着剤"],
          notes: "散布後の定着が良好",
          learnings: ["曇り空での散布は効果的", "早朝散布が最適"],
        },
        {
          recordId: "record_002",
          fieldName: "第一圃場",
          date: "2024-06-20",
          workType: "施肥",
          description: "追肥（NK化成）",
          quality: "excellent",
          effectiveness: "high",
          weather: {
            condition: "晴れ",
            temperature: 18,
          },
          materials: ["NK化成肥料"],
          notes: "生育が顕著に改善",
          learnings: ["この時期の追肥は効果大", "少量多回施用が有効"],
        },
        ];

        return {
          userId,
          totalRecords: mockRecords.length,
          records: mockRecords,
          analysis: includeAnalysis ? {
            successRate: 0,
            commonPatterns: ["データが不足しています"],
            bestPractices: ["作業記録を継続的に入力してください"],
            seasonalTrends: [],
            improvementAreas: ["データの蓄積が必要です"],
          } : undefined,
          recommendations: [
            "作業記録がまだありません。日々の作業を記録することから始めましょう",
            "継続的な記録により、あなたの農場に特化した知見が蓄積されます",
          ],
        };
      }

      // 分析情報の生成（実際のデータから）
      const totalRecords = searchResults.searchMetadata.totalFound;
      const successRate = records.length > 0 
        ? records.filter(r => r.quality === 'excellent' || r.quality === 'good').length / records.length * 100
        : 0;

      const analysis = includeAnalysis ? {
        successRate: Math.round(successRate),
        commonPatterns: records.length > 2 ? [
          `${workType || '作業'}の成功率は${Math.round(successRate)}%です`,
          "詳細な分析は更多くのデータが蓄積された後に提供されます",
        ] : ["分析のためのデータが不足しています"],
        bestPractices: records.filter(r => r.quality === 'excellent').map(r => 
          `${r.workType}: ${r.description.substring(0, 30)}...`
        ).slice(0, 3),
        seasonalTrends: [],
        improvementAreas: records.filter(r => r.quality === 'poor' || r.quality === 'fair').map(r =>
          `${r.workType}作業の改善`
        ).slice(0, 3),
      } : undefined;

      // 個別農場知識からの推奨事項
      // 個別農場知識からの推奨事項
      let knowledgeSearch;
      try {
        // 圧場からfarmIdを解決
        const fieldDoc = fieldId ? await mongoClient.getCollection('fields').findOne({ fieldId }) : null;
        const actualFarmId = fieldDoc?.farmId || `farm_${userId.slice(-4)}`;
        
        knowledgeSearch = await searchService.searchPersonalKnowledge({
          userId,
          farmId: actualFarmId,
          query: workType ? `${workType} 成功` : "農作業 経験",
          limit: 3,
        });
      } catch (error) {
        console.warn('⚠️  Personal knowledge search failed, using default recommendations:', error);
        knowledgeSearch = { knowledge: [], searchMetadata: { totalFound: 0, avgConfidence: 0, categories: [] } };
      }

      const recommendations = knowledgeSearch.knowledge.length > 0
        ? knowledgeSearch.knowledge.map(k => k.content.substring(0, 50) + "...")
        : [
          "過去の成功事例を参考に、同様の条件で作業を実施することをお勧めします",
          "継続的な記録により、個別化された推奨事項を提供できるようになります",
        ];

      return {
        userId,
        totalRecords,
        records,
        analysis,
        recommendations,
      };
    } catch (error) {
      const appError = ErrorHandler.handleDatabaseError(error, 'getDailyRecords', userId);
      ErrorHandler.logError(appError, { userId, fieldId, workType });
      throw appError;
    }
  },
});

// Export statements are already handled above