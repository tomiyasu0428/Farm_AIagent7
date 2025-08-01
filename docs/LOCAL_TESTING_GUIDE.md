# ローカル開発・テストガイド

## 🚀 ローカルでのLINE Bot テスト

### 1. 必要なツール

#### ngrok（推奨）
```bash
# ngrokのインストール
npm install -g ngrok

# または
brew install ngrok

# ngrokアカウント登録後、認証トークン設定
ngrok config add-authtoken YOUR_AUTHTOKEN
```

#### localtunnel（代替案）
```bash
npm install -g localtunnel
```

---

## 🔧 セットアップ手順

### Step 1: 環境変数の設定

`.env` ファイルを確認・設定：
```env
# Google AI (Gemini)
GOOGLE_API_KEY=your_google_api_key

# MongoDB Atlas  
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net
MONGODB_DATABASE=agri_assistant

# LINE Bot（LINE Developers から取得）
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# ローカル開発用
PORT=3000
NODE_ENV=development
```

### Step 2: ローカルサーバーの起動

```bash
# Webhookサーバーを起動
npm run webhook
```

**起動確認:**
```
🚀 LINE Webhook Server started on port 3000
📋 Available endpoints:
   GET  /health - Health check
   POST /webhook - LINE Webhook
🔌 Environment: development
```

### Step 3: 外部公開（ngrok）

**新しいターミナルで:**
```bash
# ポート3000を外部公開
ngrok http 3000
```

**出力例:**
```
ngrok                                                          

Session Status                online
Account                       your-account
Version                       3.x.x
Region                        Japan (jp)
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
Forwarding                    http://abc123.ngrok.io -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       1       0.00    0.00    0.00    0.00
```

**🔗 Webhook URL:** `https://abc123.ngrok.io/webhook`

---

## 📱 LINE Bot の設定

### LINE Developers Console

1. **Messaging API設定 > Webhook設定**
   - Webhook URL: `https://abc123.ngrok.io/webhook`
   - Use webhook: ✅ 有効

2. **Messaging API設定 > 応答設定**
   - Webhook: ✅ 有効
   - あいさつメッセージ: ❌ 無効
   - 応答メッセージ: ❌ 無効

3. **テスト**
   - 「Webhook URLを検証」をクリック
   - ✅ 成功が表示されることを確認

---

## 🔍 Mastra エージェント動作のトレース

### 1. 詳細ログの有効化

#### デバッグモード起動
```bash
# デバッグログ付きで起動
DEBUG=mastra:* npm run webhook
```

#### または環境変数で設定
```env
# .env に追加
DEBUG=mastra:*
LOG_LEVEL=debug
```

### 2. カスタムログの追加

`src/mastra/agents/supervisor-agent.ts` を拡張:

```typescript
import { Agent } from "@mastra/core/agent";
import { ModelFactory } from "../model-factory";

// デバッグログ関数
const debugLog = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 [SupervisorAgent] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
};

export const supervisorAgent = new Agent({
  name: "SupervisorAgent",
  instructions: supervisorInstructions,
  model: ModelFactory.getGeminiFlash(),
  
  // カスタムミドルウェアでトレース
  onStart: async (context) => {
    debugLog("Agent started", { input: context.messages });
  },
  
  onComplete: async (context, result) => {
    debugLog("Agent completed", { 
      result: result,
      duration: context.duration 
    });
  },
  
  onError: async (context, error) => {
    debugLog("Agent error", { error: error.message });
  }
});
```

### 3. トレース対応版 Webhook サーバー

`src/line/webhook-server-debug.ts` を作成:

```typescript
import { LineWebhookServer } from './webhook-server';

export class DebugLineWebhookServer extends LineWebhookServer {
  
  // メッセージ処理のトレース
  protected async handleTextMessage(event: any): Promise<void> {
    const messageText = event.message.text;
    const userId = event.source.userId;
    
    console.log('\n' + '='.repeat(50));
    console.log('🚀 [DEBUG] Message Processing Started');
    console.log('='.repeat(50));
    console.log(`📨 Input: "${messageText}"`);
    console.log(`👤 User: ${userId}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    
    try {
      // 1. ユーザー情報取得をトレース
      console.log('\n🔍 Step 1: User Info Retrieval');
      const userInfo = await this.getOrCreateUser(userId);
      console.log(`✅ User Info:`, {
        name: userInfo.name,
        farmId: userInfo.farmId
      });
      
      // 2. エージェント呼び出しをトレース
      console.log('\n🤖 Step 2: Agent Processing');
      console.log('📤 Sending to SupervisorAgent...');
      
      const startTime = Date.now();
      const { supervisorAgent } = await import('../mastra/agents/supervisor-agent');
      
      const agentInput = `ユーザーからのメッセージ: "${messageText}"
        
ユーザー情報:
- ID: ${userId}
- 名前: ${userInfo.name || 'Unknown'}
- 農場ID: ${userInfo.farmId || 'None'}

このメッセージに対して適切に応答してください。`;

      console.log('📝 Agent Input:', agentInput);
      
      const agentResponse = await supervisorAgent.generate(agentInput);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Agent Response (${processingTime}ms):`, agentResponse);
      
      // 3. 応答フォーマットをトレース
      console.log('\n📤 Step 3: Response Formatting');
      const replyMessage = this.formatAgentResponse(agentResponse);
      console.log('📝 Formatted Response:', replyMessage);
      
      // 4. LINE送信をトレース
      console.log('\n📱 Step 4: LINE Response');
      if ('replyToken' in event && event.replyToken) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyMessage
        });
        console.log('✅ Reply sent successfully');
      }
      
      console.log('\n' + '='.repeat(50));
      console.log('🎉 [DEBUG] Message Processing Completed');
      console.log(`⏱️  Total Time: ${Date.now() - startTime}ms`);
      console.log('='.repeat(50));
      
    } catch (error) {
      console.log('\n❌ [DEBUG] Error occurred:', error);
      console.log('='.repeat(50));
      
      // エラー時も応答
      if ('replyToken' in event && event.replyToken) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '申し訳ございません。現在処理に問題が発生しています。'
        });
      }
    }
  }
}

// デバッグ版サーバーの起動
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DebugLineWebhookServer();
  server.start(3000);
}
```

### 4. デバッグ版の起動スクリプト

`package.json` に追加:
```json 
{
  "scripts": {
    "webhook:debug": "tsx src/line/webhook-server-debug.ts",
    "debug": "DEBUG=mastra:* tsx src/line/webhook-server-debug.ts"
  }
}
```

---

## 🧪 テスト方法

### 1. 基本動作テスト

#### ヘルスチェック
```bash
curl http://localhost:3000/health
```

**期待レスポンス:**
```json
{
  "status": "ok",
  "timestamp": "2025-08-01T12:00:00.000Z",
  "service": "Agri-AI Webhook Server"
}
```

#### Webhook テスト（手動）
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Line-Signature: dummy_signature_for_local_test" \
  -d '{
    "events": [
      {
        "type": "message",
        "source": { "type": "user", "userId": "test_user_001" },
        "message": { "type": "text", "text": "テストメッセージ" },
        "timestamp": 1625097600000,
        "replyToken": "test_reply_token"
      }
    ]
  }'
