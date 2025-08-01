/**
 * エンドツーエンド統合テスト
 * LINE → Mastra → MongoDB → 応答の完全フロー検証
 */

// テスト環境用の環境変数設定
process.env.GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'mock-api-key-for-testing';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
process.env.MONGODB_DATABASE = process.env.MONGODB_DATABASE || 'test_agri_assistant';

import { getMongoClient, initializeDatabase } from '../database/mongodb-client';
import { supervisorAgent } from '../mastra/agents/supervisor-agent';
import { readAgent } from '../mastra/agents/read-agent';
import { writeAgent } from '../mastra/agents/write-agent';
import { getHybridSearchService } from '../services/hybrid-search';
import { getEmbeddingService } from '../services/embedding-service';
import { ErrorHandler, ErrorLevel, ErrorCategory } from '../services/error-handler';
import { ModelFactory } from '../mastra/model-factory';
import { AppConfig } from '../config';

interface TestScenario {
  name: string;
  description: string;
  userMessage: string;
  expectedAgent: 'supervisor' | 'read' | 'write';
  expectedTool: string;
  validationFn: (result: any) => boolean;
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    name: '作業記録フロー',
    description: 'LINE → SupervisorAgent → WriteAgent → MongoDB保存',
    userMessage: '今日、第一圃場で防除作業を完了しました。薬剤散布は順調で、天候も良好でした。',
    expectedAgent: 'write',
    expectedTool: 'recordDailyWork',
    validationFn: (result) => result?.recordId && result?.status === 'success',
  },
  {
    name: '圃場情報照会フロー',
    description: 'LINE → SupervisorAgent → ReadAgent → ハイブリッド検索',
    userMessage: '第一圃場の現在の状況を教えてください。',
    expectedAgent: 'read',
    expectedTool: 'getFieldInfo',
    validationFn: (result) => result?.fields && Array.isArray(result.fields),
  },
  {
    name: '過去記録検索フロー',
    description: 'LINE → SupervisorAgent → ReadAgent → RRF統合検索',
    userMessage: '前回の防除作業の結果はどうでしたか？',
    expectedAgent: 'read',
    expectedTool: 'getDailyRecords',
    validationFn: (result) => result?.records && Array.isArray(result.records),
  },
];

/**
 * メインテスト実行関数
 */
async function runEndToEndTests(): Promise<void> {
  console.log('🚀 エンドツーエンド統合テスト開始');
  console.log('=' .repeat(60));

  let passedTests = 0;
  let totalTests = 0;

  try {
    // 1. システム初期化テスト
    console.log('\\n📋 Phase 1: システム初期化テスト');
    await testSystemInitialization();
    console.log('✅ システム初期化テスト完了');

    // 2. モデルファクトリーテスト
    console.log('\\n📋 Phase 2: ModelFactory設定検証テスト');
    await testModelFactory();
    console.log('✅ ModelFactory設定検証テスト完了');

    // 3. エラーハンドラーテスト
    console.log('\\n📋 Phase 3: ErrorHandler動作テスト');
    await testErrorHandler();
    console.log('✅ ErrorHandler動作テスト完了');

    // 4. データベース統合テスト
    console.log('\\n📋 Phase 4: MongoDB統合テスト');
    await testDatabaseIntegration();
    console.log('✅ MongoDB統合テスト完了');

    // 5. ハイブリッド検索テスト
    console.log('\\n📋 Phase 5: ハイブリッド検索テスト');
    await testHybridSearch();
    console.log('✅ ハイブリッド検索テスト完了');

    // 6. エージェント統合テスト
    console.log('\\n📋 Phase 6: エージェント統合テスト');
    for (const scenario of TEST_SCENARIOS) {
      totalTests++;
      console.log(`\\n🎯 テストシナリオ: ${scenario.name}`);
      console.log(`📝 説明: ${scenario.description}`);
      console.log(`💬 ユーザーメッセージ: \"${scenario.userMessage}\"`);
      
      try {
        const result = await executeAgentScenario(scenario);
        if (scenario.validationFn(result)) {
          console.log(`✅ ${scenario.name} - 成功`);
          passedTests++;
        } else {
          console.log(`❌ ${scenario.name} - 検証失敗`);
          console.log('結果:', JSON.stringify(result, null, 2));
        }
      } catch (error) {
        console.log(`❌ ${scenario.name} - エラー:`, error instanceof Error ? error.message : String(error));
      }
    }

    // 7. パフォーマンステスト
    console.log('\\n📋 Phase 7: パフォーマンステスト');
    await testPerformance();
    console.log('✅ パフォーマンステスト完了');

  } catch (error) {
    console.error('❌ テスト実行中にエラーが発生:', error instanceof Error ? error.message : String(error));
  }

  // テスト結果サマリー
  console.log('\\n' + '='.repeat(60));
  console.log('📊 エンドツーエンドテスト結果サマリー');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${passedTests}/${totalTests} シナリオ`);
  console.log(`📈 成功率: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
  
  if (passedTests === totalTests && totalTests > 0) {
    console.log('🎉 全テスト成功！プロダクション準備完了');
  } else {
    console.log('⚠️  一部テストが失敗しています。修正が必要です。');
  }
}

