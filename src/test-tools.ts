import { readAgent } from "./mastra/agents/read-agent";
import { writeAgent } from "./mastra/agents/write-agent";

async function testTools() {
  console.log("🧪 農業用ツールのテストを開始します...\n");

  try {
    // 1. 天気情報取得テスト
    console.log("1️⃣ 天気情報取得テスト");
    const weatherResponse = await readAgent.generate([
      {
        role: "user",
        content: "北海道帯広市の3日間の天気予報を教えてください。農作業への影響も含めて。"
      }
    ]);
    console.log("✅ 天気情報:", weatherResponse.text?.substring(0, 100) + "...\n");

    // 2. 圃場情報取得テスト
    console.log("2️⃣ 圃場情報取得テスト");
    const fieldResponse = await readAgent.generate([
      {
        role: "user", 
        content: "user123の圃場情報を教えてください。作業履歴も含めて確認したいです。"
      }
    ]);
    console.log("✅ 圃場情報:", fieldResponse.text?.substring(0, 100) + "...\n");

    // 3. 作業記録テスト（WriteAgent）
    console.log("3️⃣ 作業記録テスト");
    const recordResponse = await writeAgent.generate([
      {
        role: "user",
        content: "今日、第一圃場でじゃがいもの防除作業をしました。銅水和剤を散布して、天気は曇りでした。作業は順調で満足度は4です。この作業を記録してください。"
      }
    ]);
    console.log("✅ 作業記録:", recordResponse.text?.substring(0, 100) + "...\n");

    // 4. 過去の記録参照テスト
    console.log("4️⃣ 過去の記録参照テスト");
    const historyResponse = await readAgent.generate([
      {
        role: "user",
        content: "user123の過去の防除作業の記録を見せてください。成功事例を参考にしたいです。"
      }
    ]);
    console.log("✅ 記録参照:", historyResponse.text?.substring(0, 100) + "...\n");

    console.log("🎉 すべてのツールテストが完了しました！");

  } catch (error) {
    console.error("❌ テスト中にエラーが発生:", error);
  }
}

// テスト実行
if (require.main === module) {
  testTools();
}