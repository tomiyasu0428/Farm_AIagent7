import 'dotenv/config';
import { getMongoClient } from "./database/mongodb-client";
import { recordDailyWorkTool, getDailyRecordsTool } from "./mastra/tools/daily-record-tool";
import { getFieldInfoTool } from "./mastra/tools/field-info-tool";

async function testRealData() {
  console.log("🧪 実データテストを開始します...\n");

  try {
    const mongoClient = getMongoClient();
    await mongoClient.connect();

    // 1. サンプルユーザーとファームデータを作成
    console.log("1️⃣ サンプルデータ作成");
    const usersCollection = mongoClient.getCollection('users');
    const farmsCollection = mongoClient.getCollection('farms');
    const fieldsCollection = mongoClient.getCollection('fields');

    const testUserId = "test_user_001";
    const testFarmId = "test_farm_001";
    const testFieldId = "test_field_001";

    // ユーザーデータ
    await usersCollection.replaceOne(
      { lineUserId: testUserId },
      {
        lineUserId: testUserId,
        name: "田中太郎",
        farmId: testFarmId,
        preferences: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    // 農場データ
    await farmsCollection.replaceOne(
      { farmId: testFarmId },
      {
        farmId: testFarmId,
        farmName: "田中農場",
        address: "北海道上川郡美瑛町",
        ownerInfo: { name: "田中太郎" },
        climateZone: "冷涼地",
        soilConditions: { type: "黒ボク土" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    // 圃場データ
    await fieldsCollection.replaceOne(
      { fieldId: testFieldId },
      {
        fieldId: testFieldId,
        fieldName: "第一圃場",
        farmId: testFarmId,
        size: 2.5,
        location: {
          address: "北海道上川郡美瑛町字美瑛1-1",
          coordinates: {
            latitude: 43.5984,
            longitude: 142.4739,
          },
        },
        currentCrop: {
          cropName: "ばれいしょ",
          variety: "男爵薯",
          plantingDate: new Date("2024-05-15"),
          expectedHarvestDate: new Date("2024-09-20"),
          growthStage: "開花期",
        },
        soilType: "黒ボク土",
        characteristics: [
          "南向き斜面で日当たり良好",
          "有機物含有量が高い",
        ],
        personalNotes: [],
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true }
    );

    console.log("✅ サンプルデータ作成完了\n");

    // 2. 作業記録ツールのテスト
    console.log("2️⃣ 作業記録ツール実テスト");
    const recordResult = await recordDailyWorkTool.execute({
      userId: testUserId,
      fieldId: testFieldId,
      workRecord: {
        date: "2024-07-31",
        workType: "防除",
        description: "疫病予防のための銅水和剤散布",
        materials: [
          {
            name: "銅水和剤",
            amount: "500",
            unit: "g",
          },
        ],
        weather: {
          condition: "曇り",
          temperature: 22,
          humidity: 75,
        },
        duration: 120,
        workers: 1,
        equipment: ["動力散布機"],
        notes: "散布条件良好、定着期待",
      },
      result: {
        quality: "good",
        effectiveness: "high",
        satisfaction: 4,
      },
      followUpNeeded: false,
      nextActions: ["3日後の効果確認"],
    });

    console.log("📝 記録結果:", recordResult.message);
    console.log("📚 学習ポイント:", recordResult.learnings);
    console.log("✅ 作業記録ツールテスト完了\n");

    // 3. 圃場情報取得ツールのテスト
    console.log("3️⃣ 圃場情報取得ツール実テスト");
    const fieldResult = await getFieldInfoTool.execute({
      userId: testUserId,
      includeHistory: true,
    });

    console.log("🏞️  圃場数:", fieldResult.fields.length);
    console.log("📄 サマリー:", fieldResult.summary);
    console.log("💡 推奨事項:", fieldResult.recommendations);
    console.log("✅ 圃場情報取得ツールテスト完了\n");

    // 4. 記録検索ツールのテスト
    console.log("4️⃣ 記録検索ツール実テスト");
    const searchResult = await getDailyRecordsTool.execute({
      userId: testUserId,
      query: "防除",
      includeAnalysis: true,
      limit: 5,
    });

    console.log("🔍 検索結果数:", searchResult.totalRecords);
    console.log("📊 成功率:", searchResult.analysis?.successRate + "%");
    console.log("💡 推奨事項:", searchResult.recommendations);
    console.log("✅ 記録検索ツールテスト完了\n");

    console.log("🎉 実データテストが完了しました！");
    console.log("✅ あなたのMongoDB Atlasクラスターでシステムが正常動作しています");

    await mongoClient.disconnect();

  } catch (error) {
    console.error("❌ テスト中にエラーが発生:", error);
  }
}

// テスト実行
testRealData();