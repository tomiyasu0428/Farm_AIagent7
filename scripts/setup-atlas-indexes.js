/**
 * MongoDB Atlas インデックス設定スクリプト
 * Vector Search + Text Search インデックスの自動作成
 */

// MongoDB接続設定
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const connectionString = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DATABASE || 'agri_assistant';

async function setupAtlasIndexes() {
  console.log('🚀 MongoDB Atlas インデックス設定開始...\n');
  
  if (!connectionString) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  const client = new MongoClient(connectionString);
  
  try {
    await client.connect();
    console.log('✅ MongoDB Atlas に接続完了');
    
    const db = client.db(dbName);
    
    // 1. dailyWork コレクション用インデックス
    await setupDailyWorkIndexes(db);
    
    // 2. personalKnowledge コレクション用インデックス  
    await setupPersonalKnowledgeIndexes(db);
    
    // 3. 他のコレクション用基本インデックス
    await setupBasicIndexes(db);
    
    console.log('\n🎉 全てのインデックス設定が完了しました！');
    console.log('\n📋 次のステップ:');
    console.log('1. MongoDB Atlas UI でVector Searchインデックスを作成');
    console.log('2. エンベディング生成スクリプトを実行');
    console.log('3. ハイブリッド検索テストを実行');
    
  } catch (error) {
    console.error('❌ インデックス設定エラー:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('👋 MongoDB接続を閉じました');
  }
}

/**
 * dailyWork コレクション用インデックス設定
 */
async function setupDailyWorkIndexes(db) {
  console.log('\n📊 dailyWork コレクション用インデックス設定...');
  
  const collection = db.collection('dailyWork');
  
  try {
    // テキスト検索用複合インデックス
    console.log('  🔍 テキスト検索インデックス作成中...');
    await collection.createIndex(
      { 
        textContent: 'text', 
        description: 'text', 
        notes: 'text',
        'materials.name': 'text'
      },
      { 
        name: 'dailyWork_text_search',
        default_language: 'none', // 日本語対応
        weights: {
          textContent: 10,
          description: 8,
          notes: 5,
          'materials.name': 3
        }
      }
    );
    console.log('  ✅ テキスト検索インデックス作成完了');

    // ユーザー・圃場・日付用複合インデックス
    console.log('  📅 ユーザー・圃場・日付インデックス作成中...');
    await collection.createIndex(
      { userId: 1, fieldId: 1, date: -1 },
      { name: 'dailyWork_user_field_date' }
    );
    console.log('  ✅ ユーザー・圃場・日付インデックス作成完了');

    // 作業種別・品質用インデックス
    console.log('  🔧 作業種別・品質インデックス作成中...');
    await collection.createIndex(
      { userId: 1, workType: 1, 'result.quality': 1, date: -1 },
      { name: 'dailyWork_user_worktype_quality' }
    );
    console.log('  ✅ 作業種別・品質インデックス作成完了');

    // タグ検索用インデックス
    console.log('  🏷️  タグ検索インデックス作成中...');
    await collection.createIndex(
      { userId: 1, tags: 1, date: -1 },
      { name: 'dailyWork_user_tags' }
    );
    console.log('  ✅ タグ検索インデックス作成完了');

    // エンベディング存在確認用インデックス
    console.log('  🧮 エンベディング確認インデックス作成中...');
    await collection.createIndex(
      { embedding: 1, userId: 1 },
      { 
        name: 'dailyWork_embedding_exists',
        sparse: true // embeddingが存在するドキュメントのみ
      }
    );
    console.log('  ✅ エンベディング確認インデックス作成完了');

    console.log('✅ dailyWork インデックス設定完了\n');
    
  } catch (error) {
    console.error('❌ dailyWork インデックス設定エラー:', error.message);
  }
}

/**
 * personalKnowledge コレクション用インデックス設定
 */
async function setupPersonalKnowledgeIndexes(db) {
  console.log('🧠 personalKnowledge コレクション用インデックス設定...');
  
  const collection = db.collection('personalKnowledge');
  
  try {
    // テキスト検索用インデックス
    console.log('  🔍 ナレッジテキスト検索インデックス作成中...');
    await collection.createIndex(
      { 
        title: 'text', 
        content: 'text',
        tags: 'text'
      },
      { 
        name: 'personalKnowledge_text_search',
        default_language: 'none',
        weights: {
          title: 10,
          content: 8,
          tags: 5
        }
      }
    );
    console.log('  ✅ ナレッジテキスト検索インデックス作成完了');

    // 農場・カテゴリ・信頼度用インデックス
    console.log('  🏭 農場・カテゴリ・信頼度インデックス作成中...');
    await collection.createIndex(
      { farmId: 1, userId: 1, category: 1, confidence: -1 },
      { name: 'personalKnowledge_farm_category_confidence' }
    );
    console.log('  ✅ 農場・カテゴリ・信頼度インデックス作成完了');

    // 最終使用日用インデックス
    console.log('  ⏰ 最終使用日インデックス作成中...');
    await collection.createIndex(
      { userId: 1, lastUsed: -1, confidence: -1 },
      { name: 'personalKnowledge_user_lastused' }
    );
    console.log('  ✅ 最終使用日インデックス作成完了');

    console.log('✅ personalKnowledge インデックス設定完了\n');
    
  } catch (error) {
    console.error('❌ personalKnowledge インデックス設定エラー:', error.message);
  }
}

/**
 * 基本コレクション用インデックス設定
 */
async function setupBasicIndexes(db) {
  console.log('📚 基本コレクション用インデックス設定...');
  
  try {
    // users コレクション
    console.log('  👤 users インデックス作成中...');
    const usersCollection = db.collection('users');
    await usersCollection.createIndex(
      { lineUserId: 1 },
      { name: 'users_line_user_id', unique: true }
    );
    await usersCollection.createIndex(
      { userId: 1 },
      { name: 'users_user_id', unique: true }
    );
    console.log('  ✅ users インデックス作成完了');

    // farms コレクション
    console.log('  🏭 farms インデックス作成中...');
    const farmsCollection = db.collection('farms');
    await farmsCollection.createIndex(
      { farmId: 1 },
      { name: 'farms_farm_id', unique: true }
    );
    console.log('  ✅ farms インデックス作成完了');

    // fields コレクション
    console.log('  🌾 fields インデックス作成中...');
    const fieldsCollection = db.collection('fields');
    await fieldsCollection.createIndex(
      { fieldId: 1 },
      { name: 'fields_field_id', unique: true }
    );
    await fieldsCollection.createIndex(
      { farmId: 1 },
      { name: 'fields_farm_id' }
    );
    console.log('  ✅ fields インデックス作成完了');

    console.log('✅ 基本コレクションインデックス設定完了\n');
    
  } catch (error) {
    console.error('❌ 基本インデックス設定エラー:', error.message);
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  setupAtlasIndexes()
    .then(() => {
      console.log('🎯 インデックス設定スクリプト完了');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 インデックス設定スクリプト失敗:', error);
      process.exit(1);
    });
}

export { setupAtlasIndexes };