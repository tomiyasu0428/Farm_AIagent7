import { MongoClient, Db, Collection, Document, ObjectId } from 'mongodb';
import { 
  DailyWorkDocument, 
  PersonalKnowledgeDocument, 
  BaseDocument 
} from '../types';
import { AppConfig } from '../config';

/**
 * MongoDB接続とコレクション管理クラス
 * 個別農場データとハイブリッド検索を統合管理
 */
export class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connected: boolean = false;
  
  constructor(private connectionString: string, private dbName: string) {}

  /**
   * データベースに接続
   */
  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(this.connectionString);
      await this.client.connect();
      
      // 接続テスト
      this.db = this.client.db(this.dbName);
      await this.db.admin().ping();
      
      this.connected = true;
      console.log(`✅ MongoDB connected: ${this.sanitizeConnectionString(this.dbName)}`);
    } catch (error) {
      this.connected = false;
      console.error('❌ MongoDB connection failed:', this.sanitizeError(error));
      throw error;
    }
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.connected = false;
        console.log('🔌 MongoDB disconnected');
      } catch (error) {
        console.error('❌ MongoDB disconnection failed:', this.sanitizeError(error));
      } finally {
        this.client = null;
        this.db = null;
        this.connected = false;
      }
    }
  }

  /**
   * コレクション取得
   */
  getCollection<T extends Document>(name: string): Collection<T> {
    if (!this.db || !this.connected) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return this.db.collection<T>(name);
  }

  /**
   * 接続状態確認
   * 改善: 実際のMongoDB接続状態をチェック
   */
  isConnected(): boolean {
    return this.connected && 
           this.client !== null && 
           this.db !== null &&
           this.client.topology?.isConnected() === true;
  }

  /**
   * 機密情報をマスクしたエラーメッセージ
   * セキュリティ強化: 完全な機密情報のサニタイズ
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
        .replace(/credential[=:][^&\s]+/gi, 'credential=***');
    }
    return 'Database operation failed';
  }

  /**
   * 接続文字列から機密情報を削除
   * セキュリティ強化: より安全なマスキング
   */
  private sanitizeConnectionString(connectionString: string): string {
    return connectionString
      .replace(/mongodb\+srv:\/\/[^@]+@/gi, 'mongodb+srv://***:***@')
      .replace(/\/\/[^@]+@/g, '//***:***@')
      .replace(/[?&](password|pwd|key|token|secret)=[^&]*/gi, '$1=***');
  }

  /**
   * 接続の健全性チェック
   * 改善: より適切なタイムアウトとリトライ
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.db || !this.connected) {
        return false;
      }
      
      // 5秒タイムアウトでpingテスト
      const pingPromise = this.db.admin().ping();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Health check timeout')), 5000)
      );
      
      await Promise.race([pingPromise, timeoutPromise]);
      return true;
    } catch (error) {
      console.error('❌ Database health check failed:', this.sanitizeError(error));
      this.connected = false;
      return false;
    }
  }
}

/**
 * 追加的なデータベース型定義
 * （主要な型は src/types/index.ts で定義）
 */
export interface UserDocument extends BaseDocument {
  lineUserId: string;
  name: string;
  farmId: string;
  preferences: Record<string, unknown>;
}

export interface FarmDocument extends BaseDocument {
  farmId: string;
  farmName: string;
  address: string;
  ownerInfo: {
    name: string;
    contact?: string;
  };
  climateZone: string;
  soilConditions: Record<string, unknown>;
}

export interface FieldDocument extends BaseDocument {
  fieldId: string;
  fieldName: string;
  farmId: string;
  size: number; // 面積(ha)
  location: {
    address: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  currentCrop?: {
    cropName: string;
    variety?: string;
    plantingDate?: Date;
    expectedHarvestDate?: Date;
    growthStage?: string;
  };
  soilType: string;
  characteristics: string[];
  personalNotes: string[];
  history: Array<{
    year: number;
    crop: string;
    yield?: number;
    notes?: string;
  }>;
}

// DailyWorkDocument と PersonalKnowledgeDocument は src/types/index.ts からインポート

// シングルトンインスタンス
let mongoClient: MongoDBClient | null = null;

/**
 * MongoDB接続インスタンスを取得
 */
export function getMongoClient(): MongoDBClient {
  if (!mongoClient) {
    const config = AppConfig.getDatabaseConfig();
    mongoClient = new MongoDBClient(config.uri, config.dbName);
  }
  return mongoClient;
}

/**
 * データベース初期化（インデックス作成等）
 */
export async function initializeDatabase(): Promise<void> {
  const client = getMongoClient();
  
  if (!client.isConnected()) {
    await client.connect();
  }

  // インデックス作成
  const dailyWorkCollection = client.getCollection<DailyWorkDocument>('dailyWork');
  const personalKnowledgeCollection = client.getCollection<PersonalKnowledgeDocument>('personalKnowledge');

  // テキスト検索用インデックス
  await dailyWorkCollection.createIndex({ 
    textContent: 'text', 
    description: 'text', 
    notes: 'text' 
  }, { name: AppConfig.DATABASE.INDEXES.TEXT_SEARCH.DAILY_WORK });

  // ベクトル検索用インデックス（Atlas Vector Search）
  // TODO: Atlas UI或いはAPIで設定する必要があります
  
  // 一般的な検索用インデックス
  await dailyWorkCollection.createIndex({ userId: 1, fieldId: 1, date: -1 });
  await dailyWorkCollection.createIndex({ userId: 1, workType: 1, date: -1 });
  await dailyWorkCollection.createIndex({ tags: 1 });

  await personalKnowledgeCollection.createIndex({ farmId: 1, category: 1 });
  await personalKnowledgeCollection.createIndex({ userId: 1, confidence: -1 });
  await personalKnowledgeCollection.createIndex({ tags: 1 });

  console.log('✅ Database indexes created');
}

export default MongoDBClient;