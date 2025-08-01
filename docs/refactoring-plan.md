# リファクタリング計画書

## 🎯 目的
プロジェクトの保守性、安全性、パフォーマンスを向上させ、長期的な開発効率を改善する。

## 📊 分析結果サマリー

### 深刻度レベル
- **🚨 緊急**: 6項目（型安全性、セキュリティ）
- **⚠️ 高**: 8項目（アーキテクチャ、パフォーマンス）
- **⚡ 中**: 12項目（テスト、ドキュメント）

---

## Phase 1: 緊急対応（1週間）

### 1.1 型安全性改善
**優先度**: 🚨 緊急

#### 対象ファイル
- `src/database/mongodb-client.ts`
- `src/mastra/tools/daily-record-tool.ts`
- `src/line/webhook-server.ts`

#### 具体的問題
```typescript
// ❌ 現在: any型の使用
getCollection<T = any>(name: string): Collection<T>
materials?.map((m: any) => m.name)

// ✅ 改善後: 厳密な型定義
interface MaterialType {
  name: string;
  amount: string;
  unit: string;
}
getCollection<T extends Document>(name: string): Collection<T>
materials?.map((m: MaterialType) => m.name)
```

#### 改善作業
1. 統一型定義ファイル作成: `src/types/index.ts`
2. 全てのany型を具体的型に変更
3. レスポンス形式の統一インターフェース作成

### 1.2 セキュリティ強化
**優先度**: 🚨 緊急

#### 機密情報サニタイズ改善
```typescript
// ❌ 現在: 不完全なサニタイズ
private sanitizeError(error: any): string {
  if (error && error.message) {
    return error.message.replace(/\/\/.*:.*@/g, '//***:***@');
  }
  return String(error);
}

// ✅ 改善後: 完全なサニタイズ
private sanitizeError(error: any): string {
  if (error && error.message) {
    return error.message
      .replace(/mongodb\+srv:\/\/[^@]+@/gi, 'mongodb+srv://***:***@')
      .replace(/\/\/[^@]+@/g, '//***:***@')
      .replace(/password[=:][^&\s]+/gi, 'password=***')
      .replace(/key[=:][^&\s]+/gi, 'key=***');
  }
  return 'Database operation failed';
}
```

#### LINE Webhook検証強化
```typescript
// ✅ 改善後: スキーマ検証追加
import { z } from 'zod';

const LineWebhookEventSchema = z.object({
  type: z.enum(['message', 'follow', 'unfollow']),
  source: z.object({
    userId: z.string().min(1)
  }),
  message: z.object({
    type: z.enum(['text', 'image', 'video']),
    text: z.string().optional()
  }).optional()
});
```

### 1.3 設定管理集約
**優先度**: 🚨 緊急

#### 設定クラス作成
```typescript
// 新規: src/config/index.ts
export class AppConfig {
  static readonly EMBEDDING = {
    MODEL: 'models/text-embedding-004',
    DIMENSIONS: 1536,
    BATCH_SIZE: 5
  };
  
  static readonly GEMINI = {
    MODEL: 'models/gemini-2.5-flash',
    MAX_TOKENS: 8000
  };
  
  static readonly DATABASE = {
    DEFAULT_DB: 'agri_assistant',
    CONNECTION_TIMEOUT: 30000
  };
}
```

---

## Phase 2: アーキテクチャ改善（2週間）

### 2.1 責務分離
**優先度**: ⚠️ 高

#### daily-record-tool.ts分割
```
src/mastra/tools/
├── daily-record/
│   ├── record-tool.ts        # 記録作成
│   ├── search-tool.ts        # 記録検索  
│   ├── analyzer.ts           # 分析機能
│   └── validator.ts          # 入力検証
```

#### LineWebhookServer分割
```
src/line/
├── webhook-server.ts         # HTTP処理のみ
├── message-handler.ts        # メッセージ処理
├── user-manager.ts          # ユーザー管理
└── response-formatter.ts    # レスポンス整形
```

