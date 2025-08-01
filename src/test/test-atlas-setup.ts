import 'dotenv/config';
import { getMongoClient } from '../database/mongodb-client.js';

/**
 * MongoDB Atlas設定状況テスト
 * 実際のデータベース状態を確認
 */
async function testAtlasSetup() {
  console.log('🧪 MongoDB Atlas設定状況テスト...\n');
  
  const mongoClient = getMongoClient();
  
  try {
    // 1. 接続テスト
    console.log('🔌 MongoDB Atlas接続テスト...');
    await mongoClient.connect();
    const healthCheck = await mongoClient.healthCheck();
    console.log(`✅ 接続状態: ${healthCheck ? 'OK' : 'Failed'}`);
    
    // 2. データベース・コレクション確認
    console.log('\n📊 データベース状況確認...');
    await checkCollectionsStatus(mongoClient);
    
    // 3. インデックス状況確認
    console.log('\n🔍 インデックス状況確認...');
    await checkIndexesStatus(mongoClient);
    
    // 4. エンベディング状況確認
    console.log('\n🧮 エンベディング状況確認...');
    await checkEmbeddingStatus(mongoClient);
    
    // 5. Vector Search準備状況確認
    console.log('\n🚀 Vector Search準備状況確認...');
    await checkVectorSearchReadiness(mongoClient);
    
    console.log('\n🎯 Atlas設定状況テスト完了');
    return true;
    
  } catch (error) {
    console.error('❌ Atlas設定テスト失敗:', error);
    return false;
  } finally {
    await mongoClient.disconnect();
    console.log('👋 MongoDB接続を閉じました');
  }
}

/**
 * コレクション状況確認
 */
async function checkCollectionsStatus(mongoClient: any) {
  const collections = ['users', 'farms', 'fields', 'dailyWork', 'personalKnowledge'];
  
  for (const collectionName of collections) {
    try {
      const collection = mongoClient.getCollection(collectionName);
      const count = await collection.countDocuments();
      const sampleDoc = await collection.findOne();
      
      console.log(`📄 ${collectionName}: ${count}件のドキュメント`);
      
      if (sampleDoc) {
        const fields = Object.keys(sampleDoc).filter(key => key !== '_id');
        console.log(`   主要フィールド: ${fields.slice(0, 5).join(', ')}${fields.length > 5 ? '...' : ''}`);
      }
    } catch (error) {
      console.log(`❌ ${collectionName}: アクセスエラー`);
    }
  }
}

/**
 * インデックス状況確認
 */
async function checkIndexesStatus(mongoClient: any) {
  const collectionsToCheck = [
    { name: 'dailyWork', critical: ['userId_1_fieldId_1_date_-1', 'textContent_text_description_text_notes_text'] },
    { name: 'personalKnowledge', critical: ['farmId_1_userId_1_category_1_confidence_-1'] },
    { name: 'users', critical: ['lineUserId_1'] }
  ];
  
  for (const { name, critical } of collectionsToCheck) {
    try {
      const collection = mongoClient.getCollection(name);
      const indexes = await collection.indexes();
      
      console.log(`🔍 ${name} インデックス状況:`);
      console.log(`   総インデックス数: ${indexes.length}`);
      
      // 重要なインデックスの確認
      const indexNames = indexes.map((idx: any) => idx.name);
      for (const criticalIndex of critical) {
        const exists = indexNames.some((name: string) => name.includes(criticalIndex.split('_')[0]));
        console.log(`   ${criticalIndex}: ${exists ? '✅' : '❌'}`);
      }
      
      // テキスト検索インデックスの確認
      const textIndex = indexes.find((idx: any) => 
        idx.key && Object.values(idx.key).includes('text')
      );
      if (textIndex) {
        console.log(`   テキスト検索: ✅ (${Object.keys(textIndex.key).join(', ')})`);
      } else {
        console.log(`   テキスト検索: ❌ 未設定`);
      }
      
    } catch (error) {
      console.log(`❌ ${name} インデックス確認エラー:`, error.message);
    }
  }
}

/**
 * エンベディング状況確認
 */
