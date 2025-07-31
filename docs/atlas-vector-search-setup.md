# MongoDB Atlas Vector Search セットアップガイド

## 概要
このガイドでは、Gemini Embeddings API で生成されたベクトル埋め込みを使用して、MongoDB Atlas Vector Search を設定する方法を説明します。

## 前提条件
- MongoDB Atlas クラスター（M10以上推奨）
- Atlas Search が有効になっていること
- 既存のdailyWorkコレクションにembeddingフィールドが追加されていること

## 1. Atlas UIでのVector Search インデックス作成

### 手順
1. MongoDB Atlas にログイン
2. 対象クラスター（agri-ai-cluster）を選択
3. 「Search」タブをクリック
4. 「Create Search Index」を選択
5. 「Atlas Vector Search」を選択

### インデックス設定（JSON）

```json
{
  "fields": [
    {
      "numDimensions": 1536,
      "path": "embedding",
      "similarity": "cosine",
      "type": "vector"
    },
    {
      "path": "userId",
      "type": "filter"
    },
    {
      "path": "fieldId", 
      "type": "filter"
    },
    {
      "path": "workType",
      "type": "filter"
    },
    {
      "path": "date",
      "type": "filter"
    }
  ]
}
```

### インデックス名
- **推奨名**: `dailyWork_vector_index`
- **データベース**: `agri_assistant`
- **コレクション**: `dailyWork`

## 2. テキスト検索インデックス作成

ハイブリッド検索のために、従来のテキスト検索インデックスも必要です。

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "textContent": {
        "type": "string"
      },
      "description": {
        "type": "string"
      },
      "notes": {
        "type": "string"
      },
      "userId": {
        "type": "string"
      },
      "fieldId": {
        "type": "string"
      },
      "workType": {
        "type": "string"
      },
      "date": {
        "type": "date"
      }
    }
  }
}
```

### インデックス名
- **推奨名**: `dailyWork_text_index`

## 3. personalKnowledgeコレクション用Vector Search

```json
{
  "fields": [
    {
      "numDimensions": 1536,
      "path": "embedding",
      "similarity": "cosine", 
      "type": "vector"
    },
    {
      "path": "userId",
      "type": "filter"
    },
    {
      "path": "farmId",
      "type": "filter"
    },
    {
      "path": "category",
      "type": "filter"
    },
    {
      "path": "confidence",
      "type": "filter"
    }
  ]
}
```

### インデックス名
- **推奨名**: `personalKnowledge_vector_index`

## 4. 確認とテスト

### インデックス状態確認
```bash
# MongoDBシェルで確認
db.dailyWork.getIndexes()
```

### Vector Search クエリテスト
```javascript
db.dailyWork.aggregate([
  {
    $vectorSearch: {
      index: "dailyWork_vector_index",
      path: "embedding",
      queryVector: [/* 1536次元のベクトル */],
      numCandidates: 100,
      limit: 10
    }
  }
])
```

## 5. パフォーマンス最適化

### インデックス設定の調整
- `numDimensions`: 1536（Gemini text-embedding-004の標準）
- `similarity`: "cosine"（コサイン類似度、最も一般的）
- フィルターフィールドの追加で絞り込み検索を高速化

### 検索パフォーマンス
- `numCandidates`: 検索結果数の5-10倍を推奨
- `limit`: 実際に必要な結果数
- フィルター条件の活用で検索範囲を限定

## 6. トラブルシューティング

### よくある問題
1. **インデックス作成に時間がかかる**
   - 大量のドキュメントがある場合は正常
   - Atlas UIで進行状況を確認

2. **Vector Searchが動作しない**
   - embeddingフィールドが存在するか確認
   - ベクトルの次元数が正しいか確認
   - インデックスが完全に構築されているか確認

3. **検索結果が不正確**
   - numCandidatesを増やす
   - フィルター条件を調整
   - 類似度閾値を調整

## 7. 監視とメンテナンス

### 監視項目
- インデックスサイズ
- 検索レスポンス時間
- ベクトル埋め込み生成エラー率

### 定期メンテナンス
- 古いembeddingの再生成（モデル更新時）
- インデックス統計の確認
- パフォーマンスの最適化

## 次のステップ
1. Atlas UIでVector Searchインデックスを作成
2. `src/scripts/generate-embeddings.ts`を実行して既存レコードにembeddingを生成
3. ハイブリッド検索のテストを実行
4. パフォーマンスの監視と調整