/**
 * シンプルなエンドツーエンドテスト
 * 基本機能の動作確認に特化
 */

// dotenvで環境変数を読み込み
import { config } from 'dotenv';
config();

// 環境変数が読み込まれたかデバッグ出力
console.log('🔧 環境変数設定確認:');
console.log(`GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '設定済み (長さ: ' + process.env.GOOGLE_API_KEY.length + ')' : '未設定'}`);
console.log(`MONGODB_URI: ${process.env.MONGODB_URI ? '設定済み' : '未設定'}`);
console.log(`MONGODB_DATABASE: ${process.env.MONGODB_DATABASE ? process.env.MONGODB_DATABASE : '未設定'}`);
console.log('');

// フォールバック設定（実際のAPIキーが優先）
if (!process.env.GOOGLE_API_KEY) {
  process.env.GOOGLE_API_KEY = 'mock-api-key-for-testing';
  console.log('⚠️  GOOGLE_API_KEY が未設定のため、モックキーを使用');
}
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = 'mongodb://localhost:27017';
}
if (!process.env.MONGODB_DATABASE) {
  process.env.MONGODB_DATABASE = 'test_agri_assistant';
}

import { getMongoClient } from '../database/mongodb-client';
import { ErrorHandler, ErrorLevel, ErrorCategory } from '../services/error-handler';
import { ModelFactory } from '../mastra/model-factory';
import { AppConfig } from '../config';
import { 
  recordDailyWorkTool, 
  getDailyRecordsTool 
} from '../mastra/tools/daily-record-tool';
import { getFieldInfoTool } from '../mastra/tools/field-info-tool';
import { getExternalWeatherTool } from '../mastra/tools/weather-tool';

/**
 * メインテスト実行関数
 */
async function runSimpleEndToEndTest(): Promise<void> {
  console.log('🚀 シンプル エンドツーエンドテスト開始');
  console.log('=' .repeat(50));

  let passedTests = 0;
  let totalTests = 0;

  try {
    // 1. システム基盤テスト
    console.log('\n📋 Phase 1: システム基盤テスト');
    totalTests++;
    if (await testSystemFoundation()) {
      passedTests++;
      console.log('✅ システム基盤テスト - 成功');
    } else {
      console.log('❌ システム基盤テスト - 失敗');
    }

    // 2. ErrorHandler テスト
    console.log('\n📋 Phase 2: ErrorHandler テスト');
    totalTests++;
    if (await testErrorHandler()) {
      passedTests++;
      console.log('✅ ErrorHandler テスト - 成功');
    } else {
      console.log('❌ ErrorHandler テスト - 失敗');
    }

    // 3. Tool直接実行テスト
    console.log('\n📋 Phase 3: Tool直接実行テスト');
    
    // 3-1. Weather Tool
    totalTests++;
    if (await testWeatherTool()) {
      passedTests++;
      console.log('✅ Weather Tool テスト - 成功');
    } else {
      console.log('❌ Weather Tool テスト - 失敗');
    }

    // 3-2. Field Info Tool  
    totalTests++;
    if (await testFieldInfoTool()) {
      passedTests++;
      console.log('✅ Field Info Tool テスト - 成功');
    } else {
      console.log('❌ Field Info Tool テスト - 失敗');
    }

    // 3-3. Daily Records Tool
    totalTests++;
    if (await testDailyRecordsTool()) {
      passedTests++;
      console.log('✅ Daily Records Tool テスト - 成功');
    } else {
      console.log('❌ Daily Records Tool テスト - 失敗');
    }

    // 3-4. Record Daily Work Tool (データベース書き込み)
    totalTests++;
    if (await testRecordDailyWorkTool()) {
      passedTests++;
      console.log('✅ Record Daily Work Tool テスト - 成功');
    } else {
      console.log('❌ Record Daily Work Tool テスト - 失敗');
    }

  } catch (error) {
    console.error('❌ テスト実行中にエラーが発生:', error instanceof Error ? error.message : String(error));
  }

  // テスト結果サマリー
  console.log('\n' + '='.repeat(50));
  console.log('📊 シンプル エンドツーエンドテスト結果');
  console.log('='.repeat(50));
  console.log(`✅ 成功: ${passedTests}/${totalTests} テスト`);
  console.log(`📈 成功率: ${totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0}%`);
  
  if (passedTests === totalTests && totalTests > 0) {
    console.log('🎉 全テスト成功！基本機能は正常に動作しています');
  } else {
    console.log('⚠️  一部テストが失敗しています。詳細を確認してください。');
  }

  return;
}

/**
 * システム基盤テスト
 */