async function checkEmbeddingStatus(mongoClient: any) {
  const embeddingCollections = ['dailyWork', 'personalKnowledge'];
  
  for (const collectionName of embeddingCollections) {
    try {
      const collection = mongoClient.getCollection(collectionName);
      
      const totalDocs = await collection.countDocuments();
      const embeddedDocs = await collection.countDocuments({ embedding: { $exists: true } });
      const coverage = totalDocs > 0 ? Math.round((embeddedDocs / totalDocs) * 100) : 0;
      
      console.log(`🧮 ${collectionName} エンベディング状況:`);
      console.log(`   総ドキュメント: ${totalDocs}`);
      console.log(`   エンベディング済み: ${embeddedDocs}`);
      console.log(`   カバレッジ: ${coverage}%`);
      
      if (embeddedDocs > 0) {
        const sampleEmbedding = await collection.findOne({ embedding: { $exists: true } });
        if (sampleEmbedding?.embedding) {
          console.log(`   次元数: ${sampleEmbedding.embedding.length}D`);
          console.log(`   モデル: ${sampleEmbedding.embeddingModel || 'unknown'}`);
        }
      }
      
      // エンベディング生成が必要かどうかの判定
      if (coverage < 100 && totalDocs > 0) {
        console.log(`   ⚠️  ${totalDocs - embeddedDocs}件のドキュメントにエンベディング生成が必要`);
        console.log(`   推奨アクション: npm run generate:embeddings`);
      }
      
    } catch (error) {
      console.log(`❌ ${collectionName} エンベディング確認エラー:`, error.message);
    }
  }
}

/**
 * Vector Search準備状況確認
 */
async function checkVectorSearchReadiness(mongoClient: any) {
  console.log('🚀 Vector Search準備状況:');
  
  // 1. エンベディングデータの存在確認
  try {
    const dailyWorkCollection = mongoClient.getCollection('dailyWork');
    const embeddedCount = await dailyWorkCollection.countDocuments({ embedding: { $exists: true } });
    
    if (embeddedCount > 0) {
      console.log('✅ エンベディングデータ: 利用可能');
      console.log(`   ${embeddedCount}件のベクトル化済みドキュメント`);
    } else {
      console.log('❌ エンベディングデータ: 不足');
      console.log('   推奨アクション: npm run generate:embeddings');
    }
  } catch (error) {
    console.log('❌ エンベディングデータ確認エラー:', error.message);
  }
  
  // 2. Vector Searchインデックス設定ガイド
  console.log('\n📋 次のステップ:');
  console.log('1. MongoDB Atlas UI でVector Searchインデックス作成');
  console.log('   - インデックス名: dailyWork_vector_index');
  console.log('   - パス: embedding');
  console.log('   - 次元: 1536');
  console.log('   - 類似度: cosine');
  console.log('');
  console.log('2. 設定用JSONファイル参照:');
  console.log('   scripts/create-vector-search-config.json');
  console.log('');
  console.log('3. 詳細ガイド参照:');
  console.log('   docs/mongodb-atlas-setup-guide.md');
  
  // 3. 設定完了後のテストコマンド
  console.log('\n🧪 設定完了後のテストコマンド:');
  console.log('   npm run test:hybrid-search  # ハイブリッド検索テスト');
  console.log('   npm run test:embeddings     # エンベディングテスト');
  console.log('   npm run test               # LINE統合テスト');
}

/**
 * Atlas設定推奨アクション生成
 */
function generateRecommendedActions(results: any) {
  console.log('\n💡 推奨アクション:');
  
  const actions = [];
  
  if (results.missingIndexes) {
    actions.push('npm run setup:indexes  # 基本インデックス作成');
  }
  
  if (results.missingEmbeddings) {
    actions.push('npm run generate:embeddings  # エンベディング生成');
  }
  
  if (results.needsVectorSearch) {
    actions.push('MongoDB Atlas UI でVector Searchインデックス作成');
  }
  
  actions.forEach((action, index) => {
    console.log(`${index + 1}. ${action}`);
  });
}

// 直接実行する場合
if (import.meta.url === `file://${process.argv[1]}`) {
  testAtlasSetup()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testAtlasSetup };