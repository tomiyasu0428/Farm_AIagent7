import { MongoClient, Db, Collection } from 'mongodb';

/**
 * MongoDB接続とコレクション管理クラス
 * 個別農場データとハイブリッド検索を統合管理
 */
export class MongoDBClient {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  
  constructor(private connectionString: string, private dbName: string) {}

  /**
   * データベースに接続
   */
  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(this.connectionString);
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      console.log(`✅ MongoDB connected: ${this.dbName}`);
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  /**
   * 接続を閉じる
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('🔌 MongoDB disconnected');
    }
  }

  /**
   * コレクション取得
   */
  getCollection<T = any>(name: string): Collection<T> {
    if (!this.db) {
      throw new Error('Database not connected');
    }
    return this.db.collection<T>(name);
  }

  /**
   * 接続状態確認
   */
  isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }
}

/**
 * データベース型定義
 */
export interface UserDocument {
  _id?: string;
  lineUserId: string;
  name: string;
  farmId: string;
  preferences: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FarmDocument {
  _id?: string;
  farmId: string;
  farmName: string;
  address: string;
  ownerInfo: {
    name: string;
    contact?: string;
  };
  climateZone: string;
  soilConditions: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FieldDocument {
  _id?: string;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyWorkDocument {
  _id?: string;
  recordId: string;
  userId: string;
  fieldId: string;
  date: Date;
  workType: string;
  description: string;
  materials?: Array<{
    name: string;
    amount: string;
    unit: string;
  }>;
  weather?: {
    condition: string;
    temperature?: number;
    humidity?: number;
  };
  duration?: number; // 分
  workers: number;
  equipment?: string[];
  notes?: string;
  result: {
    quality: 'excellent' | 'good' | 'fair' | 'poor';
    effectiveness?: 'high' | 'medium' | 'low';
    issues?: string[];
    improvements?: string[];
    satisfaction?: number; // 1-5
  };
  followUpNeeded: boolean;
  nextActions?: string[];
  // ベクトル検索用
  textContent: string; // 検索対象テキスト
  embedding?: number[]; // ベクトル表現
  tags: string[]; // 検索タグ
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalKnowledgeDocument {
  _id?: string;
  knowledgeId: string;
  farmId: string;
  userId: string;
  title: string;
  content: string;
  category: string; // 'experience', 'method', 'observation', 'lesson'
  relatedRecords: string[]; // 関連するDailyWorkのrecordId
  confidence: number; // 確信度 0-1
  frequency: number; // 使用頻度
  // ベクトル検索用
  embedding?: number[];
  tags: string[];
  lastUsed: Date;
  createdAt: Date;
  updatedAt: Date;
}

// シングルトンインスタンス
let mongoClient: MongoDBClient | null = null;

/**
 * MongoDB接続インスタンスを取得
 */
export function getMongoClient(): MongoDBClient {
  if (!mongoClient) {
    const connectionString = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    const dbName = process.env.MONGODB_DATABASE || process.env.MONGODB_DB_NAME || 'agri_assistant';
    mongoClient = new MongoDBClient(connectionString, dbName);
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
  });

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