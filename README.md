# 農業AIエージェント「Agri-Partner」

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org/)
[![LINE Bot SDK](https://img.shields.io/badge/LINE%20Bot-10.0.0-brightgreen)](https://github.com/line/line-bot-sdk-nodejs)
[![Mastra](https://img.shields.io/badge/Mastra-0.12.0-purple)](https://mastra.ai/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.18.0-darkgreen)](https://www.mongodb.com/)

LINEで利用できる農業専用AIエージェント。各農場に特化した思考と記憶を代行し、パーソナライズされた農業支援を提供します。

---

## 🌟 特徴

### 🧠 思考と記憶の代行
- **個別農場最適化**: 各ユーザーの農場情報、栽培履歴、環境条件を学習
- **経験の蓄積と継承**: 作業経験を蓄積し、熟練者のような的確な判断支援
- **次のアクション提案**: 「次に何をすべきか」を先回りして提示

### 🤖 マルチエージェント・システム
- **SupervisorAgent**: 思考・記憶の指揮者、意図分析・LINE最適化応答
- **ReadAgent**: 個別化情報分析、ハイブリッド検索、パーソナライズ情報提供
- **WriteAgent**: 経験蓄積・記録、自動ベクトル化、個別農場データ蓄積

### 🔍 高度なハイブリッド検索
- **ベクトル検索**: Gemini Embeddings APIによる意味的検索
- **キーワード検索**: MongoDB Text Searchによる正確な文字列マッチング
- **RRF統合**: Reciprocal Rank Fusion による最適化された検索結果

### 📱 LINE完全統合
- **親しみやすいUI**: 農業従事者に馴染みのあるLINEインターフェース
- **セキュリティ強化**: Helmet + CORS + 環境変数検証
- **エラーハンドリング**: 優雅な劣化とフォールバック機能

---

## 🏗️ システム・アーキテクチャ

```
[LINE App] ←→ [Express Webhook] ←→ [Mastra Agent System] ←→ [MongoDB Atlas]
    ↑              ↑                        ↑                      ↑
   LIFF        セキュリティ強化          Multi-Agent         Vector Search
Dashboard      + エラーハンドリング    (Supervisor/Read/Write)    + 個別農場DB
```

### 技術スタック
| 技術領域 | 選定技術 | バージョン |
|---------|---------|-----------|
| **ランタイム** | Node.js | 20+ |
| **言語** | TypeScript | 5.8.3 |
| **フレームワーク** | Mastra Framework | 0.12.0 |
| **フロントエンド** | LINE/LIFF | - |
| **バックエンド** | Express.js | 5.1.0 |
| **データベース** | MongoDB Atlas | 6.18.0 |
| **AI/ML** | Gemini 2.5 Flash + Embeddings | latest |
| **セキュリティ** | Helmet + CORS + Zod | latest |

---

## 🚀 インストール・セットアップ

### 前提条件
- Node.js 20+
- npm または yarn
- MongoDB Atlas アカウント
- Google Cloud Platform アカウント (Gemini API)
- LINE Developers アカウント

### 1. リポジトリのクローン
```bash
git clone https://github.com/tomiyasu0428/Farm_AIagent7.git
cd Farm_AIagent7
```

### 2. 依存関係のインストール
```bash
npm install
```

### 3. 環境変数の設定
`.env` ファイルを作成し、以下を設定：

```env
# Google AI (Gemini)
GOOGLE_API_KEY=your_google_api_key

# MongoDB Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net
MONGODB_DATABASE=agri_assistant

# LINE Bot
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token
LINE_CHANNEL_SECRET=your_line_channel_secret

# Server
PORT=3000
NODE_ENV=development
```

### 4. MongoDB Atlasの設定
```bash
# インデックスの自動作成
npm run setup:indexes

# Atlas設定状況の確認
npm run test:atlas
```

### 5. アプリケーションのビルド
```bash
npm run build
```

---

## 🎮 使用方法

### 開発環境での起動

#### Webhookサーバーの起動
```bash
npm run webhook
```

#### メインアプリケーションの起動
```bash
npm run dev
```

### 本番環境での起動
```bash
npm start
```

### テストの実行

#### エンドツーエンドテスト
```bash
npm run test:e2e
```

#### 各種機能テスト
```bash
# LINE統合テスト
npm run test

# エンベディングテスト
npm run test:embeddings

# ハイブリッド検索テスト
npm run test:hybrid-search
```

---

## 📖 API・機能詳細

### LINE Webhook エンドポイント

#### POST `/webhook`
LINEからのメッセージを受信し、Mastraエージェントシステムに転送

**サポートイベント:**
- `message` (text): テキストメッセージの処理
- `follow`: 新規フォロワーの歓迎
- `unfollow`: フォロワー解除の記録

#### GET `/health`
システムの稼働状況チェック

```json
{
  "status": "ok",
  "timestamp": "2025-08-01T12:00:00.000Z",
  "service": "Agri-AI Webhook Server"
}
```

### エージェント・ツール

#### SupervisorAgent
- **役割**: 全体統制、意図分析、LINE対話最適化
- **主要機能**: ユーザー意図の分析、個別農場コンテキスト管理

#### ReadAgent ツール
- `getFieldInfo`: 圃場情報・作業履歴の取得
- `getDailyRecords`: 過去記録のハイブリッド検索
- `getExternalWeather`: 天気情報の取得・農作業推奨

#### WriteAgent ツール
- `recordDailyWork`: 作業記録・自動ベクトル化・学習データ生成

---

## 🗄️ データベース設計

### MongoDB Collections

#### users
```javascript
{
  userId: "user_1234567890_abcdef",
  lineUserId: "U1234567890abcdef...",
  name: "農場太郎",
  farmId: "farm_hokkaido_001",
  preferences: { notifications: true, language: "ja" },
  createdAt: Date,
  updatedAt: Date
}
```

#### farms
```javascript
{
  farmId: "farm_hokkaido_001",
  farmName: "北海道農場",
  ownerInfo: { name: "農場太郎", contact: "..." },
  location: { address: "北海道札幌市", coordinates: {...} },
  climateZone: "冷涼地",
  soilConditions: "黒土",
  createdAt: Date
}
```

#### fields
```javascript
{
  fieldId: "field_001",
  farmId: "farm_hokkaido_001",
  fieldName: "第一圃場",
  size: 2.5, // ha
  currentCrop: { cropName: "じゃがいも", variety: "男爵" },
  soilType: "黒土",
  characteristics: ["水はけ良好", "有機質豊富"],
  history: [...]
}
```

#### dailyWork (Vector Search対応)
```javascript
{
  recordId: "record_20250801_001",
  userId: "user_1234567890_abcdef",
  fieldId: "field_001",
  workType: "防除",
  description: "薬剤散布作業実施",
  result: { quality: "good", effectiveness: "high" },
  textContent: "防除作業 薬剤散布 第一圃場 晴天",
  embedding: [0.1, 0.2, ..., 0.8], // 768次元ベクトル
  createdAt: Date
}
```

#### personalKnowledge (Vector Search対応)
```javascript
{
  knowledgeId: "knowledge_001",
  userId: "user_1234567890_abcdef",
  title: "第一圃場での効果的な防除タイミング",
  content: "晴天で風速3m/s以下の日に実施すると効果的",
  category: "防除",
  confidence: 0.9,
  relatedRecords: ["record_20250701_001", "record_20250715_002"],
  embedding: [0.1, 0.2, ..., 0.8],
  createdAt: Date
}
```

---

## 🧪 テスト

### テストスイート
- **単体テスト**: 各コンポーネントの動作確認
- **統合テスト**: LINE-Mastra-MongoDB間の連携確認
- **エンドツーエンドテスト**: 完全フローの動作検証

### テスト実行環境
- **環境変数管理**: dotenv統合で設定の分離
- **モックデータ**: faker.js による現実的なテストデータ生成
- **自動クリーンアップ**: テスト後の自動データ削除

### パフォーマンステスト
- 並列処理: 複数エンベディング生成の同時実行
- レスポンス時間: システム全体の応答速度測定
- メモリ使用量: 大量データ処理時のリソース監視

---

## 🔒 セキュリティ

### 実装済みセキュリティ機能
- **機密情報サニタイズ**: ログ・エラーメッセージから認証情報を除去
- **入力検証**: Zodスキーマによる厳密なバリデーション
- **CORS設定**: 適切なオリジン制限
- **セキュリティヘッダー**: Helmetによる各種攻撃対策
- **環境変数検証**: 設定値の存在・形式チェック

### データ保護
- **暗号化通信**: HTTPS/WSS強制
- **個人情報保護**: ユーザーデータの適切な匿名化
- **アクセス制御**: ユーザー固有データの分離

---

## 📈 パフォーマンス最適化

### 実装済み最適化
- **コネクションプール**: MongoDB接続の効率的管理
- **シングルトンパターン**: サービスインスタンスの再利用
- **バッチ処理**: エンベディング生成の一括実行
- **インデックス最適化**: 検索クエリの高速化

### ハイブリッド検索最適化
- **RRF (Reciprocal Rank Fusion)**: 検索結果の統合最適化
- **タスク特化型エンベディング**: RETRIEVAL_DOCUMENT/QUERY最適化
- **個別農場データ優先**: ユーザー固有情報の優先的検索

---

## 🛠️ 開発・コントリビューション

### 開発環境セットアップ
```bash
# 開発依存関係のインストール
npm install --include=dev

# TypeScriptコンパイル（監視モード）
npm run build -- --watch

# リアルタイム開発サーバー
npm run dev
```

### コード品質管理
- **TypeScript**: 厳密な型チェック
- **ESLint**: コード品質の自動チェック
- **Prettier**: コードフォーマットの統一

### ブランチ戦略
- `main`: 本番リリース用
- `develop`: 開発統合ブランチ
- `feature/*`: 機能開発ブランチ

---

## 📊 ログ・モニタリング

### ログ出力
```bash
# システム稼働ログ
✅ MongoDB connected: agri_assistant
🚀 LINE Webhook Server started on port 3000
💬 Message from U1234567890: "今日の作業完了"
🤖 Agent response: 作業記録を保存しました

# エラーログ（機密情報サニタイズ済み）
❌ Database operation failed: Connection timeout
⚠️  Invalid message text from user: Message too long
```

### パフォーマンス監視
- レスポンス時間の計測
- データベース接続状況の監視
- メモリ使用量の追跡
- API呼び出し回数の記録

---

## 🚀 デプロイ

### 本番環境要件
- Node.js 20+ ランタイム
- MongoDB Atlas クラスター（Vector Search対応）
- HTTPS/SSL証明書
- 適切な環境変数設定

### 推奨デプロイ環境
- **クラウドプラットフォーム**: Vercel, Railway, Heroku
- **コンテナ**: Docker対応
- **CI/CD**: GitHub Actions統合可能

---

## 📋 ライセンス

ISC License

---

## 🤝 サポート・お問い合わせ

### 技術的な質問
- **Issues**: [GitHub Issues](https://github.com/tomiyasu0428/Farm_AIagent7/issues)
- **Discussions**: プロジェクト設計・アーキテクチャに関する議論

### ユーザーサポート
- **ユーザーガイド**: [docs/USER_GUIDE.md](./docs/USER_GUIDE.md)
- **セットアップガイド**: [docs/mongodb-atlas-setup-guide.md](./docs/mongodb-atlas-setup-guide.md)

---

## 🎯 ロードマップ

### 短期目標（1-2ヶ月）
- [ ] LIFF ダッシュボードの実装
- [ ] リアルタイム通知機能
- [ ] 多言語対応（英語）

### 中期目標（3-6ヶ月）
- [ ] マルチユーザー・複数農場対応
- [ ] 高度な分析・レポート機能
- [ ] モバイルアプリ対応

### 長期目標（6ヶ月+）
- [ ] IoTセンサー連携
- [ ] 収量予測・経営分析
- [ ] 農協・自治体との連携機能

---

**農業AIエージェント「Agri-Partner」** - あなたの農場専属のデジタルパートナー 🌾🤖

*Made with* ❤️ *for sustainable agriculture*