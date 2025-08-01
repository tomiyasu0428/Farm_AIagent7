/**
 * ローカル環境でのWebhook動作テスト
 * 実際のLINE SDKを使わずにWebhookの動作を確認
 */

import fetch from 'node-fetch';

/**
 * ローカルWebhookテスト用のモックイベント
 */
const createMockLineEvent = (messageText: string, userId: string = 'test_user_local_001') => {
  return {
    events: [
      {
        type: 'message',
        source: {
          type: 'user',
          userId: userId
        },
        message: {
          type: 'text',
          text: messageText
        },
        timestamp: Date.now(),
        replyToken: `reply_token_${Date.now()}`
      }
    ]
  };
};

/**
 * ローカルWebhookにテストメッセージを送信
 */
async function sendTestMessage(message: string, port: number = 3000): Promise<void> {
  const webhookUrl = `http://localhost:${port}/webhook`;
  const mockEvent = createMockLineEvent(message);
  
  console.log(`📤 Sending test message to ${webhookUrl}`);
  console.log(`💬 Message: "${message}"`);
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Line-Signature': 'mock_signature_for_local_test', // ローカルテスト用のモックシグネチャ
      },
      body: JSON.stringify(mockEvent)
    });
    
    console.log(`📨 Response Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      console.log('✅ Test message sent successfully');
    } else {
      const errorText = await response.text();
      console.log('❌ Test message failed:', errorText);
    }
    
  } catch (error) {
    console.log('❌ Network error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * 複数のテストメッセージを順次送信
 */
async function runTestSuite(): Promise<void> {
  console.log('🧪 Starting Local Webhook Test Suite');
  console.log('=' .repeat(50));
  
  const testMessages = [
    'こんにちは',
    '今日じゃがいもの作業完了しました',
    '第一圃場の状況教えて',
    '明日の天気はどうですか？',
    '前回の防除作業はいつでしたか？',
    'トマトの調子はどうですか？'
  ];
  
  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    
    console.log(`\n📋 Test ${i + 1}/${testMessages.length}`);
    console.log('-'.repeat(30));
    
    await sendTestMessage(message);
    
    // 次のテストまで少し待機（ログが混在しないように）
    if (i < testMessages.length - 1) {
      console.log('⏳ Waiting 2 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🏁 Local Webhook Test Suite Completed');
}

/**
 * ヘルスチェックテスト
 */
async function testHealthCheck(port: number = 3000): Promise<void> {
  const healthUrl = `http://localhost:${port}/health`;
  
  console.log(`🔍 Testing health check: ${healthUrl}`);
  
  try {
    const response = await fetch(healthUrl);
    const data = await response.json();
    
    console.log(`📨 Status: ${response.status}`);
    console.log(`📊 Response:`, data);
    
    if (response.ok && data.status === 'ok') {
      console.log('✅ Health check passed');
    } else {
      console.log('❌ Health check failed');
    }
    
  } catch (error) {
    console.log('❌ Health check error:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * パフォーマンステスト
 */
async function performanceTest(port: number = 3000): Promise<void> {
  console.log('⚡ Starting Performance Test');
  console.log('-'.repeat(30));
  
  const testMessage = 'パフォーマンステスト用のメッセージです';
  const iterations = 5;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`🔄 Iteration ${i + 1}/${iterations}`);
    
    const startTime = Date.now();
    await sendTestMessage(testMessage, port);
    const endTime = Date.now();
    
    const duration = endTime - startTime;
    times.push(duration);
    
    console.log(`⏱️ Duration: ${duration}ms`);
    
    // 短い間隔を空ける
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // 統計情報の計算
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log('\n📊 Performance Statistics:');
  console.log(`Average: ${avgTime.toFixed(2)}ms`);
  console.log(`Minimum: ${minTime}ms`);
  console.log(`Maximum: ${maxTime}ms`);
  
  if (avgTime > 2000) {
    console.log('⚠️ WARNING: Average response time over 2 seconds');
  } else if (avgTime > 1000) {
    console.log('⚡ NOTICE: Average response time over 1 second');
  } else {
    console.log('✅ Good performance');
  }
}

/**
 * メイン実行関数
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const port = parseInt(process.env.PORT || '3000');
  
  console.log('🧪 Local Webhook Tester');
  console.log(`🌍 Target: http://localhost:${port}`);
  console.log(`🕐 Started: ${new Date().toISOString()}`);
  console.log('');
  
  // コマンドライン引数での機能選択
  if (args.includes('--health')) {
    await testHealthCheck(port);
  } else if (args.includes('--performance')) {
    await performanceTest(port);
  } else if (args.includes('--message') && args[1]) {
    await sendTestMessage(args[1], port);
  } else if (args.includes('--suite')) {
    await runTestSuite();
  } else {
    // デフォルト: ヘルスチェック + 簡単なメッセージテスト
    console.log('🔍 Running default tests...');
    await testHealthCheck(port);
    console.log('');
    await sendTestMessage('こんにちは、テストです', port);
    
    console.log('\n💡 Available options:');
    console.log('  --health      : Health check only');
    console.log('  --performance : Performance test');
    console.log('  --suite       : Full test suite');
    console.log('  --message "text" : Send custom message');
  }
  
  console.log('\n🏁 Testing completed');
}

// スクリプト実行
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test execution failed:', error);
    process.exit(1);
  });
}

export { sendTestMessage, testHealthCheck, performanceTest, runTestSuite };