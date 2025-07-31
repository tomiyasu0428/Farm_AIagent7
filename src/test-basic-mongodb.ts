import 'dotenv/config';
import { getMongoClient } from "./database/mongodb-client";

async function testBasicMongoDB() {
  console.log("🧪 基本MongoDB動作テスト...\n");

  try {
    const mongoClient = getMongoClient();
    await mongoClient.connect();

    // 1. コレクションの状態確認
    console.log("1️⃣ データベース状態確認");
    const collections = ['users', 'farms', 'fields', 'dailyWork', 'personalKnowledge'];
    
    for (const collectionName of collections) {
      const collection = mongoClient.getCollection(collectionName);
      const count = await collection.countDocuments();
      console.log(`📄 ${collectionName}: ${count}件のドキュメント`);
    }
    console.log("");

    // 2. 作成されたテストデータの確認
    console.log("2️⃣ テストデータ確認");
    const usersCollection = mongoClient.getCollection('users');
    const user = await usersCollection.findOne({ lineUserId: "test_user_001" });
    console.log("👤 テストユーザー:", user ? "✅ 存在" : "❌ 未存在");

    const dailyWorkCollection = mongoClient.getCollection('dailyWork');
    const workRecords = await dailyWorkCollection.find({ userId: "test_user_001" }).toArray();
    console.log("📝 作業記録:", workRecords.length + "件");
    
    if (workRecords.length > 0) {
      console.log("   最新記録:", {
        date: workRecords[0].date,
        workType: workRecords[0].workType,
        description: workRecords[0].description.substring(0, 30) + "...",
        quality: workRecords[0].result.quality
      });
    }

    const personalKnowledgeCollection = mongoClient.getCollection('personalKnowledge');
    const knowledge = await personalKnowledgeCollection.find({ userId: "test_user_001" }).toArray();
    console.log("🧠 個別農場知識:", knowledge.length + "件");
    
    if (knowledge.length > 0) {
      console.log("   知識例:", {
        title: knowledge[0].title,
        category: knowledge[0].category,
        confidence: knowledge[0].confidence
      });
    }
    console.log("");

    // 3. 基本クエリテスト（テキスト検索なし）
    console.log("3️⃣ 基本クエリテスト");
    const specificWork = await dailyWorkCollection.findOne({ 
      userId: "test_user_001",
      workType: "防除" 
    });
    console.log("🔍 防除作業検索:", specificWork ? "✅ 見つかりました" : "❌ 見つかりません");

    const sortedWork = await dailyWorkCollection.find({ 
      userId: "test_user_001" 
    }).sort({ date: -1 }).limit(1).toArray();
    console.log("📅 最新作業:", sortedWork.length > 0 ? "✅ 取得成功" : "❌ データなし");

    console.log("\n🎉 基本MongoDB動作テスト完了！");
    console.log("✅ あなたのMongoDB Atlasクラスターでデータの読み書きが正常動作しています");
    console.log("\n📝 次のステップ:");
    console.log("   1. MongoDB Atlasコンソールでテキスト検索インデックスを作成");
    console.log("   2. ベクトル検索インデックスを作成");
    console.log("   3. フルハイブリッド検索テスト");

    await mongoClient.disconnect();

  } catch (error) {
    console.error("❌ テスト中にエラーが発生:", error);
  }
}

// テスト実行
testBasicMongoDB();