import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Client, middleware, WebhookEvent, MessageEvent, TextMessage } from '@line/bot-sdk';
import { z } from 'zod';
import { mastra } from '../mastra/index.js';
import { getMongoClient } from '../database/mongodb-client.js';
import { LineEvent, LineMessage, LineUserProfile } from '../types';
import { AppConfig } from '../config';

/**
 * LINE Webhook サーバー
 * LINEからのメッセージを受信し、Mastraエージェントシステムに転送
 */
export class LineWebhookServer {
  private app: express.Application;
  private client: Client;
  private mongoClient = getMongoClient();
  
  // セキュリティ強化: 入力検証スキーマ
  private readonly lineWebhookEventSchema = z.object({
    type: z.enum(['message', 'follow', 'unfollow', 'postback', 'beacon']),
    source: z.object({
      type: z.enum(['user', 'group', 'room']),
      userId: z.string().min(1).max(AppConfig.VALIDATION.USER_ID_MAX_LENGTH)
    }),
    message: z.object({
      type: z.enum(['text', 'image', 'video', 'audio', 'file', 'location', 'sticker']),
      text: z.string().max(AppConfig.LINE.MAX_MESSAGE_LENGTH).optional()
    }).optional(),
    timestamp: z.number().positive(),
    replyToken: z.string().optional()
  });
  
  private readonly messageTextSchema = z.string()
    .min(1, 'Message cannot be empty')
    .max(AppConfig.LINE.MAX_MESSAGE_LENGTH, `Message too long (max ${AppConfig.LINE.MAX_MESSAGE_LENGTH} characters)`);

  constructor() {
    // 環境変数の検証
    this.validateEnvironmentVariables();
    
    // Express アプリケーション初期化
    this.app = express();
    
    // LINE Bot Client 初期化
    const lineConfig = AppConfig.getLineConfig();
    this.client = new Client({
      channelAccessToken: lineConfig.accessToken,
      channelSecret: lineConfig.channelSecret,
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 環境変数の検証
   */
  private validateEnvironmentVariables(): void {
    try {
      // 設定ファイルを使用して環境変数を検証
      AppConfig.getLineConfig();
      AppConfig.getDatabaseConfig();
      AppConfig.getGeminiConfig();
    } catch (error) {
      throw new Error(`Environment validation failed: ${this.sanitizeError(error)}`);
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
      origin: AppConfig.ENVIRONMENT.IS_PRODUCTION 
        ? ['https://access.line.me'] 
        : AppConfig.SECURITY.CORS.ALLOWED_ORIGINS,
      credentials: AppConfig.SECURITY.CORS.CREDENTIALS,
      methods: [...AppConfig.SECURITY.CORS.METHODS]
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
        channelSecret: AppConfig.getLineConfig().channelSecret,
      }),
      (req, res) => {
        // セキュリティ強化: 入力検証
        if (!this.validateWebhookPayload(req.body)) {
          console.warn('⚠️  Invalid webhook payload received');
          return res.status(400).json({ error: 'Invalid payload' });
        }
        
        this.handleWebhook(req.body.events)
          .then(() => {
            res.status(200).end();
          })
          .catch((error) => {
            console.error('❌ Webhook handling failed:', this.sanitizeError(error));
            res.status(500).json({ error: 'Internal server error' });
          });
      }
    );

    // 404ハンドラー
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Not found' });
    });

    // エラーハンドラー
    this.app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('❌ Server error:', this.sanitizeError(error));
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
      console.error('❌ MongoDB connection failed:', this.sanitizeError(error));
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
      console.error(`❌ Failed to process event ${event.type}:`, this.sanitizeError(error));
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

    // セキュリティ強化: メッセージテキストの検証
    try {
      this.messageTextSchema.parse(messageText);
    } catch (validationError) {
      console.warn(`⚠️  Invalid message text from ${userId}:`, this.sanitizeError(validationError));
      return;
    }
    
    console.log(`💬 Message from ${userId}: "${this.sanitizeMessageForLog(messageText)}"`);

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
      console.error('❌ Message processing failed:', this.sanitizeError(error));
      
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
  private async handleFollowEvent(event: WebhookEvent): Promise<void> {
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
  private async handleUnfollowEvent(event: WebhookEvent): Promise<void> {
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
   * セキュリティ強化: Webhookペイロードの検証
   */
  private validateWebhookPayload(payload: unknown): boolean {
    try {
      if (!payload || typeof payload !== 'object') {
        return false;
      }
      
      const body = payload as { events?: unknown[] };
      if (!Array.isArray(body.events)) {
        return false;
      }
      
      // 各イベントを検証
      for (const event of body.events) {
        try {
          this.lineWebhookEventSchema.parse(event);
        } catch {
          return false;
        }
      }
      
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * セキュリティ強化: エラーの機密情報サニタイズ
   */
  private sanitizeError(error: unknown): string {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String((error as Error).message);
      return message
        .replace(/mongodb\+srv:\/\/[^@]+@/gi, 'mongodb+srv://***:***@')
        .replace(/\/\/[^@]+@/g, '//***:***@')
        .replace(/password[=:][^&\s]+/gi, 'password=***')
        .replace(/key[=:][^&\s]+/gi, 'key=***')
        .replace(/token[=:][^&\s]+/gi, 'token=***')
        .replace(/secret[=:][^&\s]+/gi, 'secret=***')
        .replace(/accessToken[=:][^&\s]+/gi, 'accessToken=***');
    }
    return 'Operation failed';
  }
  
  /**
   * セキュリティ強化: ログ出力用メッセージのサニタイズ
   */
  private sanitizeMessageForLog(message: string): string {
    // 長いメッセージは省略
    if (message.length > 100) {
      return message.substring(0, 97) + '...';
    }
    
    // 機密情報の可能性がある文字列をマスク
    return message
      .replace(/\b\d{4}-\d{4}-\d{4}-\d{4}\b/g, '****-****-****-****') // クレジットカード番号
      .replace(/\b\d{3}-\d{4}-\d{4}\b/g, '***-****-****') // 電話番号
      .replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '***@***.***'); // メールアドレス
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
      console.error('❌ MongoDB disconnection failed:', this.sanitizeError(error));
    }
    
    console.log('👋 Server shutdown complete');
  }
}

// スクリプトとして直接実行される場合
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new LineWebhookServer();
  const port = AppConfig.ENVIRONMENT.PORT;
  
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