import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Client, middleware, WebhookEvent, MessageEvent, TextMessage } from '@line/bot-sdk';
import { mastra } from '../mastra/index.js';
import { getMongoClient } from '../database/mongodb-client.js';

/**
 * LINE Webhook サーバー
 * LINEからのメッセージを受信し、Mastraエージェントシステムに転送
 */
export class LineWebhookServer {
  private app: express.Application;
  private client: Client;
  private mongoClient = getMongoClient();

  constructor() {
    // 環境変数の検証
    this.validateEnvironmentVariables();
    
    // Express アプリケーション初期化
    this.app = express();
    
    // LINE Bot Client 初期化
    this.client = new Client({
      channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
      channelSecret: process.env.LINE_CHANNEL_SECRET!,
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 環境変数の検証
   */
  private validateEnvironmentVariables(): void {
    const requiredEnvVars = [
      'LINE_CHANNEL_ACCESS_TOKEN',
      'LINE_CHANNEL_SECRET',
      'MONGODB_URI',
      'GOOGLE_API_KEY'  // Gemini 2.5 Flash: 対話エンジン + ベクトル検索
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }
  }

  /**
   * ミドルウェアの設定
   */
  private setupMiddleware(): void {
    // セキュリティヘッダー
    this.app.use(helmet());
    
    // CORS設定
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://access.line.me'] 
        : true,
      credentials: true
    }));

    // JSON パーサー（LINE Webhook以外の場合）
    this.app.use((req, res, next) => {
      if (req.path !== '/webhook') {
        express.json()(req, res, next);
      } else {
        next();
      }
    });

    // リクエストログ
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * ルートの設定
   */
  private setupRoutes(): void {
    // ヘルスチェック
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'Agri-AI Webhook Server'
      });
    });

    // LINE Webhook エンドポイント
    this.app.post('/webhook', 
      middleware({
        channelSecret: process.env.LINE_CHANNEL_SECRET!,
      }),
      (req, res) => {
        this.handleWebhook(req.body.events)
          .then(() => {
            res.status(200).end();
          })
          .catch((error) => {
            console.error('❌ Webhook handling failed:', error);
            res.status(500).json({ error: 'Internal server error' });
          });
      }
    );

    // 404ハンドラー
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // エラーハンドラー
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Server error:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Webhookイベントの処理
   */
  private async handleWebhook(events: WebhookEvent[]): Promise<void> {
    console.log(`📨 Received ${events.length} webhook events`);

    // MongoDB接続確認
    try {
      if (!this.mongoClient.isConnected()) {
        await this.mongoClient.connect();
        console.log('✅ MongoDB connected for webhook processing');
      }
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw new Error('Database connection failed');
    }

    // 各イベントを並行処理
    const promises = events.map(event => this.handleSingleEvent(event));
    await Promise.allSettled(promises);
  }

  /**
   * 単一イベントの処理
   */
  private async handleSingleEvent(event: WebhookEvent): Promise<void> {
    try {
      console.log(`🔄 Processing event: ${event.type}`);

      if (event.type === 'message' && event.message.type === 'text') {
        await this.handleTextMessage(event);
      } else if (event.type === 'follow') {
        await this.handleFollowEvent(event);
      } else if (event.type === 'unfollow') {
        await this.handleUnfollowEvent(event);
      } else {
        console.log(`⚠️  Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`❌ Failed to process event ${event.type}:`, error);
      // 個別イベントの失敗は全体を止めない
    }
  }

  /**
   * テキストメッセージの処理
   */
  private async handleTextMessage(event: MessageEvent): Promise<void> {
    const message = event.message as TextMessage;
    const userId = event.source.userId;
    const messageText = message.text;

    if (!userId) {
      console.log('⚠️  No userId in message event');
      return;
    }

    console.log(`💬 Message from ${userId}: "${messageText}"`);

    try {
      // ユーザー情報を取得/作成
      const userInfo = await this.getOrCreateUser(userId);
      
      // Mastra SupervisorAgent に送信
      const agentResponse = await mastra.run({
        agent: 'supervisorAgent',
        input: {
          message: messageText,
          userId: userId,
          lineProfile: userInfo,
          timestamp: new Date().toISOString(),
        }
      });

      console.log('🤖 Agent response:', agentResponse);

      // LINE に応答を送信
      const replyMessage = this.formatAgentResponse(agentResponse);
      
      if (event.replyToken) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: replyMessage
        });
        console.log('✅ Reply sent successfully');
      }

    } catch (error) {
      console.error('❌ Message processing failed:', error);
      
      // エラー時はシンプルなメッセージを返す
      if (event.replyToken) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: '申し訳ございません。現在処理に問題が発生しています。しばらく経ってから再度お試しください。'
        });
      }
    }
  }

  /**
   * フォローイベントの処理
   */
  private async handleFollowEvent(event: any): Promise<void> {
    const userId = event.source.userId;
    
    if (!userId) return;

    console.log(`👋 New follower: ${userId}`);

    try {
      // ユーザー情報を作成
      await this.getOrCreateUser(userId);
      
      // 歓迎メッセージ
      const welcomeMessage = `🌾 農業AIエージェント「Agri-Partner」へようこそ！

私はあなたの農場に特化したAIパートナーです。

📝 できること：
• 日々の作業記録
• 過去の記録検索  
• 圃場情報管理
• 天気情報取得
• 個別化されたアドバイス

何でもお気軽にお話しください！`;

      if (event.replyToken) {
        await this.client.replyMessage(event.replyToken, {
          type: 'text',
          text: welcomeMessage
        });
      }

    } catch (error) {
      console.error('❌ Follow event processing failed:', error);
    }
  }

  /**
   * アンフォローイベントの処理
   */
  private async handleUnfollowEvent(event: any): Promise<void> {
    const userId = event.source.userId;
    console.log(`👋 User unfollowed: ${userId}`);
    
    // 必要に応じてデータベースの状態を更新
    // (現在は特に処理なし)
  }

  /**
   * ユーザー情報の取得または作成
   */
  private async getOrCreateUser(lineUserId: string): Promise<any> {
    try {
      const usersCollection = this.mongoClient.getCollection('users');
      
      // 既存ユーザーを検索
      let user = await usersCollection.findOne({ lineUserId });
      
      if (!user) {
        // LINE プロフィール情報を取得
        let lineProfile;
        try {
          lineProfile = await this.client.getProfile(lineUserId);
        } catch (error) {
          console.log('⚠️  Could not get LINE profile, using defaults');
          lineProfile = { displayName: 'Unknown User' };
        }

        // 新規ユーザーを作成
        const newUser = {
          userId: `user_${Date.now()}_${lineUserId.slice(-6)}`,
          lineUserId,
          name: lineProfile.displayName || 'Unknown User',
          profileImageUrl: lineProfile.pictureUrl,
          joinedAt: new Date(),
          lastActiveAt: new Date(),
          farmId: null, // 後で設定
          preferences: {
            notifications: true,
            language: 'ja',
            timezone: 'Asia/Tokyo'
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await usersCollection.insertOne(newUser);
        console.log(`✅ Created new user: ${newUser.userId}`);
        
        user = newUser;
      } else {
        // 最終アクティブ時刻を更新
        await usersCollection.updateOne(
          { lineUserId },
          { 
            $set: { 
              lastActiveAt: new Date(),
              updatedAt: new Date()
            } 
          }
        );
      }

      return user;
    } catch (error) {
      console.error('❌ User management failed:', error);
      throw error;
    }
  }

  /**
   * エージェントレスポンスのフォーマット
   */
  private formatAgentResponse(agentResponse: any): string {
    try {
      // agentResponseの構造に応じてフォーマット
      if (typeof agentResponse === 'string') {
        return agentResponse;
      }
      
      if (agentResponse && agentResponse.output) {
        return agentResponse.output;
      }
      
      if (agentResponse && agentResponse.result) {
        return JSON.stringify(agentResponse.result, null, 2);
      }
      
      return agentResponse ? JSON.stringify(agentResponse, null, 2) : 'すみません、回答を生成できませんでした。';
      
    } catch (error) {
      console.error('❌ Response formatting failed:', error);
      return '申し訳ございません。回答の処理中にエラーが発生しました。';
    }
  }

  /**
   * サーバー開始
   */
  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 LINE Webhook Server started on port ${port}`);
      console.log(`📋 Available endpoints:`);
      console.log(`   GET  /health - Health check`);
      console.log(`   POST /webhook - LINE Webhook`);
      console.log(`🔌 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  }

  /**
   * 優雅なシャットダウン
   */
  public async shutdown(): Promise<void> {
    console.log('🔄 Shutting down gracefully...');
    
    try {
      await this.mongoClient.disconnect();
      console.log('✅ MongoDB disconnected');
    } catch (error) {
      console.error('❌ MongoDB disconnection failed:', error);
    }
    
    console.log('👋 Server shutdown complete');
  }
}

// スクリプトとして直接実行される場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new LineWebhookServer();
  const port = parseInt(process.env.PORT || '3000');
  
  server.start(port);
  
  // 優雅なシャットダウンの設定
  process.on('SIGTERM', async () => {
    await server.shutdown();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    await server.shutdown();
    process.exit(0);
  });
}