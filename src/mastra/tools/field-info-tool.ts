import { createTool } from "@mastra/core";
import { z } from "zod";

/**
 * 圃場情報取得ツール
 * ReadAgentで使用し、ユーザーの圃場情報を取得する
 */
export const getFieldInfoTool = createTool({
  id: "getFieldInfo",
  description: "ユーザーの圃場情報を取得します。圃場の基本情報、現在の作物、土壌条件、作業履歴などを確認できます。",
  inputSchema: z.object({
    userId: z.string().describe("ユーザーID（LINEユーザーID）"),
    fieldId: z.string().optional().describe("特定の圃場ID（指定しない場合は全圃場情報）"),
    includeHistory: z.boolean().default(false).describe("作業履歴を含めるかどうか"),
  }),
  outputSchema: z.object({
    userId: z.string(),
    fields: z.array(z.object({
      fieldId: z.string(),
      fieldName: z.string(),
      farmName: z.string(),
      size: z.number().describe("面積（ha）"),
      location: z.object({
        address: z.string(),
        coordinates: z.object({
          latitude: z.number(),
          longitude: z.number(),
        }).optional(),
      }),
      currentCrop: z.object({
        cropName: z.string(),
        variety: z.string().optional(),
        plantingDate: z.string().optional(),
        expectedHarvestDate: z.string().optional(),
        growthStage: z.string().optional(),
      }).optional(),
      soilInfo: z.object({
        type: z.string(),
        ph: z.number().optional(),
        fertility: z.string().optional(),
        drainageCondition: z.string().optional(),
      }),
      characteristics: z.array(z.string()).describe("圃場の特徴や注意点"),
      recentWork: z.array(z.object({
        date: z.string(),
        workType: z.string(),
        description: z.string(),
        result: z.string().optional(),
      })).optional(),
    })),
    summary: z.string().describe("圃場全体のサマリー"),
    recommendations: z.array(z.string()).describe("現在の状況に基づく推奨事項"),
  }),
  execute: async ({ userId, fieldId, includeHistory }) => {
    try {
      // MongoDB統合: 実際のデータベースから取得
      const { getMongoClient } = await import("../../database/mongodb-client");
      const { getHybridSearchService } = await import("../../services/hybrid-search");
      
      const mongoClient = getMongoClient();
      const searchService = getHybridSearchService();
      
      if (!mongoClient.isConnected()) {
        await mongoClient.connect();
      }

      // ユーザー情報取得
      const usersCollection = mongoClient.getCollection('users');
      const user = await usersCollection.findOne({ lineUserId: userId });
      
      if (!user) {
        throw new Error('ユーザーが見つかりません');
      }

      // 圃場情報取得
      const fieldsCollection = mongoClient.getCollection('fields');
      const query = {
        farmId: user.farmId,
        ...(fieldId && { fieldId })
      };
      
      const fields = await fieldsCollection.find(query).toArray();
      
      // 作業履歴の取得（要求された場合）
      const processedFields = await Promise.all(fields.map(async (field) => {
        let recentWork = undefined;
        
        if (includeHistory) {
          const workRecords = await searchService.searchDailyRecords({
            userId,
            fieldId: field.fieldId,
            query: "", // 空クエリで全記録を取得
            limit: 5
          });
          
          recentWork = workRecords.records.map(record => ({
            date: record.date.toISOString().split('T')[0],
            workType: record.workType,
            description: record.description,
            result: record.result.quality,
          }));
        }

        return {
          fieldId: field.fieldId,
          fieldName: field.fieldName,
          farmName: user.name + "農場",
          size: field.size,
          location: field.location,
          currentCrop: field.currentCrop,
          soilInfo: {
            type: field.soilType,
            ph: 6.5, // TODO: 実際の土壌データ
            fertility: "中程度",
            drainageCondition: "良好",
          },
          characteristics: field.characteristics || [],
          recentWork,
        };
      }));

      if (processedFields.length === 0) {
        // フォールバック：モックデータを返す
        const mockFields = [
        {
          fieldId: "field-001",
          fieldName: "第一圃場",
          farmName: "田中農場",
          size: 2.5,
          location: {
            address: "北海道上川郡美瑛町",
            coordinates: {
              latitude: 43.5984,
              longitude: 142.4739,
            },
          },
          currentCrop: {
            cropName: "ばれいしょ",
            variety: "男爵薯",
            plantingDate: "2024-05-15",
            expectedHarvestDate: "2024-09-20",
            growthStage: "開花期",
          },
          soilInfo: {
            type: "黒ボク土",
            ph: 6.2,
            fertility: "中程度",
            drainageCondition: "良好",
          },
          characteristics: [
            "南向き斜面で日当たり良好",
            "過去に疫病の発生履歴あり",
            "有機物含有量が高い",
          ],
          recentWork: includeHistory ? [
            {
              date: "2024-07-15",
              workType: "防除",
              description: "疫病予防のための薬剤散布",
              result: "良好",
            },
            {
              date: "2024-07-10",
              workType: "中耕",
              description: "土寄せ作業",
              result: "完了",
            },
          ] : undefined,
        },
        {
          fieldId: "field-002",
          fieldName: "第二圃場",
          farmName: "田中農場",
          size: 1.8,
          location: {
            address: "北海道上川郡美瑛町",
          },
          currentCrop: {
            cropName: "小麦",
            variety: "春よ恋",
            plantingDate: "2024-04-20",
            expectedHarvestDate: "2024-08-25",
            growthStage: "登熟期",
          },
          soilInfo: {
            type: "褐色森林土",
            ph: 6.8,
            fertility: "高い",
            drainageCondition: "やや不良",
          },
          characteristics: [
            "平坦地で作業しやすい",
            "排水がやや悪い",
            "風通しが良い",
          ],
          recentWork: includeHistory ? [
            {
              date: "2024-07-20",
              workType: "病害虫防除",
              description: "赤かび病予防散布",
              result: "実施済み",
            },
          ] : undefined,
        },
        ];
        
        const summary = `${mockFields.length}つの圃場を管理中（デモデータ）。総面積${mockFields.reduce((sum, field) => sum + field.size, 0)}ha。`;
        const recommendations = [
          "圃場データが未登録です。最初の圃場情報を登録してください",
          "デモデータを表示中。実際のデータ入力をお勧めします",
        ];

        return {
          userId,
          fields: mockFields,
          summary,
          recommendations,
        };
      }

      // 実際のデータがある場合
      const summary = `${processedFields.length}つの圃場を管理中。総面積${processedFields.reduce((sum, field) => sum + field.size, 0)}ha。`;
      
      // 個別農場知識からの推奨事項取得
      const knowledgeSearch = await searchService.searchPersonalKnowledge({
        userId,
        farmId: user.farmId,
        query: "圃場 管理 推奨",
        limit: 3,
      });

      const recommendations = knowledgeSearch.knowledge.length > 0
        ? knowledgeSearch.knowledge.map(k => k.title)
        : [
          "圃場の状況を定期的に記録することをお勧めします",
          "土壌条件に応じた作物選択を検討してください",
        ];

      return {
        userId,
        fields: processedFields,
        summary,
        recommendations,
      };
    } catch (error) {
      throw new Error(`圃場情報の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

export default getFieldInfoTool;