### 2.2 依存性注入導入
```typescript
// ✅ 改善後: DIパターン
interface IEmbeddingService {
  generateEmbedding(text: string): Promise<number[]>;
}

interface IHybridSearchService {
  search(query: string): Promise<SearchResult[]>;
}

class DailyRecordService {
  constructor(
    private embeddingService: IEmbeddingService,
    private searchService: IHybridSearchService,
    private mongoClient: IMongoClient
  ) {}
}
```

---

## Phase 3: パフォーマンス最適化（2週間）

### 3.1 メモリ使用量最適化

#### ストリーミング処理導入
```typescript
// ✅ 改善後: ストリーミングRRF処理
private async fuseResultsStream<T>(
  keywordResults: AsyncIterable<T>,
  vectorResults: AsyncIterable<T>,
  k: number = 60
): Promise<AsyncIterable<T>> {
  // ストリーミング処理で メモリ使用量を制限
}
```

#### バッチサイズ制限
```typescript
// ✅ 改善後: バッチサイズ制御
async generateBatchEmbeddings(
  texts: string[], 
  batchSize: number = AppConfig.EMBEDDING.BATCH_SIZE
): Promise<number[][]> {
  const batches = this.createBatches(texts, batchSize);
  // バッチごとに処理してメモリ使用量を制御
}
```

### 3.2 データベース最適化

#### インデックス戦略改善
```javascript
// 最適化されたインデックス設計
{
  "userId_workType_date": { userId: 1, workType: 1, date: -1 },
  "userId_embedding_sparse": { userId: 1, embedding: 1 }, // sparse index
  "textContent_fulltext": { textContent: "text", weight: 10 }
}
```

---

## Phase 4: テスト・監視改善（継続的）

### 4.1 テスト基盤改善
- **モック使用**: 外部依存を排除した独立テスト
- **型安全テスト**: TypeScript型チェック統合
- **カバレッジ向上**: 90%以上のテストカバレッジ

### 4.2 監視・ログ改善
- **構造化ログ**: JSON形式の統一ログ
- **メトリクス収集**: パフォーマンス指標の自動収集
- **アラート設定**: 異常状態の早期検出

---

## 📅 実装スケジュール

| Phase | 期間 | 主要作業 | 成果指標 |
|-------|------|---------|---------|
| Phase 1 | 1週間 | 型安全性・セキュリティ・設定管理 | TypeScript エラー0、セキュリティ脆弱性0 |
| Phase 2 | 2週間 | アーキテクチャ改善・責務分離 | ファイル行数50%削減、テスト容易性向上 |
| Phase 3 | 2週間 | パフォーマンス最適化 | メモリ使用量50%削減、レスポンス時間30%改善 |
| Phase 4 | 継続的 | テスト・監視改善 | テストカバレッジ90%、監視メトリクス100% |

---

## 🎯 期待される効果

### 短期効果
- **安全性向上**: セキュリティリスクの大幅削減
- **開発効率**: TypeScript型チェックによる開発時エラー削減
- **保守性向上**: 設定集約による変更作業の簡素化

### 長期効果
- **拡張性**: 新機能追加の容易性向上
- **性能向上**: メモリ使用量とレスポンス時間の改善
- **品質向上**: テストカバレッジによる品質保証

---

## 📋 次のアクション

### 最優先タスク
1. **型定義ファイル作成**: `src/types/index.ts`
2. **設定クラス作成**: `src/config/index.ts`
3. **セキュリティサニタイズ強化**: 機密情報の完全除去

### 開始推奨順序
1. Phase 1 (緊急) → すぐに開始
2. Phase 2 (高優先) → Phase 1完了後
3. Phase 3 (最適化) → Phase 2完了後
4. Phase 4 (継続改善) → 並行実行

このリファクタリング計画により、プロジェクトの技術的負債を解消し、長期的な開発効率と品質を大幅に向上させることができます。