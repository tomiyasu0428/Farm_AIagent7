import { faker } from '@faker-js/faker/locale/ja';
import { 
  UserDocument, 
  FarmDocument, 
  FieldDocument
} from '../database/mongodb-client.js';
import {
  DailyWorkDocument, 
  PersonalKnowledgeDocument 
} from '../types/index.js';

/**
 * 動的テストデータ生成器
 * CodeRabbitのフィードバックに対応：ハードコードされたテストIDを避け、
 * 動的で一意なテストデータを生成する
 */
export class TestDataGenerator {
  private static instance: TestDataGenerator;
  private testIdCounter = 0;

  private constructor() {
    // 再現可能なテスト用にシード設定
    faker.seed(12345);
  }

  static getInstance(): TestDataGenerator {
    if (!TestDataGenerator.instance) {
      TestDataGenerator.instance = new TestDataGenerator();
    }
    return TestDataGenerator.instance;
  }

  /**
   * 一意なテストIDを生成
   */
  private generateTestId(prefix: string): string {
    const timestamp = Date.now();
    const counter = ++this.testIdCounter;
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}_${counter}_${random}`;
  }

  /**
   * テストユーザーデータ生成
   */
  generateTestUser(overrides: Partial<UserDocument> = {}): UserDocument {
    const baseData: UserDocument = {
      userId: this.generateTestId('test_user'),
      lineUserId: `LINE_${faker.string.alphanumeric(10)}`,
      name: faker.person.firstName() + ' ' + faker.person.lastName(),
      farmId: this.generateTestId('test_farm'),
      profileImageUrl: faker.image.avatar(),
      joinedAt: faker.date.past({ years: 2 }),
      lastActiveAt: faker.date.past({ years: 0.02 }),
      preferences: {
        notifications: faker.datatype.boolean(),
        language: 'ja',
        timezone: 'Asia/Tokyo',
        workingHours: {
          start: '06:00',
          end: '18:00'
        }
      },
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.past({ years: 0.003 })
    };

    return { ...baseData, ...overrides };
  }

  /**
   * テスト農場データ生成
   */
  generateTestFarm(overrides: Partial<FarmDocument> = {}): FarmDocument {
    const baseData: FarmDocument = {
      farmId: this.generateTestId('test_farm'),
      farmName: `${faker.location.city()}農場`,
      address: `${faker.location.state()}${faker.location.city()}${faker.location.streetAddress()}`,
      ownerInfo: {
        name: faker.person.fullName(),
        contact: faker.phone.number()
      },
      climateZone: faker.helpers.arrayElement(['温帯', '冷温帯', '亜寒帯']),
      soilConditions: {
        type: faker.helpers.arrayElement(['粘土質', '砂質', '壌土', '腐植土']),
        pH: faker.number.float({ min: 5.5, max: 7.5, fractionDigits: 1 }),
        drainage: faker.helpers.arrayElement(['良好', '普通', '不良']),
        fertility: faker.helpers.arrayElement(['高', '中', '低'])
      },
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.past({ years: 0.08 })
    };

    return { ...baseData, ...overrides };
  }

  /**
   * テスト圃場データ生成
   */
  generateTestField(farmId: string, overrides: Partial<FieldDocument> = {}): FieldDocument {
    const crops = ['じゃがいも', 'とうもろこし', '大根', '人参', 'キャベツ', 'レタス'];
    const currentCrop = faker.helpers.arrayElement(crops);
    
    const baseData: FieldDocument = {
      fieldId: this.generateTestId('test_field'),
      fieldName: `第${faker.number.int({ min: 1, max: 10 })}圃場`,
      farmId,
      size: faker.number.float({ min: 0.1, max: 5.0, fractionDigits: 1 }),
      location: {
        address: `${faker.location.city()}${faker.location.streetAddress()}`,
        coordinates: {
          latitude: faker.location.latitude({ min: 35, max: 45 }),
          longitude: faker.location.longitude({ min: 135, max: 145 })
        }
      },
      currentCrop: {
        cropName: currentCrop,
        variety: `${currentCrop}品種${faker.number.int({ min: 1, max: 5 })}号`,
        plantingDate: faker.date.past({ years: 0.5 }),
        expectedHarvestDate: faker.date.future({ years: 0.5 }),
        growthStage: faker.helpers.arrayElement(['播種', '発芽', '生育', '開花', '結実', '収穫期'])
      },
      soilType: faker.helpers.arrayElement(['粘土質', '砂質', '壌土']),
      characteristics: faker.helpers.arrayElements([
        '日当たり良好', '水はけ良好', '風通し良好', '有機質豊富', 
        '石が多い', '傾斜地', '低湿地', '高台'
      ], { min: 1, max: 3 }),
      personalNotes: [
        faker.lorem.sentence(),
        faker.lorem.sentence()
      ],
      history: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => ({
        year: faker.date.past({ years: 3 }).getFullYear(),
        crop: faker.helpers.arrayElement(crops),
        yield: faker.number.float({ min: 1.0, max: 10.0, fractionDigits: 1 }),
        notes: faker.lorem.sentence()
      })),
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.past({ years: 0.08 })
    };

    return { ...baseData, ...overrides };
  }

  /**
   * テスト作業記録データ生成
   */
  generateTestDailyWork(userId: string, fieldId: string, overrides: Partial<DailyWorkDocument> = {}): DailyWorkDocument {
    const workTypes = ['播種', '施肥', '防除', '中耕', '収穫', 'その他'];
    const workType = faker.helpers.arrayElement(workTypes);
    
    const materials = [
      { name: '種子', amount: '2', unit: 'kg' },
      { name: '化成肥料', amount: '10', unit: 'kg' },
      { name: '農薬', amount: '1', unit: 'L' },
      { name: '堆肥', amount: '100', unit: 'kg' }
    ];

    const description = this.generateWorkDescription(workType);
    const textContent = `${description} ${faker.lorem.sentence()}`;

    const baseData: DailyWorkDocument = {
      recordId: this.generateTestId('test_record'),
      userId,
      fieldId,
      date: faker.date.past({ years: 0.08 }),
      workType: workType as "播種" | "施肥" | "防除" | "中耕" | "収穫" | "その他",
      description,
      materials: faker.helpers.arrayElements(materials, { min: 0, max: 2 }),
      weather: {
        condition: faker.helpers.arrayElement(['晴れ', '曇り', '雨', '雪']),
        temperature: faker.number.int({ min: -5, max: 35 }),
        humidity: faker.number.int({ min: 30, max: 90 })
      },
      duration: faker.number.int({ min: 30, max: 480 }),
      workers: faker.number.int({ min: 1, max: 5 }),
      equipment: faker.helpers.arrayElements([
        'トラクター', '播種機', '散布機', '耕運機', 'くわ', 'スコップ'
      ], { min: 0, max: 3 }),
      notes: faker.lorem.sentence(),
      result: {
        quality: faker.helpers.arrayElement(['excellent', 'good', 'fair', 'poor']),
        effectiveness: faker.helpers.arrayElement(['high', 'medium', 'low']),
        issues: faker.helpers.maybe(() => [faker.lorem.sentence()], { probability: 0.3 }) || [],
        improvements: faker.helpers.maybe(() => [faker.lorem.sentence()], { probability: 0.4 }) || [],
        satisfaction: faker.number.int({ min: 1, max: 5 })
      },
      followUpNeeded: faker.datatype.boolean({ probability: 0.3 }),
      nextActions: faker.helpers.maybe(() => [
        faker.lorem.sentence(),
        faker.lorem.sentence()
      ], { probability: 0.5 }),
      textContent,
      tags: [
        workType,
        faker.helpers.arrayElement(['春', '夏', '秋', '冬']),
        faker.helpers.arrayElement(['晴れ', '曇り', '雨']),
        faker.helpers.arrayElement(['成功', '普通', '課題'])
      ],
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.past({ years: 0.1 })
    };

    return { ...baseData, ...overrides };
  }

  /**
   * 作業種別に応じた説明文を生成
   */
  private generateWorkDescription(workType: string): string {
    const descriptions: Record<string, string[]> = {
      '播種': [
        'じゃがいもの播種作業を実施',
        'とうもろこしの種まき作業',
        '大根の直播作業を完了'
      ],
      '施肥': [
        '化成肥料の追肥作業',
        '有機肥料の基肥施用',
        'NPK肥料の側条施肥'
      ],
      '防除': [
        '病害虫防除のための薬剤散布',
        '除草剤の散布作業',
        '疫病予防の薬剤処理'
      ],
      '中耕': [
        '畝間の中耕除草作業',
        '土寄せと中耕の実施',
        '通路の除草と中耕'
      ],
      '収穫': [
        'じゃがいもの収穫作業',
        '出荷用野菜の収穫',
        '品質選別と収穫作業'
      ],
      'その他': [
        '圃場の見回り作業',
        '農機具のメンテナンス',
        'irrigation システムの点検'
      ]
    };

    return faker.helpers.arrayElement(descriptions[workType] || descriptions['その他']);
  }

  /**
   * テスト個別農場知識データ生成
   */
  generateTestPersonalKnowledge(
    farmId: string, 
    userId: string, 
    overrides: Partial<PersonalKnowledgeDocument> = {}
  ): PersonalKnowledgeDocument {
    const categories = ['experience', 'method', 'observation', 'lesson'] as const;
    const category = faker.helpers.arrayElement(categories);

    const baseData: PersonalKnowledgeDocument = {
      knowledgeId: this.generateTestId('test_knowledge'),
      farmId,
      userId,
      title: this.generateKnowledgeTitle(category),
      content: faker.lorem.sentences(2),
      category: category as "experience" | "technique" | "timing" | "resource" | "issue",
      relatedRecords: [this.generateTestId('test_record')],
      confidence: faker.number.float({ min: 0.5, max: 1.0, fractionDigits: 2 }),
      frequency: faker.number.int({ min: 1, max: 10 }),
      tags: faker.helpers.arrayElements([
        '成功事例', '失敗事例', '季節的', '天候依存', '土壌特性', '品種特性'
      ], { min: 1, max: 3 }),
      lastUsed: faker.date.past({ years: 0.1 }),
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.past({ years: 0.1 })
    };

    return { ...baseData, ...overrides };
  }

  /**
   * カテゴリに応じた知識タイトルを生成
   */
  private generateKnowledgeTitle(category: string): string {
    const titles: Record<string, string[]> = {
      experience: [
        '播種時期の最適化による収量向上',
        '防除タイミングでの病害予防成功',
        '施肥量調整による品質改善'
      ],
      method: [
        '効率的な中耕作業手順',
        '天候を考慮した散布方法',
        '収穫後の圃場処理方法'
      ],
      observation: [
        '土壌状態と作物生育の関係',
        '気象条件による生育影響',
        '病害虫発生パターンの観察'
      ],
      lesson: [
        '失敗から学んだ播種のコツ',
        '経験から得た施肥の教訓',
        '過去の失敗を活かした改善策'
      ]
    };

    return faker.helpers.arrayElement(titles[category] || titles['experience']);
  }

  /**
   * 関連するテストデータセットを生成
   */
  generateRelatedTestDataSet(): {
    user: UserDocument;
    farm: FarmDocument;
    fields: FieldDocument[];
    dailyWorks: DailyWorkDocument[];
    knowledge: PersonalKnowledgeDocument[];
  } {
    const user = this.generateTestUser();
    const farm = this.generateTestFarm({ farmId: user.farmId });
    
    const fields = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
      this.generateTestField(farm.farmId)
    );

    const dailyWorks = fields.flatMap(field =>
      Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
        this.generateTestDailyWork(user.userId, field.fieldId)
      )
    );

    const knowledge = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () =>
      this.generateTestPersonalKnowledge(farm.farmId, user.userId)
    );

    return { user, farm, fields, dailyWorks, knowledge };
  }

  /**
   * テスト用の一意なLINE User IDを生成
   */
  generateTestLineUserId(): string {
    return `LINE_TEST_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * テストデータのクリーンアップ用フィルター生成
   */
  getTestDataFilter(): any {
    return {
      $or: [
        { userId: { $regex: /^test_user_/ } },
        { lineUserId: { $regex: /^LINE_TEST_/ } },
        { farmId: { $regex: /^test_farm_/ } },
        { fieldId: { $regex: /^test_field_/ } },
        { recordId: { $regex: /^test_record_/ } },
        { knowledgeId: { $regex: /^test_knowledge_/ } }
      ]
    };
  }
}

// シングルトンインスタンスをエクスポート
export const testDataGenerator = TestDataGenerator.getInstance();
export default testDataGenerator;