```

### 2. LINE アプリでのテスト

1. **LINE Developers Console** で QRコード取得
2. **LINE アプリ** で友だち追加
3. **メッセージ送信** してテスト

**テスト用メッセージ例:**
```
こんにちは
今日じゃがいもの作業完了
第一圃場の状況教えて
明日の天気は？
```

---

## 📊 トレース出力例

### 成功時のログ
```
==================================================
🚀 [DEBUG] Message Processing Started
==================================================
📨 Input: "今日じゃがいもの作業完了"
👤 User: U1234567890abcdef
⏰ Timestamp: 2025-08-01T12:00:00.000Z

🔍 Step 1: User Info Retrieval
✅ User Info: {
  "name": "農場太郎",
  "farmId": "farm_hokkaido_001"
}

🤖 Step 2: Agent Processing
📤 Sending to SupervisorAgent...
📝 Agent Input: ユーザーからのメッセージ: "今日じゃがいもの作業完了"...

🔍 [SupervisorAgent] Agent started {
  "messages": [...]
}

✅ Agent Response (1247ms): {
  "output": "🥔 じゃがいもの作業、お疲れ様でした！\n\n記録として保存させていただきました。\n今回の作業はいかがでしたか？"
}

📤 Step 3: Response Formatting
📝 Formatted Response: 🥔 じゃがいもの作業、お疲れ様でした！...

📱 Step 4: LINE Response
✅ Reply sent successfully

==================================================
🎉 [DEBUG] Message Processing Completed
⏱️  Total Time: 1378ms
==================================================
```

### エラー時のログ
```
❌ [DEBUG] Error occurred: {
  "name": "Error",
  "message": "Failed to connect to database",
  "stack": "..."
}
```

---

## 🛠️ トラブルシューティング

### よくある問題と解決法

#### 1. ngrok接続エラー
```
ERR_NGROK_108: ngrok account limit exceeded
```
**解決法:** 無料アカウントの制限。有料プランまたはlocaltunnelを使用

#### 2. LINE Webhook検証失敗
```
❌ Webhook URL verification failed
```
**解決法:** 
- ngrok URLが正しいか確認
- ローカルサーバーが起動しているか確認
- LINE_CHANNEL_SECRETが正しいか確認

#### 3. MongoDB接続エラー
```
❌ MongoDB connection failed
```
**解決法:**
- MONGODB_URIが正しいか確認
- MongoDB Atlasのネットワークアクセス設定確認
- IPアドレスがホワイトリストに登録されているか確認

#### 4. Gemini API エラー
```
❌ Model configuration validation failed
```
**解決法:**
- GOOGLE_API_KEYが設定されているか確認
- APIキーが有効か確認（Google Cloud Console）
- Gemini APIが有効になっているか確認

---

## 🔧 高度なデバッグ

### 1. ネットワークトラフィック監視
```bash
# ngrokの管理画面でリクエスト確認
# http://localhost:4040
```

### 2. データベース状態確認
```javascript
// MongoDB Compass または mongo shell
use agri_assistant
db.users.find()
db.dailyWork.find().limit(5)
```

### 3. パフォーマンス分析
```javascript
// src/utils/performance-monitor.ts
export class PerformanceMonitor {
  static startTimer(label: string) {
    console.time(label);
  }
  
  static endTimer(label: string) {
    console.timeEnd(label);
  }
  
  static measureAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      console.time(label);
      try {
        const result = await fn();
        console.timeEnd(label);
        resolve(result);
      } catch (error) {
        console.timeEnd(label);
        reject(error);
      }
    });
  }
}
```

---

## 🚀 次のステップ

### 本格的な開発環境
1. **Docker化**: 環境の統一化
2. **Hot reload**: ファイル変更の自動反映
3. **テストサーバー**: 本番環境の模擬

### CI/CD統合
1. **自動テスト**: プルリクエスト時の自動実行
2. **ステージング環境**: 本番前の検証環境
3. **デプロイ自動化**: マージ時の自動デプロイ

---

**これでローカル開発・テスト環境が完成です！** 🎉  
**実際にLINEでメッセージを送信して、Mastraエージェントの動作を確認してみましょう！**