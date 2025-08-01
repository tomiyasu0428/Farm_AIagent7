import 'dotenv/config';
import { getMongoClient } from '../database/mongodb-client';
import { getEmbeddingService, EmbeddingService } from '../services/embedding-service';

/**
 * 既存の作業記録に対してベクトル埋め込みを生成するスクリプト
 */
async function generateEmbeddingsForExistingRecords() {
  console.log('🚀 Starting embedding generation for existing records...');
  
  const mongoClient = getMongoClient();
  const embeddingService = getEmbeddingService();
  
  try {
    // MongoDB接続
    await mongoClient.connect();
    console.log('✅ Connected to MongoDB');
    
    const dailyWorkCollection = mongoClient.getCollection('dailyWork');
    
    // 埋め込みが未生成の記録を取得
    const recordsWithoutEmbeddings = await dailyWorkCollection.find({
      embedding: { $exists: false }
    }).toArray();
    
    console.log(`📊 Found ${recordsWithoutEmbeddings.length} records without embeddings`);
    
    if (recordsWithoutEmbeddings.length === 0) {
      console.log('✅ All records already have embeddings');
      return;
    }
    
    let processedCount = 0;
    const batchSize = 5; // レート制限を考慮
    
    for (let i = 0; i < recordsWithoutEmbeddings.length; i += batchSize) {
      const batch = recordsWithoutEmbeddings.slice(i, i + batchSize);
      
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recordsWithoutEmbeddings.length / batchSize)}`);
      
      for (const record of batch) {
        try {
          // テキストコンテンツを構築
          const textContent = [
            record.description,
            record.notes || '',
            record.result?.issues?.join(' ') || '',
            record.result?.improvements?.join(' ') || '',
            record.materials?.map((m: any) => `${m.name} ${m.amount}${m.unit}`).join(' ') || '',
          ].filter(Boolean).join(' ');
          
          const optimizedText = EmbeddingService.optimizeTextForEmbedding(textContent);
          
          console.log(`🔄 Generating embedding for record: ${record.recordId}`);
          
          // 埋め込み生成（ドキュメント保存用）
          const embedding = await embeddingService.generateEmbedding(optimizedText, 1536, 'RETRIEVAL_DOCUMENT');
          
          // データベース更新
          await dailyWorkCollection.updateOne(
            { _id: record._id },
            { 
              $set: { 
                embedding,
                embeddingGeneratedAt: new Date(),
                embeddingModel: 'models/text-embedding-004',
                embeddingDimensions: 1536
              } 
            }
          );
          
          processedCount++;
          console.log(`✅ Updated record ${record.recordId} (${processedCount}/${recordsWithoutEmbeddings.length})`);
          
          // レート制限対策
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ Failed to process record ${record.recordId}:`, error.message);
        }
      }
      
      // バッチ間の休憩
      if (i + batchSize < recordsWithoutEmbeddings.length) {
        console.log('⏱️  Waiting 2 seconds between batches...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`\n🎉 Embedding generation completed!`);
    console.log(`📊 Successfully processed: ${processedCount}/${recordsWithoutEmbeddings.length} records`);
    
    // 統計情報
    const totalRecords = await dailyWorkCollection.countDocuments();
    const recordsWithEmbeddings = await dailyWorkCollection.countDocuments({
      embedding: { $exists: true }
    });
    
    console.log(`\n📈 Database Statistics:`);
    console.log(`   Total records: ${totalRecords}`);
    console.log(`   Records with embeddings: ${recordsWithEmbeddings}`);
    console.log(`   Coverage: ${Math.round((recordsWithEmbeddings / totalRecords) * 100)}%`);
    
  } catch (error) {
    console.error('❌ Embedding generation failed:', error);
    throw error;
  } finally {
    await mongoClient.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

/**
 * 埋め込み検索のテスト
 */
async function testEmbeddingSearch() {
  console.log('\n🧪 Testing embedding search...');
  
  const mongoClient = getMongoClient();
  const embeddingService = getEmbeddingService();
  
  try {
    await mongoClient.connect();
    
    const testQueries = [
      '播種 作業',
      '防除 薬剤散布',
      '施肥 化成肥料',
      '収穫 品質 良好'
    ];
    
    for (const query of testQueries) {
      console.log(`\n🔍 Testing query: "${query}"`);
      
      try {
        const queryEmbedding = await embeddingService.generateEmbedding(query, 1536, 'RETRIEVAL_QUERY');
        console.log(`✅ Generated query embedding: ${queryEmbedding.length}D vector`);
        
        // コサイン類似度テスト（サンプル）
        const sampleVector = Array.from({ length: 1536 }, () => Math.random());
        const similarity = EmbeddingService.calculateCosineSimilarity(queryEmbedding, sampleVector);
        console.log(`📊 Sample similarity score: ${similarity.toFixed(4)}`);
        
      } catch (error) {
        console.error(`❌ Query test failed: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Embedding search test failed:', error);
  } finally {
    await mongoClient.disconnect();
  }
}

// メイン実行
async function main() {
  try {
    await generateEmbeddingsForExistingRecords();
    await testEmbeddingSearch();
  } catch (error) {
    console.error('❌ Script execution failed:', error);
    process.exit(1);
  }
}

// スクリプトとして実行される場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateEmbeddingsForExistingRecords, testEmbeddingSearch };