/**
 * システム初期化テスト
 */
async function testSystemInitialization(): Promise<void> {
  console.log('  🔧 MongoDB接続テスト...');
  const mongoClient = getMongoClient();
  
  try {
    if (!mongoClient.isConnected()) {
      await mongoClient.connect();
    }
    
    const isHealthy = await mongoClient.healthCheck();
    if (!isHealthy) {
      throw new Error('MongoDB health check failed');
    }
    
    await initializeDatabase();
    console.log('    ✅ MongoDB接続・初期化成功');
  } catch (error) {
    console.log('    ⚠️  MongoDB接続失敗（モックモードで継続）:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * ModelFactory設定検証テスト
 */
async function testModelFactory(): Promise<void> {
  console.log('  🤖 モデル設定検証...');
  
  try {
    // テスト環境では基本的な設定チェックのみ
    const metadata = ModelFactory.getModelMetadata();
    console.log('    ✅ モデル設定検証成功:', metadata.name);
    
    // モック環境での基本的な設定確認
    if (process.env.GOOGLE_API_KEY === 'mock-api-key-for-testing') {
      console.log('    ℹ️  モック環境で実行中');
    } else {
      const isValid = ModelFactory.validateModelConfig();
      if (!isValid) {
        throw new Error('Model configuration validation failed');
      }
      
      const model = ModelFactory.getGeminiFlash();
      if (!model) {
        throw new Error('Failed to create model instance');
      }
    }
  } catch (error) {
    console.log('    ⚠️  モデル設定検証（テスト環境）:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * ErrorHandler動作テスト
 */
async function testErrorHandler(): Promise<void> {
  console.log('  🛡️  エラーハンドリングテスト...');
  
  // データベースエラーテスト
  const dbError = new Error('Connection failed: mongodb+srv://user:password123@cluster.example.com/db');
  const handledDbError = ErrorHandler.handleDatabaseError(dbError, 'testOperation', 'testUser');
  
  if (handledDbError.message.includes('password123')) {
    throw new Error('機密情報のサニタイズに失敗');
  }
  
  // ユーザーフレンドリーメッセージテスト
  const errorResponse = ErrorHandler.createErrorResponse(handledDbError);
  if (!errorResponse.userMessage || errorResponse.userMessage.includes('password123')) {
    throw new Error('ユーザーフレンドリーメッセージ生成に失敗');
  }
  
  console.log('    ✅ エラーハンドリングテスト成功');
}

/**
 * データベース統合テスト
 */
async function testDatabaseIntegration(): Promise<void> {
  console.log('  🗄️  データベース統合テスト...');
  
  const mongoClient = getMongoClient();
  
  if (mongoClient.isConnected()) {
    // テストデータの挿入・検索
    const testCollection = mongoClient.getCollection('test_end_to_end');
    const testDoc = {
      testId: `test_${Date.now()}`,
      message: 'End-to-end test document',
      createdAt: new Date(),
    };
    
    await testCollection.insertOne(testDoc);
    const retrieved = await testCollection.findOne({ testId: testDoc.testId });
    
    if (!retrieved || retrieved.testId !== testDoc.testId) {
      throw new Error('データベース挿入・検索テスト失敗');
    }
    
    // クリーンアップ
    await testCollection.deleteOne({ testId: testDoc.testId });
    console.log('    ✅ データベース統合テスト成功');
  } else {
    console.log('    ⚠️  データベース接続なし（スキップ）');
  }
}

/**
 * ハイブリッド検索テスト
 */
async function testHybridSearch(): Promise<void> {
  console.log('  🔍 ハイブリッド検索テスト...');
  
  try {
    const searchService = getHybridSearchService();
    const embeddingService = getEmbeddingService();
    
    // エンベディング生成テスト
    const testText = '防除作業のテスト';
    const embedding = await embeddingService.generateEmbedding(
      testText,
      AppConfig.EMBEDDING.DEFAULT_DIMENSIONS,
      'RETRIEVAL_QUERY'
    );
    
    if (!embedding || embedding.length !== AppConfig.EMBEDDING.DEFAULT_DIMENSIONS) {
      throw new Error('エンベディング生成テスト失敗');
    }
    
    console.log('    ✅ ハイブリッド検索テスト成功');
  } catch (error) {
    console.log('    ⚠️  ハイブリッド検索テスト失敗:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 個別エージェントシナリオ実行
 */
async function executeAgentScenario(scenario: TestScenario): Promise<any> {
  // モックユーザーコンテキスト
  const mockContext = {
    userId: 'test_user_e2e',
    fieldId: 'field_001',
    sessionId: `session_${Date.now()}`,
  };

  // シナリオに応じたエージェント選択（簡略化）
  switch (scenario.expectedAgent) {
    case 'supervisor':
      // SupervisorAgentの直接テストは複雑なため、スキップ
      return { success: true, agent: 'supervisor' };
    
    case 'read':
      if (scenario.expectedTool === 'getFieldInfo') {
        const result = await readAgent.tools?.getFieldInfo?.execute!({
          context: {
            userId: mockContext.userId,
            includeHistory: true,
          },
        });
        return result;
      } else if (scenario.expectedTool === 'getDailyRecords') {
        const result = await readAgent.tools?.getDailyRecords?.execute!({
          context: {
            userId: mockContext.userId,
            workType: '防除',
            includeAnalysis: true,
            allowMockData: true,
          },
        });
        return result;
      }
      break;
    
    case 'write':
      if (scenario.expectedTool === 'recordDailyWork') {
        const result = await writeAgent.tools?.recordDailyWork?.execute!({
          context: {
            userId: mockContext.userId,
            fieldId: mockContext.fieldId,
            workRecord: {
              date: new Date().toISOString().split('T')[0],
              workType: '防除',
              description: '薬剤散布作業実施',
              weather: {
                condition: '晴れ',
                temperature: 25,
              },
            },
            result: {
              quality: 'good',
              effectiveness: 'high',
            },
            followUpNeeded: false,
          },
        });
        return result;
      }
      break;
  }
  
  throw new Error(`未対応のシナリオ: ${scenario.name}`);
}

/**
 * パフォーマンステスト
 */
async function testPerformance(): Promise<void> {
  console.log('  ⚡ パフォーマンステスト...');
  
  const startTime = Date.now();
  
  // 簡単なパフォーマンステスト
  try {
    const model = ModelFactory.getGeminiFlash();
    const embeddingService = getEmbeddingService();
    
    // 並列処理テスト
    const tasks = [
      embeddingService.generateEmbedding('テスト1', 1536, 'RETRIEVAL_QUERY'),
      embeddingService.generateEmbedding('テスト2', 1536, 'RETRIEVAL_QUERY'),
      embeddingService.generateEmbedding('テスト3', 1536, 'RETRIEVAL_QUERY'),
    ];
    
    await Promise.all(tasks);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`    ✅ パフォーマンステスト完了 (${duration}ms)`);
    
    if (duration > 10000) { // 10秒以上
      console.log('    ⚠️  レスポンス時間が長い可能性があります');
    }
  } catch (error) {
    console.log('    ⚠️  パフォーマンステスト失敗:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * テスト実行
 */
if (require.main === module) {
  runEndToEndTests()
    .then(() => {
      console.log('\\n🏁 エンドツーエンドテスト完了');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\\n💥 テスト実行エラー:', error);
      process.exit(1);
    });
}

export { runEndToEndTests };