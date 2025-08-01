# MongoDB Atlas Vector Search 完全セットアップガイド

## 🎯 概要
このガイドでは、農業AIエージェントシステム用のMongoDB Atlas Vector Searchを完全に設定する手順を説明します。

## 📋 前提条件
- MongoDB Atlas アカウント
- M10以上のクラスター（Vector Search対応）
- `MONGODB_URI`環境変数が設定済み
- Gemini API キーが設定済み

## 🚀 セットアップ手順

### ステップ1: 基本インデックス作成

```bash
# 基本的なデータベースインデックスを自動作成
npm run setup:indexes
```

このコマンドで以下が作成されます：
- テキスト検索インデックス
- ユーザー・圃場・日付複合インデックス
- 作業種別・品質インデックス
- その他最適化インデックス

### ステップ2: Atlas UI でのVector Search設定

#### 2.1 dailyWork用Vector Searchインデックス

1. **MongoDB Atlas UI にアクセス**
   - https://cloud.mongodb.com にログイン
   - 対象クラスター選択

2. **Search タブ → Create Search Index**
   - "Atlas Vector Search" を選択
   - "JSON Editor" を選択

3. **インデックス設定**
   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 1536,
         "similarity": "cosine"
       },
       {
         "type": "filter", 
         "path": "userId"
       },
       {
         "type": "filter",
         "path": "fieldId"
       },
       {
         "type": "filter", 
         "path": "workType"
       },
       {
         "type": "filter",
         "path": "date"
       },
       {
         "type": "filter",
         "path": "result.quality"
       }
     ]
   }
   ```

4. **インデックス情報**
   - インデックス名: `dailyWork_vector_index`
   - データベース: `agri_assistant`
   - コレクション: `dailyWork`

#### 2.2 personalKnowledge用Vector Searchインデックス

同様の手順で2つ目のインデックスを作成：

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding", 
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "userId"
    },
    {
      "type": "filter",
      "path": "farmId"
    },
    {
      "type": "filter",
      "path": "category"
    },
    {
      "type": "filter", 
      "path": "confidence"
    }
  ]
}
```

- インデックス名: `personalKnowledge_vector_index`
- データベース: `agri_assistant`
- コレクション: `personalKnowledge`

### ステップ3: エンベディング生成

```bash
# 既存データにベクトル埋め込みを生成
npm run generate:embeddings
```

このコマンドで：
- 既存の作業記録データを取得
- Gemini Embeddings APIでベクトル化
- embeddingフィールドに保存
- 進行状況をリアルタイム表示

### ステップ4: 動作確認

```bash
# エンベディングシステムテスト
npm run test:embeddings

# ハイブリッド検索システムテスト  
npm run test:hybrid-search

# LINE統合テスト
npm run test
```

## 🔧 トラブルシューティング

### インデックス作成エラー

**症状**: Vector Searchインデックス作成が失敗
**原因と対策**:
- ✅ M10以上のクラスターを使用しているか確認
- ✅ embeddingフィールドを持つドキュメントが存在するか確認
- ✅ ベクトル次元数が1536になっているか確認

### 検索結果が返らない

**症状**: Vector Searchクエリで結果が0件
**原因と対策**:
- ✅ インデックスが'Active'状態になっているか確認（数分かかる場合あり）
- ✅ フィルター条件が正しく設定されているか確認
- ✅ numCandidatesをlimitの5-10倍に設定

### パフォーマンス問題

**症状**: 検索が遅い
**原因と対策**:
- ✅ numCandidatesを調整（デフォルト: limit * 5）
- ✅ フィルター条件を活用して検索範囲を限定
- ✅ 不要なフィールドのインデックスを削除

### エンベディング生成エラー

**症状**: Gemini API エラー
**原因と対策**:
- ✅ `GOOGLE_API_KEY`が正しく設定されているか確認
- ✅ API制限に達していないか確認
- ✅ ネットワーク接続を確認

## 📊 設定確認方法

### インデックス状態確認
```bash
# MongoDB Shellで確認
db.dailyWork.getIndexes()
```

### Vector Search動作確認
```javascript
// サンプルVector Searchクエリ
db.dailyWork.aggregate([
  {
    $vectorSearch: {
      index: "dailyWork_vector_index",
      path: "embedding",
      queryVector: [/* 1536次元のベクトル */],
      numCandidates: 100,
      limit: 10,
      filter: { userId: "test_user_001" }
    }
  }
])
```

### エンベディング確認
```javascript
// エンベディング存在確認
db.dailyWork.find(
  { embedding: { $exists: true } },
  { recordId: 1, embeddingDimensions: 1, embeddingGeneratedAt: 1 }
).limit(5)
```

## 🎯 期待される結果

設定完了後、以下が動作します：

1. **ハイブリッド検索**: キーワード + ベクトル検索の統合
2. **意味的類似検索**: 類似した農作業記録の発見
3. **個別農場最適化**: ユーザー固有の経験データ活用
4. **高速検索**: 最適化されたインデックス構成

## 📝 次のステップ

Vector Search設定完了後：

1. **エンドツーエンドテスト実施**
2. **LINE統合テスト**
3. **本番環境デプロイ準備**

## 💡 ベストプラクティス

- **定期的なインデックス最適化**: 月1回程度のメンテナンス
- **エンベディングの再生成**: モデル更新時の対応
- **パフォーマンス監視**: レスポンス時間とリソース使用量の追跡

---

**重要**: Vector Searchインデックス作成には数分かかる場合があります。インデックスが'Building'状態の間は検索機能が制限されます。