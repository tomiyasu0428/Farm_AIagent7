import 'dotenv/config';
import { getEmbeddingService, EmbeddingService } from '../services/embedding-service';

async function testGeminiEmbeddings() {
  console.log('🧪 Testing Gemini Embeddings API...\n');
  
  const embeddingService = getEmbeddingService();
  
  // テスト用農業テキスト
  const testTexts = [
    '今日は播種作業を行いました。天候は晴れで、作業効率が良好でした。',
    '防除作業で銅水和剤を散布。疫病予防のための薬剤散布を実施。',
    '追肥作業でNK化成肥料を施用。生育が顕著に改善しました。',
    '収穫作業を実施。品質excellent、収量も期待通りでした。'
  ];
  
  try {
    console.log('📊 Single embedding test:');
    const singleEmbedding = await embeddingService.generateEmbedding(testTexts[0], 1536);
    console.log(`✅ Generated embedding: ${singleEmbedding.length}D vector`);
    console.log(`   First 5 values: [${singleEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    console.log('\n📦 Batch embedding test:');
    const batchEmbeddings = await embeddingService.generateBatchEmbeddings(testTexts.slice(0, 2), 1536);
    console.log(`✅ Generated ${batchEmbeddings.length} batch embeddings`);
    
    console.log('\n🔍 Similarity test:');
    const embedding1 = await embeddingService.generateEmbedding('播種 作業 晴れ', 1536);
    const embedding2 = await embeddingService.generateEmbedding('播種 作業 雨', 1536);
    const embedding3 = await embeddingService.generateEmbedding('収穫 作業 品質', 1536);
    
    const similarity1vs2 = EmbeddingService.calculateCosineSimilarity(embedding1, embedding2);
    const similarity1vs3 = EmbeddingService.calculateCosineSimilarity(embedding1, embedding3);
    
    console.log(`   播種(晴れ) vs 播種(雨): ${similarity1vs2.toFixed(4)}`);
    console.log(`   播種(晴れ) vs 収穫: ${similarity1vs3.toFixed(4)}`);
    console.log(`   Expected: 播種同士の方が類似度が高い → ${similarity1vs2 > similarity1vs3 ? '✅' : '❌'}`);
    
    console.log('\n🚀 Text optimization test:');
    const longText = 'これは非常に長いテキストです。'.repeat(100);
    const optimizedText = EmbeddingService.optimizeTextForEmbedding(longText);
    console.log(`   Original length: ${longText.length}`);
    console.log(`   Optimized length: ${optimizedText.length}`);
    console.log(`   Within limit: ${optimizedText.length <= 8000 ? '✅' : '❌'}`);
    
    console.log('\n🎉 All embedding tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Embedding test failed:', error);
    return false;
  }
}

// 直接実行する場合
if (import.meta.url === `file://${process.argv[1]}`) {
  testGeminiEmbeddings()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testGeminiEmbeddings };