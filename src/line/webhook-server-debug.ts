import { LineWebhookServer } from './webhook-server';
import { MessageEvent, TextMessage } from '@line/bot-sdk';
import express from 'express';

/**
 * デバッグ対応版 LINE Webhook サーバー
 * 詳細なトレース・ログ出力でMastraエージェントの動作を可視化
 */
export class DebugLineWebhookServer extends LineWebhookServer {
  
  /**
   * テキストメッセージの処理（デバッグ拡張版）
   */
  protected async handleTextMessage(event: MessageEvent): Promise<void> {
    const message = event.message as TextMessage;
    const userId = event.source.userId;
    const messageText = message.text;
    
    if (!userId) {
      console.log('⚠️  No userId in message event');
      return;
    }
    
    const sessionId = `session_${Date.now()}_${userId.slice(-6)}`;
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 [DEBUG] Message Processing Started');
    console.log('='.repeat(60));
    console.log(`📨 Input: "${this.sanitizeMessageForLog(messageText)}"`);
    console.log(`👤 User: ${userId.slice(0, 10)}...${userId.slice(-6)}`);
    console.log(`🔍 Session: ${sessionId}`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📏 Message Length: ${messageText.length} chars`);
    
    const overallStartTime = Date.now();
    
    try {
      // Step 1: 入力検証
      console.log('\n🔍 Step 1: Input Validation');
      console.log('📝 Validating message text...');
      
      try {
        this.messageTextSchema.parse(messageText);
        console.log('✅ Input validation passed');
      } catch (validationError) {
        console.log('❌ Input validation failed:', validationError);
        return;
      }
      
      // Step 2: ユーザー情報取得
      console.log('\n👤 Step 2: User Info Retrieval');
      console.log('🔍 Getting or creating user...');
      
      const userStartTime = Date.now();
      const userInfo = await this.getOrCreateUser(userId);
      const userTime = Date.now() - userStartTime;
      
      console.log(`✅ User Info Retrieved (${userTime}ms):`, {
        userId: userInfo.userId,
        name: userInfo.name,
        farmId: userInfo.farmId,
        isNewUser: userTime > 200 // 新規ユーザーの場合は時間がかかる
      });
      
      // Step 3: MongoDB接続確認
      console.log('\n🗄️ Step 3: Database Connection Check');
      const mongoStartTime = Date.now();
      
      if (!this.mongoClient.isConnected()) {
        console.log('🔌 Connecting to MongoDB...');
        await this.mongoClient.connect();
        console.log('✅ MongoDB connected');
      } else {
        console.log('✅ MongoDB already connected');
      }
      
      const mongoTime = Date.now() - mongoStartTime;
      console.log(`📊 MongoDB check completed (${mongoTime}ms)`);
      
      // Step 4: エージェント処理
      console.log('\n🤖 Step 4: Mastra Agent Processing');
      console.log('📤 Preparing agent input...');
      
      const agentInput = `ユーザーからのメッセージ: "${messageText}"
        
ユーザー情報:
- ID: ${userId}
- 名前: ${userInfo.name || 'Unknown'}
- 農場ID: ${userInfo.farmId || 'None'}

このメッセージに対して適切に応答してください。農作業の記録、質問、圃場情報の確認など、ユーザーの意図を理解して対応してください。`;

      console.log('📝 Agent Input Preview:', `${agentInput.substring(0, 100)}...`);
      console.log('📤 Sending to SupervisorAgent...');
      
      const agentStartTime = Date.now();
      
      try {
        const { supervisorAgent } = await import('../mastra/agents/supervisor-agent');
        
        // Mastraエージェント実行のトレース
        console.log('🔍 [Mastra] SupervisorAgent.generate() called');
        console.log('🔍 [Mastra] Model:', supervisorAgent.model ? 'Configured' : 'Not configured');
        console.log('🔍 [Mastra] Instructions length:', supervisorAgent.instructions?.length || 0);
        
        const agentResponse = await supervisorAgent.generate(agentInput);
        const agentTime = Date.now() - agentStartTime;
        
        console.log(`✅ Agent Response Received (${agentTime}ms)`);
        console.log('🔍 [Mastra] Response type:', typeof agentResponse);
        console.log('🔍 [Mastra] Response preview:', 
          typeof agentResponse === 'string' 
            ? `"${agentResponse.substring(0, 100)}..."` 
            : JSON.stringify(agentResponse).substring(0, 100) + '...'
        );
        
        // エージェント応答の詳細分析
        if (agentResponse && typeof agentResponse === 'object') {
          console.log('🔍 [Mastra] Response structure:');
          Object.keys(agentResponse).forEach(key => {
            console.log(`  - ${key}: ${typeof agentResponse[key]}`);
          });
        }
        
        // Step 5: 応答フォーマット
        console.log('\n📤 Step 5: Response Formatting');
        console.log('🔧 Formatting agent response for LINE...');
        
        const formatStartTime = Date.now();
        const replyMessage = this.formatAgentResponse(agentResponse);
        const formatTime = Date.now() - formatStartTime;
        
        console.log(`✅ Response Formatted (${formatTime}ms)`);
        console.log('📝 Final Message Length:', replyMessage.length);
        console.log('📝 Final Message Preview:', `"${replyMessage.substring(0, 150)}..."`);
        
        // Step 6: LINE応答送信
        console.log('\n📱 Step 6: LINE Response Transmission');
        
        if ('replyToken' in event && event.replyToken) {
          console.log('📤 Sending reply via LINE Bot SDK...');
          console.log('🔍 Reply Token:', event.replyToken.substring(0, 10) + '...');
          
          const lineStartTime = Date.now();
          
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: replyMessage
          });
          
          const lineTime = Date.now() - lineStartTime;
          console.log(`✅ LINE Reply Sent Successfully (${lineTime}ms)`);
        } else {
          console.log('⚠️  No reply token available');
        }
        
        // Step 7: パフォーマンスサマリー
        const totalTime = Date.now() - overallStartTime;
        
        console.log('\n📊 Performance Summary');
        console.log('─'.repeat(40));
        console.log(`👤 User Retrieval: ${userTime}ms`);
        console.log(`🗄️ Database Check: ${mongoTime}ms`);
        console.log(`🤖 Agent Processing: ${agentTime}ms`);
        console.log(`📤 Response Format: ${formatTime}ms`);
        console.log(`📱 LINE Transmission: ${Date.now() - overallStartTime - totalTime}ms`);
        console.log('─'.repeat(40));
        console.log(`🏁 Total Processing Time: ${totalTime}ms`);
        
        // パフォーマンス警告
        if (totalTime > 5000) {
          console.log('⚠️  WARNING: Response time over 5 seconds');
        } else if (totalTime > 2000) {
          console.log('⚡ NOTICE: Response time over 2 seconds');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('🎉 [DEBUG] Message Processing Completed Successfully');
        console.log('='.repeat(60));
        
      } catch (agentError) {
        const agentTime = Date.now() - agentStartTime;
        console.log(`❌ Agent Processing Failed (${agentTime}ms)`);
        console.log('🔍 [Mastra] Agent Error Details:', agentError);
        
        throw agentError;
      }
      
    } catch (error) {
      const totalTime = Date.now() - overallStartTime;
      
      console.log('\n' + '='.repeat(60));
      console.log('❌ [DEBUG] Message Processing Failed');
      console.log('='.repeat(60));
      console.log('🚨 Error Details:', error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      } : String(error));
      console.log(`⏱️ Failed after: ${totalTime}ms`);
      console.log('='.repeat(60));
      
      // エラー時の緊急応答
      try {
        if ('replyToken' in event && event.replyToken) {
          await this.client.replyMessage(event.replyToken, {
            type: 'text',
            text: '申し訳ございません。現在処理に問題が発生しています。しばらく経ってから再度お試しください。'
          });
          console.log('✅ Emergency response sent');
        }
      } catch (emergencyError) {
        console.log('❌ Emergency response failed:', emergencyError);
      }
    }
  }

  /**
   * フォローイベントの処理（デバッグ拡張版）
   */
  protected async handleFollowEvent(event: any): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('👋 [DEBUG] Follow Event Processing');
    console.log('='.repeat(60));
    
    const userId = event.source.userId;
    console.log(`👤 New Follower: ${userId?.substring(0, 10)}...${userId?.slice(-6)}`);
    
    try {
      await super.handleFollowEvent(event);
      console.log('✅ Follow event processed successfully');
    } catch (error) {
      console.log('❌ Follow event processing failed:', error);
    }
    
    console.log('='.repeat(60));
  }

  /**
   * アンフォローイベントの処理（デバッグ拡張版）
   */
  protected async handleUnfollowEvent(event: any): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('👋 [DEBUG] Unfollow Event Processing');
    console.log('='.repeat(60));
    
    const userId = event.source.userId;
    console.log(`👤 User Unfollowed: ${userId?.substring(0, 10)}...${userId?.slice(-6)}`);
    
    try {
      await super.handleUnfollowEvent(event);
      console.log('✅ Unfollow event processed successfully');
    } catch (error) {
      console.log('❌ Unfollow event processing failed:', error);
    }
    
    console.log('='.repeat(60));
  }

  /**
   * エラーハンドリング拡張
   */
  protected sanitizeError(error: unknown): string {
    const sanitized = super.sanitizeError(error);
    
    // デバッグ環境では詳細情報も出力
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [DEBUG] Original Error:', error);
    }
    
    return sanitized;
  }

  /**
   * テスト用のWebhookエンドポイントを追加（署名検証なし）
   */
  protected setupRoutes(): void {
    // 親クラスのルート設定を呼び出し
    super.setupRoutes();
    
    // テスト用エンドポイント（署名検証なし）
    (this as any).app.post('/webhook-test', express.json(), (req, res) => {
      console.log('\n🧪 [TEST] Webhook test endpoint called');
      console.log('📨 Request body:', JSON.stringify(req.body, null, 2));
      
      if (!this.validateWebhookPayload(req.body)) {
        console.warn('⚠️  Invalid webhook payload in test endpoint');
        return res.status(400).json({ error: 'Invalid payload' });
      }
      
      this.handleWebhook(req.body.events)
        .then(() => {
          console.log('✅ Test webhook handled successfully');
          res.status(200).json({ success: true, message: 'Test webhook processed' });
        })
        .catch((error) => {
          console.error('❌ Test webhook handling failed:', this.sanitizeError(error));
          res.status(500).json({ error: 'Internal server error' });
        });
    });
    
    console.log('🧪 Added test webhook endpoint: POST /webhook-test');
  }

  /**
   * サーバー開始時のデバッグ情報
   */
  public start(port: number = 3000): void {
    console.log('\n' + '🚀'.repeat(20));
    console.log('🔧 [DEBUG] LINE Webhook Server (Debug Mode)');
    console.log('🚀'.repeat(20));
    console.log(`📍 Port: ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔍 Debug Mode: ENABLED`);
    console.log(`📊 Detailed Logging: ENABLED`);
    console.log(`⚡ Mastra Tracing: ENABLED`);
    console.log('🚀'.repeat(20));
    
    super.start(port);
  }
}

// デバッグ版サーバーの起動
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DebugLineWebhookServer();
  const port = parseInt(process.env.PORT || '3000');
  
  server.start(port);
  
  // 優雅なシャットダウンの設定
  process.on('SIGTERM', async () => {
    console.log('\n🔄 [DEBUG] Graceful shutdown initiated...');
    await server.shutdown();
    console.log('👋 [DEBUG] Server shutdown complete');
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('\n🔄 [DEBUG] Graceful shutdown initiated (SIGINT)...');
    await server.shutdown();
    console.log('👋 [DEBUG] Server shutdown complete');
    process.exit(0);
  });
}

export default DebugLineWebhookServer;