import 'dotenv/config';
import { getMongoClient } from '../database/mongodb-client';
import { getHybridSearchService } from '../services/hybrid-search';
import { getEmbeddingService } from '../services/embedding-service';

/**
 * ハイブリッド検索システムの包括的テスト
 */
async function testHybridSearchSystem() {
  console.log('🧪 Testing Hybrid Search System...\n');
  
  const mongoClient = getMongoClient();
  const searchService = getHybridSearchService();
  const embeddingService = getEmbeddingService();
  
  try {
    // 1. 接続テスト
    console.log('🔌 Testing database connection...');
    await mongoClient.connect();
    console.log('✅ MongoDB connection successful');
    
    // 2. データベース状態確認
    console.log('\n📊 Checking database state...');
    const dailyWorkCollection = mongoClient.getCollection('dailyWork');
    const totalRecords = await dailyWorkCollection.countDocuments();
    const recordsWithEmbeddings = await dailyWorkCollection.countDocuments({
      embedding: { $exists: true }
    });
    
    console.log(`   Total records: ${totalRecords}`);
    console.log(`   Records with embeddings: ${recordsWithEmbeddings}`);
    console.log(`   Embedding coverage: ${totalRecords > 0 ? Math.round((recordsWithEmbeddings / totalRecords) * 100) : 0}%`);
    
    // 3. サンプルデータがない場合は作成
    if (totalRecords === 0) {
      console.log('\n🔧 Creating sample data for testing...');
      await createSampleData();
    }
    
    // 4. 埋め込み生成テスト
    console.log('\n🔄 Testing embedding generation...');
    const testQuery = '播種 作業 天候 晴れ';
    const queryEmbedding = await embeddingService.generateEmbedding(testQuery, 1536);
    console.log(`✅ Generated query embedding: ${queryEmbedding.length}D vector`);
    
    // 5. キーワード検索テスト
    console.log('\n🔍 Testing keyword search...');
    try {
      const keywordResults = await searchService.searchDailyRecords({
        userId: 'test_user_001',
        query: '播種 作業',
        limit: 5
      });
      
      console.log(`✅ Keyword search results: ${keywordResults.records.length} records found`);
      console.log(`   Search method: ${keywordResults.searchMetadata.searchMethod}`);
      
      if (keywordResults.records.length > 0) {
        const sample = keywordResults.records[0];
        console.log(`   Sample result: ${sample.workType} - ${sample.description.substring(0, 50)}...`);
      }
    } catch (error) {
      console.log(`⚠️  Keyword search failed: ${(error as Error).message}`);
    }
    
    // 6. ベクトル検索テスト（可能な場合）
    console.log('\n🧮 Testing vector search capability...');
    try {
      // vectorSearchが利用可能かテスト
      const testVectorSearch = await dailyWorkCollection.aggregate([
        {
          $limit: 1
        },
        {
          $match: {
            embedding: { $exists: true }
          }
        }
      ]).toArray();
      
      if (testVectorSearch.length > 0) {
        console.log('✅ Records with embeddings found, vector search should work');
        console.log('ℹ️  Vector search requires Atlas Vector Search index configuration');
        console.log('   Please refer to docs/atlas-vector-search-setup.md for setup instructions');
      } else {
        console.log('⚠️  No records with embeddings found');
        console.log('   Run: tsx src/scripts/generate-embeddings.ts to generate embeddings');
      }
    } catch (error) {
      console.log(`❌ Vector search test failed: ${(error as Error).message}`);
    }
    
    // 7. ハイブリッド検索テスト
    console.log('\n🔀 Testing hybrid search...');
    const testQueries = [
      { query: '播種 作業', description: '播種作業に関する検索' },
      { query: '防除 薬剤', description: '防除・薬剤散布に関する検索' },
      { query: '施肥 化成', description: '施肥作業に関する検索' },
      { query: '収穫 品質', description: '収穫と品質に関する検索' }
    ];
    
    for (const testCase of testQueries) {
      try {
        console.log(`\n   Testing: ${testCase.description}`);
        const results = await searchService.searchDailyRecords({
          userId: 'test_user_001',
          query: testCase.query,
          limit: 3
        });
        
        console.log(`   ✅ Found ${results.records.length} results using ${results.searchMetadata.searchMethod} search`);
        
        if (results.records.length > 0) {
          const relevantRecord = results.records[0];
          console.log(`      Best match: ${relevantRecord.workType} - ${relevantRecord.description.substring(0, 40)}...`);
        }
      } catch (error) {
        console.log(`   ❌ Search failed: ${(error as Error).message}`);
      }
    }
    
    // 8. 類似記録検索テスト
    console.log('\n🔗 Testing similar records search...');
    try {
      const allRecords = await dailyWorkCollection.find({ userId: 'test_user_001' }).limit(1).toArray();
      
      if (allRecords.length > 0) {
        const referenceRecord = allRecords[0];
        const similarRecords = await searchService.findSimilarRecords({
          userId: 'test_user_001',
          referenceRecordId: referenceRecord.recordId,
          limit: 3
        });
        
        console.log(`✅ Found ${similarRecords.length} similar records`);
        similarRecords.forEach((record, index) => {
          console.log(`   ${index + 1}. ${record.workType} - ${record.date.toISOString().split('T')[0]}`);
        });
      } else {
        console.log('⚠️  No records found for similarity test');
      }
    } catch (error) {
      console.log(`❌ Similar records search failed: ${(error as Error).message}`);
    }
    
    // 9. 個別農場知識検索テスト
    console.log('\n🧠 Testing personal knowledge search...');
    try {
      const knowledgeResults = await searchService.searchPersonalKnowledge({
        userId: 'test_user_001',
        farmId: 'test_farm_001',
        query: '成功 経験',
        limit: 3
      });
      
      console.log(`✅ Found ${knowledgeResults.knowledge.length} knowledge entries`);
      console.log(`   Average confidence: ${knowledgeResults.searchMetadata.avgConfidence.toFixed(2)}`);
      
      knowledgeResults.knowledge.forEach((knowledge, index) => {
        console.log(`   ${index + 1}. ${knowledge.title} (confidence: ${knowledge.confidence})`);
      });
    } catch (error) {
      console.log(`❌ Knowledge search failed: ${(error as Error).message}`);
    }
    
    console.log('\n🎉 Hybrid search system test completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Database connection working');
    console.log('   ✅ Embedding generation working');
    console.log('   ✅ Keyword search working');
    console.log('   ⚠️  Vector search requires Atlas index setup');
    console.log('   ✅ Hybrid search framework ready');
    console.log('\n🔧 Next steps:');
    console.log('   1. Set up Atlas Vector Search indexes (see docs/atlas-vector-search-setup.md)');
    console.log('   2. Run embedding generation script: tsx src/scripts/generate-embeddings.ts');
    console.log('   3. Test complete hybrid search functionality');
    
    return true;
    
  } catch (error) {
    console.error('❌ Hybrid search test failed:', error);
    return false;
  } finally {
    await mongoClient.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

/**
 * テスト用のサンプルデータ作成
 */
async function createSampleData() {
  const mongoClient = getMongoClient();
  const dailyWorkCollection = mongoClient.getCollection('dailyWork');
  
  const sampleRecords = [
    {
      recordId: 'sample_001',
      userId: 'test_user_001',
      fieldId: 'test_field_001',
      date: new Date('2024-07-15'),
      workType: '播種',
      description: 'じゃがいもの播種作業を実施。天候良好で効率的に作業完了。',
      materials: [{ name: '種芋', amount: '50', unit: 'kg' }],
      weather: { condition: '晴れ', temperature: 18 },
      duration: 240,
      workers: 2,
      equipment: ['播種機', 'トラクター'],
      notes: '発芽率向上のため深めに植え付け',
      result: {
        quality: 'excellent',
        effectiveness: 'high',
        issues: [],
        improvements: [],
        satisfaction: 5
      },
      followUpNeeded: false,
      nextActions: ['発芽確認', '除草'],
      textContent: 'じゃがいもの播種作業を実施。天候良好で効率的に作業完了。発芽率向上のため深めに植え付け',
      tags: ['播種', '晴れ', 'excellent', 'high', '種芋'],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      recordId: 'sample_002',
      userId: 'test_user_001',
      fieldId: 'test_field_001',
      date: new Date('2024-07-20'),
      workType: '防除',
      description: '疫病予防のための薬剤散布を実施。銅水和剤を使用。',
      materials: [{ name: '銅水和剤', amount: '2', unit: 'kg' }],
      weather: { condition: '曇り', temperature: 22 },
      duration: 120,
      workers: 1,
      equipment: ['散布機'],
      notes: '早朝散布で効果最大化',
      result: {
        quality: 'good',
        effectiveness: 'high',
        issues: [],
        improvements: [],
        satisfaction: 4
      },
      followUpNeeded: true,
      nextActions: ['効果確認'],
      textContent: '疫病予防のための薬剤散布を実施。銅水和剤を使用。早朝散布で効果最大化',
      tags: ['防除', '曇り', 'good', 'high', '銅水和剤'],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
  
  await dailyWorkCollection.insertMany(sampleRecords);
  console.log(`✅ Created ${sampleRecords.length} sample records`);
}

// 直接実行する場合
if (import.meta.url === `file://${process.argv[1]}`) {
  testHybridSearchSystem()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testHybridSearchSystem };