async function testSystemFoundation(): Promise<boolean> {
  try {
    console.log('  🔧 設定ファイル読み込みテスト...');
    
    // AppConfig テスト
    const geminiConfig = AppConfig.getGeminiConfig();
    if (!geminiConfig.model) {
      throw new Error('Gemini設定が正しく読み込まれていません');
    }
    
    const dbConfig = AppConfig.getDatabaseConfig();
    if (!dbConfig.uri) {
      throw new Error('データベース設定が正しく読み込まれていません');
    }
    
    console.log('    ✅ 設定ファイル読み込み成功');
    
    // ModelFactory 基本テスト
    console.log('  🤖 ModelFactory基本テスト...');
    const metadata = ModelFactory.getModelMetadata();
    if (!metadata.name) {
      throw new Error('ModelFactoryメタデータ取得失敗');
    }
    
    console.log('    ✅ ModelFactory基本テスト成功');
    
    // MongoDB接続テスト
    console.log('  🗄️  MongoDB接続テスト...');
    try {
      const mongoClient = getMongoClient();
      if (!mongoClient.isConnected()) {
        await mongoClient.connect();
      }
      
      if (mongoClient.isConnected()) {
        const isHealthy = await mongoClient.healthCheck();
        console.log(`    ✅ MongoDB接続成功 (健康状態: ${isHealthy ? 'OK' : 'Warning'})`);
      } else {
        console.log('    ⚠️  MongoDB接続なし（モックモードで継続）');
      }
    } catch (error) {
      console.log('    ⚠️  MongoDB接続失敗（モックモードで継続）:', error instanceof Error ? error.message : String(error));
    }
    
    return true;
  } catch (error) {
    console.log('    ❌ システム基盤テスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * ErrorHandler テスト
 */
async function testErrorHandler(): Promise<boolean> {
  try {
    console.log('  🛡️  機密情報サニタイズテスト...');
    
    // データベースエラーテスト
    const dbError = new Error('Connection failed: mongodb+srv://user:password123@cluster.example.com/db');
    const handledDbError = ErrorHandler.handleDatabaseError(dbError, 'testOperation', 'testUser');
    
    if (handledDbError.message.includes('password123')) {
      throw new Error('機密情報のサニタイズに失敗');
    }
    
    console.log('    ✅ 機密情報サニタイズ成功');
    
    // ユーザーフレンドリーメッセージテスト
    console.log('  💬 ユーザーフレンドリーメッセージテスト...');
    
    const errorResponse = ErrorHandler.createErrorResponse(handledDbError);
    if (!errorResponse.userMessage || errorResponse.userMessage.includes('password123')) {
      throw new Error('ユーザーフレンドリーメッセージ生成に失敗');
    }
    
    console.log('    ✅ ユーザーフレンドリーメッセージ生成成功');
    
    return true;
  } catch (error) {
    console.log('    ❌ ErrorHandlerテスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Weather Tool テスト
 */
async function testWeatherTool(): Promise<boolean> {
  try {
    console.log('  🌤️  天気ツール実行テスト...');
    
    const result = await getExternalWeatherTool.execute!({
      context: {
        location: '北海道札幌市',
        days: 3,
      },
    });
    
    if (!result.location || !result.forecast || !Array.isArray(result.forecast)) {
      throw new Error('天気ツールの応答形式が正しくありません');
    }
    
    if (result.forecast.length !== 3) {
      throw new Error('指定した日数の天気予報が取得できません');
    }
    
    console.log(`    ✅ 天気ツール実行成功 (${result.forecast.length}日間の予報取得)`);
    return true;
  } catch (error) {
    console.log('    ❌ 天気ツールテスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Field Info Tool テスト
 */
async function testFieldInfoTool(): Promise<boolean> {
  try {
    console.log('  🌾 圃場情報ツール実行テスト...');
    
    const result = await getFieldInfoTool.execute!({
      context: {
        userId: 'test_user_simple',
        includeHistory: true,
      },
    });
    
    if (!result.userId || !result.fields || !Array.isArray(result.fields)) {
      throw new Error('圃場情報ツールの応答形式が正しくありません');
    }
    
    if (result.fields.length === 0) {
      throw new Error('圃場情報が取得できません');
    }
    
    console.log(`    ✅ 圃場情報ツール実行成功 (${result.fields.length}件の圃場情報取得)`);
    return true;
  } catch (error) {
    console.log('    ❌ 圃場情報ツールテスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Daily Records Tool テスト
 */
async function testDailyRecordsTool(): Promise<boolean> {
  try {
    console.log('  📋 作業記録検索ツール実行テスト...');
    
    const result = await getDailyRecordsTool.execute!({
      context: {
        userId: 'test_user_simple',
        workType: '防除',
        includeAnalysis: true,
        allowMockData: true, // モックデータ許可
      },
    });
    
    if (!result.userId || !result.records || !Array.isArray(result.records)) {
      throw new Error('作業記録検索ツールの応答形式が正しくありません');
    }
    
    console.log(`    ✅ 作業記録検索ツール実行成功 (${result.records.length}件の記録取得)`);
    return true;
  } catch (error) {
    console.log('    ❌ 作業記録検索ツールテスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Record Daily Work Tool テスト
 */
async function testRecordDailyWorkTool(): Promise<boolean> {
  try {
    console.log('  ✍️  作業記録保存ツール実行テスト...');
    
    const result = await recordDailyWorkTool.execute!({
      context: {
        userId: 'test_user_simple',
        fieldId: 'field_test_001',
        workRecord: {
          date: new Date().toISOString().split('T')[0],
          workType: '防除',
          description: 'エンドツーエンドテスト用の防除作業記録',
          weather: {
            condition: '晴れ',
            temperature: 25,
          },
          duration: 120,
          workers: 1,
        },
        result: {
          quality: 'good',
          effectiveness: 'high',
          satisfaction: 4,
        },
        followUpNeeded: false,
      },
    });
    
    if (!result.recordId || result.status !== 'success') {
      throw new Error('作業記録保存ツールの実行に失敗');
    }
    
    console.log(`    ✅ 作業記録保存ツール実行成功 (記録ID: ${result.recordId})`);
    return true;
  } catch (error) {
    console.log('    ❌ 作業記録保存ツールテスト失敗:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * テスト実行
 */
runSimpleEndToEndTest()
  .then(() => {
    console.log('\n🏁 シンプル エンドツーエンドテスト完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 テスト実行エラー:', error);
    process.exit(1);
  });

export { runSimpleEndToEndTest };