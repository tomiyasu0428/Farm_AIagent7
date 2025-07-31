

# **エージェント型農業アシスタントの設計：北海道農業におけるMastra、LINE、MongoDBを用いたステップ・バイ・ステップ実装ガイド**

## **第1章：農業エージェントシステムのアーキテクチャ設計**

本章では、提案する農業AIエージェントシステムの高レベルなビジョンと技術的基盤を確立します。各コンポーネントがどのように相互作用するかの全体像を提示し、後続の詳細な実装セクションの土台を築きます。

### **1.1. システム概要と基本理念**

#### **問題提起**

北海道の農業は、広大な耕地面積（全国の4分の1を占める）と、一経営体あたりの平均33haという都府県の約11倍に及ぶ規模を特徴としています 1。この大規模かつ専業的な経営形態は、小麦、大豆、ばれいしょ、てん菜、野菜、酪農など多岐にわたる品目を抱え、日本最大の食料供給地域としての役割を担っています 2。しかし、この規模と複雑性は、生産者にとって大きな認知的負荷をもたらします。複数の作物にわたる複雑な作業スケジュール管理、複数回に及ぶ播種や防除のタイミング決定、天候や病害虫の発生状況に応じた動的な計画修正など、記憶と判断に依存するタスクは膨大です。特に、ジャガイモの疫病のように、多回の防除を必要とする重要病害への対応は、コストと環境負荷の観点からも最適化が強く求められています 3。本システムは、これらの複雑で反復的なタスク管理をAIエージェントに委任し、生産者の思考と記憶を代行することで、データに基づいた高精度な農業経営を支援することを目的とします。

#### **アーキテクチャの基本理念**

この課題を解決するため、以下の4つの基本理念に基づいたアーキテクチャを提案します。

1. **エージェントによるオーケストレーション (Agentic Orchestration):** AIエージェントを単なるチャットボットとしてではなく、複雑で長期間にわたるタスクの中心的司令塔（オーケストレーター）として位置づけます。これにより、受動的な応答だけでなく、能動的なタスク管理と実行が可能になります。  
2. **ハイブリッド制御フロー (Hybrid Control Flow):** 農業プロセスには、厳格な手順が求められる確定的（deterministic）な作業と、状況に応じた柔軟な判断が求められる非確定的（non-deterministic）な対話の両方が存在します。この二つの側面に対応するため、Mastraフレームワークの強力なプリミティブを最大限に活用します。重要なプロセス（例：防除サイクル）には、状態機械（ステートマシン）ベースで信頼性の高いWorkflowを用い、ユーザーとの対話や動的な意思決定には、自然言語理解に優れたAgentを用いるハイブリッドアプローチを採用します 4。  
3. **統合データプレーン (Unified Data Plane):** 運用データ（作業記録）、対話履歴（記憶）、そしてベクトル化されたナレッジベース（知識）を、単一のプラットフォームであるMongoDB Atlasに集約します。これにより、複数のデータベースを管理・同期する複雑性が排除され、アーキテクチャ全体が簡素化されます 6。  
4. **デュアルモード・ユーザーエクスペリエンス (Dual-Mode User Experience):** ユーザーである生産者の多様な利用シーンに対応するため、2つのインターフェースを提供します。迅速なアクションや質問には、手軽な対話形式のLINEチャットを、包括的な計画立案や作業状況の確認には、視覚的なLIFF（LINE Front-end Framework）ダッシュボードを用意します。これにより、状況に応じた最適な情報提供と操作性を実現します 8。

### **1.2. 高レベルシステム構成図とデータフロー**

本システムの全体像は、以下のコンポーネントから構成されます。

1. **ユーザーインターフェース層 (User Interface Layer):** LINEアプリケーション（チャットおよびLIFFをホスト）  
2. **APIゲートウェイ層 (API Gateway Layer):** LINE Messaging APIのWebhookエンドポイントとして機能する、Node.js/Express.jsで構築されたサーバー  
3. **エージェントコア層 (Agentic Core Layer):** エージェント、ツール、ワークフローエンジンを含む、永続的なサービスとして稼働するMastraアプリケーション  
4. **データ永続化層 (Data Persistence Layer):** 全てのコレクションをホストするMongoDB Atlas  
5. **外部サービス (External Services):** 天気予報API、道総研などの農業研究機関のデータベース

#### **データフローのウォークスルー**

具体的なユーザーインタラクションを例に、データフローを追跡します。

**シナリオ:** 生産者が「畑Aのじゃがいもに疫病の兆候が見られる。どうすればいい？」とLINEでメッセージを送信する。

1. **メッセージ受信:** メッセージはLINEプラットフォームに送信されます 8。  
2. **Webhookイベント:** LINEプラットフォームは、設定されたWebhook URL（APIゲートウェイ）に対し、HTTP POSTリクエストでイベントを送信します 10。  
3. **リクエスト処理:** APIゲートウェイは、リクエストヘッダの署名を検証し、リクエストが正当なLINEプラットフォームからのものであることを確認した後、リクエストボディをMastraサービスに転送します。  
4. **エージェント起動:** メインの「Agri-Advisor」エージェントがプロンプトを受信し、ユーザーの意図（疫病対策の照会）を理解します。そして、RAG（Retrieval-Augmented Generation）を実行するために、ナレッジベース問い合わせツールを起動します。  
5. **ハイブリッド検索:** RAGツールは、ユーザーのクエリをベクトル化し、MongoDBのKnowledgeBaseコレクションに対してハイブリッド検索を実行します。これにより、意味的に関連する情報（例：道総研が公開する疫病防除技術 3）と、キーワードに一致する情報（例：特定の農薬名）の両方が効率的に取得されます。  
6. **コンテキスト統合と応答生成:** エージェントは、検索で得られた一般的知識と、Tasksコレクションから取得した農場の固有コンテキスト（例：畑Aでの過去の薬剤散布履歴）を統合します。これに基づき、具体的なアドバイスと、実行可能なアクションプラン（例：新規の疫病防除ワークフローの開始提案）を含む応答を生成します。  
7. **応答ストリーミング:** 生成された応答は、APIゲートウェイを経由してユーザーのLINEチャットにストリーミング形式で返信されます。これにより、ユーザーはリアルタイムで応答を受け取ることができます 12。

### **1.3. 技術スタックの選定理由**

本システムで採用する技術スタックは、それぞれの要素が戦略的に連携し合うことで、全体の価値を最大化するように選定されています。

* **Mastra:** TypeScriptファーストのアプローチによる型安全性 13 と、  
  Agent、Tool、そしてXStateに基づくステートフルなWorkflowという、明確に分離されつつも強力に連携するプリミティブ群が、農業のサイクルをモデル化する上で理想的であるため選定しました 14。このエージェントとワークフローの二元性は、柔軟な対話と厳格なプロセス実行という、農業ドメインの要求に完璧に合致しています。  
* **LINE/LIFF:** ターゲットユーザーである日本の生産者における圧倒的な普及率と、メッセージング（チャット）とアプリケーション（LIFF）をシームレスに統合できる能力が、目指すデュアルモードUIを実現する上で最適です 8。  
* **MongoDB Atlas:** 専門のベクトルデータベースと比較検討した結果、運用データ、対話メモリ、ベクトル化された知識を単一のデータベースで管理できる統合的な能力を高く評価し、選定しました 7。特に、Atlasがネイティブで提供するハイブリッド検索機能（  
  $rankFusionなど）は、農業知識のような半構造化データを扱う上で、意味的検索とキーワード検索を組み合わせた高精度な情報検索を可能にする重要な機能です 6。  
* **Node.js/Express.js:** LINE SDKによる優れたサポートがあり 10、Webhookサーバーを構築するための標準的で信頼性の高い選択肢です。

この技術スタックの組み合わせは、単なる寄せ集めではありません。数週間から数ヶ月にわたる農業のワークフローを管理するという要件は、従来の単純なサーバーレスアーキテクチャでは対応が困難です。ワークフローの状態を永続化し、長期間にわたって実行を管理するためには、ステートレスなWebhookゲートウェイと、状態を保持する永続的なエージェントサービスのハイブリッドな構成が必然的に導かれます。Mastraのステートフルなワークフロー機能とMongoDBの永続化能力は、このアーキテクチャを実現するための核となる要素です。

## **第2章：中核的知能：Mastraエージェントバックエンドの構築**

本章では、Mastraフレームワークを用いてAIの「頭脳」にあたる部分を構築するプロセスを、コードレベルで詳細に解説します。北海道の具体的な農業シナリオを基に、各コンポーネントをゼロから構築していきます。

### **2.1. プロジェクト設定とMastraの初期化**

まず、Mastraプロジェクトの基盤を構築します。

1. **プロジェクトの初期化:** ターミナルで以下のコマンドを実行し、対話形式で新しいMastraプロジェクトを作成します 19。  
   Bash  
   npm create mastra@latest

   プロジェクト名、使用するLLMプロバイダー（例: OpenAI）、インストールするコンポーネント（Agents, Tools, Workflowsを選択）などを設定します。  
2. **プロジェクト構造の理解:** CLIによって、src/mastraディレクトリ内にagents, tools, workflowsといったサブディレクトリが生成されます。これがMastraアプリケーションの中心となります 4。  
3. **Mastraインスタンスの設定:** src/mastra/index.tsファイルで、Mastraのメインインスタンスを定義します。ここでは、ロガー（PinoLogger）、ストレージアダプター、そして後続のステップで作成するエージェントとワークフローを登録します。開発初期段階では、ストレージにインメモリのLibSQLStoreを使用すると便利です 21。  
   TypeScript  
   // src/mastra/index.ts  
   import { Mastra } from "@mastra/core/mastra";  
   import { PinoLogger } from "@mastra/loggers";  
   import { LibSQLStore } from "@mastra/libsql";  
   import { agriAdvisorAgent } from "./agents/agri-advisor-agent";  
   import { potatoBlightWorkflow } from "./workflows/potato-blight-workflow";

   export const mastra \= new Mastra({  
     agents: {  
       agriAdvisorAgent,  
     },  
     workflows: {  
       potatoBlightWorkflow,  
     },  
     storage: new LibSQLStore({  
       url: ":memory:", // ローカル開発用にインメモリDBを使用  
     }),  
     logger: new PinoLogger({ name: "AgriAgent", level: "info" }),  
   });

### **2.2. エージェントの定義**

このシステムは、農場全体のマネジメントを円滑に進めるため、特定の役割を持つ複数のAIエージェントが連携して動作する**マルチエージェント・システム**を採用します。各エージェントは明確な責務を持ち、指揮者エージェントの監督のもとで協調します。

* **SupervisorAgent (指揮者) 🧠**: このエージェントはシステム全体の司令塔です。LINEのWebhookから送られてくるユーザーのメッセージを起点に、その意図を分析します。そして、「これは情報の検索だな」「作業記録の登録だな」といった具体的な要求を判断し、最も適した専門エージェント（ReadAgentまたはWriteAgent）を選択してタスクを割り振ります。最終的に専門エージェントからの応答を受け取り、ユーザーにとって分かりやすい形に整形してLINEに返信する役割も担います。  
* **ReadAgent (情報検索・分析専門) 📚**: ユーザーからの「知りたい」という問い合わせに応える、情報検索と分析のスペシャリストです。データベース（MongoDB Atlas）の**ハイブリッド検索機能**を最大限に活用し、最適な情報を引き出します。単にデータを取得するだけでなく、質問の文脈を理解した高度な検索を実行します。  
  **ハイブリッド検索の役割**:  
  * **キーワード検索が有効なケース**: 特定の固有名詞や品番など、正確な情報が必要な場合に強みを発揮します。（例：「農薬**スミチオン**の散布履歴」「品種**りんか409**の去年の収穫量」）  
  * **ベクトル検索が有効なケース**: 曖昧な表現や意図を汲み取り、関連性の高い情報を提示するのに役立ちます。（例：「**葉っぱが黄色くて斑点が出てる**んだけど、対策どうすればいい？」「**去年の今頃、台風の前にやった作業**って何だっけ？」）  
* **WriteAgent (書き込み専門) ✍️**: 作業記録の登録、タスクの作成・更新など、データベースへの**書き込み処理**を専門に担当します。このエージェントの重要な役割は、データの整合性を保証することです。「〇月〇日の防除作業を記録して」といったユーザーの指示に対し、「農薬名、使用量、対象の圃場はこれでよろしいですか？」といった確認フローを内部に持ち、ユーザーの承認を得てから初めてデータを書き込みます。これにより、誤った情報の記録を防ぎます。

次に、システムの中核となる対話型エージェントを定義します。

1. **エージェントの生成:** new Agent({...})コンストラクタを使用して、エージェントの基本設定を行います 12。  
2. **システムプロンプトの設計 (instructions):** エージェントの振る舞いを決定する最も重要な要素です。ペルソナ、能力、制約を明確に定義します 13。  
   TypeScript  
   // src/mastra/agents/agri-advisor-agent.ts  
   import { openai } from "@ai-sdk/openai";  
   import { Agent } from "@mastra/core";  
   import { Memory } from "@mastra/memory";  
   //... tools and workflows imports

   const agriAgent \= new Agent({  
     name: "AgriAgent",  
     instructions: \`\`,  
     model: openai("gpt-4o"), // 使用するLLMモデルを設定 \[12, 14\]  
     // toolsとmemoryは後ほど設定  
   });

3. **記憶機能の設定 (memory):** エージェントに長期的な記憶力を持たせるため、Memoryインスタンスを接続します。これにより、単なる一問一答を超えた、文脈を理解する対話が可能になります。  
   * **対話履歴 (Conversational History):** lastMessagesオプションを設定し、直近の対話履歴をコンテキストとして保持します 23。  
   * **意味的検索 (Semantic Recall):** semanticRecallオプションを設定することで、過去の対話の中から現在の話題と意味的に関連性の高い情報を検索し、コンテキストに加えることができます。例えば、「B畑は水はけが悪い」といったユーザー固有の情報を長期的に記憶させることが可能になります 23。Mem0のような外部の記憶システムと連携することも可能です 25。

TypeScript  
//... agri-advisor-agent.ts 内  
const memory \= new Memory({  
  options: {  
    lastMessages: 10, // 直近10件のメッセージを記憶  
    semanticRecall: {  
      topK: 3, // 意味的に類似した過去の対話チャンクを3つ取得  
      messageRange: 1, // 取得したチャンクの前後1メッセージもコンテキストに含める  
    },  
    threads: {  
      generateTitle: true, // 対話スレッドに自動でタイトルを生成  
    }  
  },  
  // 本番環境ではMongoDBをストレージとして指定  
});

export const agriAdvisorAgent \= new Agent({  
  //...  
  memory,  
  //...  
});

### **2.3. 農業用ツールセットの作成**

エージェントが外部システムと連携し、具体的なアクションを実行するための「ツール」を定義します。Mastraでは、createTool関数とzodライブラリを用いて、厳密に型定義されたツールを作成できます。これにより、LLMからの出力を安定して構造化データとして扱うことが可能になります 12。

ツールのdescriptionは、LLMがどのツールをいつ使うべきかを判断するための最も重要な情報源です。したがって、その役割を明確かつ簡潔に記述することが、エージェントの性能を大きく左右します。

| ツールID (id) | 説明 (description) | 入力スキーマ (inputSchema) | 出力スキーマ (outputSchema) |
| :---- | :---- | :---- | :---- |
| getTaskSchedule | 指定された農地と期間の作業スケジュールを取得する。 | z.object({ fieldId: z.string(), startDate: z.date(), endDate: z.date() }) | z.object({ tasks: z.array(z.object({... })) }) |
| queryKnowledgeBase | 農業に関する質問を受け取り、専門的なナレッジベースを検索して回答の根拠となる情報を取得する。 | z.object({ query: z.string() }) | z.object({ results: z.array(z.object({... })) }) |
| getExternalWeather | 指定された場所の天気予報を取得する。農作業の計画に不可欠。 | z.object({ location: z.string(), days: z.number() }) | z.object({ forecast: z.array(z.object({... })) }) |
| createTaskWorkflow | ユーザーの指示に基づき、新しい農作業のワークフローを開始する。例えば、病害虫防除サイクルを開始する際に使用する。 | z.object({ workflowName: z.string(), inputData: z.any() }) | z.object({ runId: z.string(), status: z.string() }) |
|  |  |  |  |

**Table 2: Core Agricultural Tool Definitions**

このツールセットにより、エージェントはデータベースの読み書き、外部APIの呼び出し、さらには他のワークフローの起動といった多様なタスクを実行できるようになります。特にcreateTaskWorkflowツールは、柔軟な対話を行うエージェントが、厳格なプロセスを実行するワークフローを動的に開始できることを示しており、Mastraのハイブリッド制御フローの強力さを体現しています 26。

### **2.4. ワークフローによる農作業のオーケストレーション**

生産者の複雑で反復的なタスク管理という中核的課題を解決するため、MastraのWorkflow機能を利用します。ワークフローは、確実な実行が求められる一連の操作を、グラフベースのステートマシンとして定義するものです 14。

具体的なユースケース: 「ばれいしょ疫病管理ワークフロー」  
北海道の農業指導情報 3 に基づき、現実的なプロセスをモデル化します。

1. **ワークフローの定義:** createWorkflowを用いて、ワークフローのID、入力・出力スキーマを定義します 30。  
   TypeScript  
   // src/mastra/workflows/potato-blight-workflow.ts  
   import { createWorkflow, createStep } from "@mastra/core/workflows";  
   import { z } from "zod";  
   //... tools imports

   export const potatoBlightWorkflow \= createWorkflow({  
     id: "potato-blight-management",  
     description: "ばれいしょの疫病を管理するための、一連の防除とモニタリング作業を自動化するワークフロー。",  
     inputSchema: z.object({  
       fieldId: z.string().describe("対象となる畑のID"),  
       startDate: z.date().describe("監視開始日"),  
     }),  
     outputSchema: z.object({  
       finalStatus: z.string(),  
       log: z.array(z.string()),  
     }),  
   })  
   //... control flow definition follows

2. **制御フローの構築:**  
   * **順次実行 (.then()):** 基本的なプロセスを順次実行します。「初期防除」→「14日間待機」→「追跡防除」といった流れを定義します 32。  
   * **条件分岐 (.branch()):** 外部データに基づいたロジックを追加します。薬剤散布ステップの前にgetExternalWeatherツールを実行し、もし大雨が予報されていれば「作業延期」ステップに分岐し、そうでなければ「散布実行」ステップに進みます 32。  
   * **ループ (.dountil()):** 高リスク期間が終了する特定の日付まで、モニタリングと散布を繰り返すという反復的な性質をモデル化します 31。  
   * **人間参加型プロセス (.suspend() / .resume()):** これは本システムにおいて極めて重要な機能です。コストのかかる、あるいは不可逆なアクション（例：農薬散布）の前に、「生産者確認」ステップを実行します。このステップは内部で.suspend()を呼び出し、ワークフローを一時停止させます 33。エージェントはLINEを通じて生産者に確認メッセージを送信します。生産者がLINEで応答すると、その応答をトリガーとしてAPIが呼び出され、そのAPIがワークフローの実行インスタンスに対して  
     .resume()を呼び出します。このとき、生産者の確認データ（「承認」または「拒否」）をワークフローに渡すことで、プロセスが再開されます 33。

このステートフルで一時停止可能なワークフローは、単なるタスクスケジューラとは一線を画します。これは農業のシーズン全体をモデル化するメカニズムです。例えば「ばれいしょ生育ライフサイクルワークフロー」は、植え付け時に開始され、数ヶ月間にわたってアクティブな状態を保ちます。その間の各ステップは、時間経過（sleep）、外部イベント（天気警報）、あるいは人間からの入力（生育段階の確認）によってトリガーされます。Mastraワークフローがステートマシンであるため、各ステップでそのコンテキスト全体が永続化されます。つまり、ワークフローが再開される際には、それまでに何が起こったかをすべて記憶しているのです。この「耐久性のある実行 (Durable Execution)」こそが、AIが農業プロセスの「記憶を代行する」というユーザーの根本的な要求を満たすための鍵となる技術的特徴です。

## **第3章：知識基盤：MongoDB Atlasによるデータモデリングと検索**

本章では、システムの記憶、知識、そして運用記録として機能するデータベースの設計と実装について詳述します。

### **3.1. 農業データのためのデータベーススキーマ設計**

MongoDBの柔軟なドキュメントモデルを活用し、農業ドメインに特化したコレクションを設計します。TypeScriptのインターフェースを定義することで、アプリケーション全体でのデータの一貫性を保証します。

| コレクション名 | 説明 | 主要フィールド |
| :---- | :---- | :---- |
| users | 生産者のプロファイル情報。LINEのユーザーIDと紐付ける。 | lineUserId (string, unique), name (string), farmId (ObjectId) |
| farms | 農場に関する基本情報。 | farmName (string), address (string) |
| fields | 各農地の詳細情報。 | fieldName (string), farmId (ObjectId), size (number), currentCrop (string), soilType (string) |
| tasks | 予定または完了した全ての作業記録。 | taskName (string), fieldId (ObjectId), status (string: 'pending', 'completed', 'suspended'), scheduledDate (Date), completionDate (Date), mastraWorkflowRunId (string) |
| knowledgeBase | RAGのためのナレッジベース。 | textChunk (string), embedding (array of numbers), sourceUrl (string), sourceDocument (string), metadata (object) |
|  |  |  |

**Table 3: MongoDB Collection Schemas for Agricultural Data**

このデータモデルは、システムの運用に必要な情報を網羅的に管理するための基盤となります。特にtasksコレクションは、Mastraのワークフロー実行インスタンスと連携し、AIが管理するタスクの状況を永続的に追跡する上で中心的な役割を果たします。

### **3.2. 農業ナレッジベースの構築 (RAG)**

エージェントの知能は、LLMそのものだけでなく、LLMが高品質なドメイン固有の知識で補強されることによって飛躍的に向上します。このシステムにおける競争優位性の源泉は、北海道の農業に特化したキュレーション済みデータです。

1. **データソースの特定:** 北海道立総合研究機構（道総研）の研究成果 3、JA北海道（ホクレン）の発行物（例：「アグリポート」）40、地域の農業改良普及センターからの指導情報 41 など、信頼性の高い情報源を特定します。これらの地域に密着したタイムリーなデータこそが、汎用的なLLMにはない価値を提供します。  
2. **データ処理パイプラインの構築:** 以下のステップでデータを処理し、ナレッジベースを構築します。  
   * **抽出 (Extraction):** Webページからテキストをスクレイピングするか、PDFドキュメントからテキストを抽出します。  
   * **分割 (Chunking):** 長いドキュメントを、意味的にまとまりのある小さなチャンクに分割します。Mastraが提供するRAGユーティリティも参考にできます 4。  
   * **埋め込み (Embedding):** OpenAIのtext-embedding-3-largeなどの埋め込みモデルを使用し、各テキストチャンクをベクトル表現に変換します。  
   * **格納 (Upserting):** テキストチャンク、そのメタデータ（出典など）、そしてベクトル埋め込みを、MongoDBのknowledgeBaseコレクションに格納します。  
3. **ベクトルインデックスの作成:** MongoDB Atlas上で、knowledgeBaseコレクションのembeddingフィールドに対して、効率的な近似最近傍探索（ANN）を可能にするためのVector Searchインデックスを作成します。インデックス定義はJSON形式で簡単に行えます 17。  
   JSON  
   {  
     "fields":  
   }

### **3.3. 高精度な検索を実現するハイブリッド検索の実装**

農業に関する質問は、「病気に強い品種」（意味的な概念）と「ゆきらら」（特定のキーワード）のように、抽象的な概念と具体的な固有名詞が混在することが頻繁にあります。このようなクエリに対して高い適合率を実現するためには、意味的類似性で検索するベクトル検索と、キーワードで検索する全文検索を組み合わせた「ハイブリッド検索」が極めて有効です 6。

1. **全文検索インデックスの作成:** knowledgeBaseコレクションのtextChunkフィールドに対して、Atlas Searchインデックスを作成し、キーワード検索を有効化します 18。  
2. **ハイブリッド検索クエリの構築:** MongoDBのAggregation Pipelineを用いて、ベクトル検索と全文検索を統合します。最新の$rankFusionステージを利用することで、両者の結果をReciprocal Rank Fusion (RRF) という先進的な手法で効率的に融合できます 6。  
   JavaScript  
   // MongoDB Aggregation Pipeline for Hybrid Search  
   const queryVector \= \[ \-0.025, 0.014,... \]; // User query embedded vector  
   const userQueryText \= "疫病に強いじゃがいも品種";

   db.knowledgeBase.aggregate(  
       }  
     },  
     {  
       $rankFusion: {  
         // Reciprocal Rank Fusion (RRF)  
         // Combines scores from both searches  
       }  
     },  
     {  
       $project: {  
         \_id: 0,  
         textChunk: 1,  
         sourceUrl: 1,  
         score: { $meta: "rankFusionScore" }  
       }  
     },  
     { $limit: 5 }  
   \]);

この統合されたアプローチは、エージェントが必要とするツールの実装を大幅に簡素化するという利点ももたらします。トランザクションDB、ベクトルDB、キャッシュなどを個別に扱うのではなく、単一のMongoDBクライアントを通じてすべてのデータ操作が可能になるため、ツールのロジックとLLMが行うべき推論がシンプルになります。これは、システム全体の複雑性を低減する上で大きなエンジニアリング上のメリットです 6。

## **第4章：ユーザーインターフェース：LINEおよびLIFFとの連携**

本章では、ユーザーが直接触れるコンポーネントの構築について詳述し、Mastraバックエンドとの安全かつシームレスな接続を確保します。

### **4.1. LINE Webhookサーバー（APIゲートウェイ）の構築**

1. **プロジェクト設定:** Node.jsとExpress.jsを用いて、APIサーバーの雛形を作成します 22。  
2. **LINE Bot SDKの導入:** @line/bot-sdkパッケージをインストールし、LINE Messaging APIとの通信を容易にします 10。  
3. **Webhookエンドポイントの作成:** /webhookというパスでPOSTリクエストを受け付けるエンドポイントを作成します。  
4. **署名検証（セキュリティの要）:** LINE SDKが提供するmiddlewareをExpressに組み込みます。このミドルウェアは、受信するすべてのリクエストのX-Line-Signatureヘッダーを自動的に検証し、リクエストがLINEプラットフォームから送信された正当なものであることを保証します。これは、なりすましなどの悪意のある攻撃を防ぐための不可欠なセキュリティ対策です 10。  
   TypeScript  
   // src/server.ts  
   import express from 'express';  
   import { middleware, MiddlewareConfig, WebhookEvent } from '@line/bot-sdk';

   const config: MiddlewareConfig \= {  
     channelSecret: process.env.LINE\_CHANNEL\_SECRET\!,  
   };

   const app \= express();

   app.post('/webhook', middleware(config), (req, res) \=\> {  
     // イベント処理ロジック  
     handleEvents(req.body.events);  
     res.sendStatus(200);  
   });

   //...

5. **イベントハンドリング:** req.body.events配列に含まれるイベントを処理する関数を作成します。主としてmessageイベントを対象とし、ユーザーのメッセージテキスト、LINEユーザーID（userId）、そして応答に使用するreplyTokenを抽出します 8。

### **4.2. LINEとMastraエージェントの接続**

Webhookサーバーは、Mastraエージェントへのプロキシとして機能します。

1. **リクエスト転送:** メッセージを受信すると、WebhookサーバーはMastraサーバーのエージェントエンドポイント（例: http://mastra-service:4111/api/agents/agriAdvisorAgent/stream）に対してHTTP POSTリクエストを送信します。  
2. **コンテキストの引き渡し:** リクエストボディには、ユーザーのメッセージ本文とuserIdを含めます。Mastra側では、このuserIdをresourceIdとして使用し、ユーザーごとの記憶（メモリ）を管理します 23。  
3. **ストリーミング応答:** Mastraエージェントは、応答をストリーム形式で返します 12。Expressサーバーは、このストリームをLINE Messaging APIの  
   replyMessage関数に直接パイプすることで、ユーザーにリアルタイムのタイピング風の体験を提供します。

### **4.3. LIFFダッシュボードの設計**

LIFFは、LINEアプリ内で動作するWebアプリケーションであり、リッチなユーザーインターフェースを提供します。

1. **LIFFアプリの初期化:** LINE Developers ConsoleでLIFFアプリを登録し、フロントエンドのコード（React, Vueなど）でliff.init()を呼び出して初期化します 9。  
2. **安全なユーザー認証フロー:** これはLIFF連携における最も重要なセキュリティプロセスです。  
   * **トークン取得:** LIFFアプリは初期化後、liff.getAccessToken()を呼び出して、現在ログインしているユーザーのアクセストークンを取得します 9。  
   * **トークン送信:** LIFFフロントエンドは、バックエンド（Expressサーバー）への全てのAPIリクエストにおいて、このアクセストークンをAuthorization: Bearer \<token\>ヘッダーに含めて送信します。  
   * **バックエンドでの検証:** Expressサーバーは、リクエストから受け取ったアクセストークンを、LINEプラットフォームが提供する検証APIエンドポイント（GET /oauth2/v2.1/verify）に送信して検証します。この検証により、トークンの正当性、有効期限、そしてどのチャネル（LIFFアプリ）に対して発行されたものか（channelId）を確認できます。サーバーは自身のchannelIdと一致するかをチェックし、トークンがこのLIFFアプリのために発行されたものであることを保証します。これにより、不正なアクセスを完全に防ぐことができます 48。  
   * **ユーザー情報取得:** 検証が成功した後、サーバーはこのアクセストークンを用いてユーザーのプロフィール情報（GET /v2/profile）を安全に取得し、ダッシュボードの表示をパーソナライズできます 48。  
3. **ダッシュボードのコンポーネント:**  
   * **ワークフロー状況ビュー:** ユーザーが関与しているすべてのアクティブまたは一時停止中のワークフローの状況を、データベースのtasksコレクションから取得して表示します。  
   * **作業カレンダー:** 予定されている作業をカレンダー形式で視覚的に表示します。  
   * **ナレッジベース検索:** RAGナレッジベースを直接検索できるインターフェースを提供します。

このLIFFダッシュボードは、単なるデータ入力フォーム以上の役割を果たします。これは、バックエンドで実行されているMastraワークフローの状態を可視化するツールです。ユーザーがチャットで対話を開始し、エージェントがワークフローを起動すると、LIFFダッシュボードにはそのワークフローの進捗状況（例：「一時停止中 \- 降雨確認待ち」）が永続的かつ視覚的に表示されます。このフィードバックループは、抽象的なAIの処理をユーザーにとって具体的で管理可能なものに変え、UIを単なる入出力装置から戦略的な管理ツールへと昇華させます。

## **第5章：デプロイメントと運用戦略**

本章では、開発したシステムを本番環境に展開し、信頼性、セキュリティ、保守性を確保するためのロードマップを提供します。

### **5.1. デプロイメントアーキテクチャ：ハイブリッドアプローチ**

これまでの分析に基づき、ステートレスなコンポーネントとステートフルなコンポーネントを分離するハイブリッドなデプロイメント戦略を推奨します。このアーキテクチャは、システムの回復力とスケーラビリティを最大化します。

* **LINE Webhookゲートウェイ（ステートレス）:** このコンポーネントは、イベント駆動型で状態を持たないため、**Vercel** 50 やAWS Lambdaのようなサーバーレスプラットフォームへのデプロイが最適です。これにより、大量のメッセージ受信に対する高い可用性と自動スケーリングが実現します。  
* **Mastraエージェント/ワークフローサービス（ステートフル）:** このコンポーネントは、アクティブなワークフローの状態を管理し、長期間稼働する必要があるため、Dockerコンテナとしてパッケージ化し、**AWS ECS**や**Digital Ocean App Platform**のようなコンテナオーケストレーションサービス上でデプロイすることを推奨します。これにより、プロセスが常に稼働し続けることが保証されます。Mastraのmastra buildコマンドは標準的なNode.jsサーバーを生成するため、このプロセスは容易です 53。将来的には、Mastra Cloudのようなマネージドホスティングサービスの利用も視野に入ります 54。

このアーキテクチャは、大量のメッセージを処理する受付部分と、状態を管理する頭脳部分を分離します。例えば、Mastraサービスがアップデートのために再起動している間も、サーバーレスゲートウェイはLINEからのメッセージを受け付け続け、キューイング（例：AWS SQS）することで、メッセージの損失を防ぎます。この分離は、システム全体の可用性と耐障害性を大幅に向上させます。

### **5.2. 環境とセキュリティの管理**

* **環境変数:** OPENAI\_API\_KEY、LINE\_CHANNEL\_SECRET、MONGODB\_URIなどの機密情報は、ローカル開発では.envファイル 13、本番環境ではVercelのEnvironment VariablesやAWS Secrets Managerといったホスティングプロバイダーが提供するセキュアな仕組みで管理します。コードリポジトリに機密情報を含めることは絶対に避けるべきです。  
* **CI/CDパイプライン:** GitHub Actionsなどを利用した継続的インテグレーション/継続的デプロイメントのパイプラインを構築します。メインブランチにコードがプッシュされると、自動的にテスト、ビルド、そしてVercelゲートウェイとMastraサービスのコンテナがデプロイされるワークフローを定義します。

### **5.3. データ整合性：バックアップとリストア**

ビジネスに不可欠なアプリケーションにとって、データの損失は許容されません。本システムでは、MongoDB Atlasの強力なマネージドバックアップ機能を全面的に活用します 56。

* **バックアップポリシーの設定:** AtlasのUI上で、バックアップの頻度（例：毎日）と保持期間（例：30日間）を設定します。  
* **ポイントインタイムリカバリ（PITR）:** Atlasの継続的クラウドバックアップ機能により、データベースを過去の任意の時点（分単位）に復元することが可能です。これは、オペレーションミスなどによるデータ破損からの回復に極めて重要です 56。  
* **リストア手順:** 障害発生時には、本番環境に影響を与えることなく、バックアップスナップショットを新しいクラスタにリストアすることが推奨されるベストプラクティスです 58。リストアが完了し、データの整合性が確認された後に、アプリケーションの接続先を新しいクラスタに切り替えます。

システムの価値は、初期デプロイメントだけでなく、その後の運用と保守、そして障害からの回復能力によって決まります。MongoDB Atlasのような運用が成熟したマネージドサービスを選択することは、バックアップやリストアといった複雑な作業をプラットフォームに委任し、開発チームが本来注力すべきエージェントのロジック開発に集中できるという、長期的な視点での大きな利点をもたらします。

## **結論と今後の展望**

本レポートでは、Mastraフレームワーク、LINEプラットフォーム、そしてMongoDB Atlasを組み合わせ、北海道の農業が直面する特有の課題に対応するための、エージェント型農業アシスタントシステムの包括的な設計と実装ガイドを提示しました。

提案されたアーキテクチャは、MastraのAgentとWorkflowのハイブリッド制御フローを活用して柔軟な対話と厳格なプロセス実行を両立させ、MongoDB Atlasの統合データプレーンとハイブリッド検索によって高精度な知識検索を実現し、LINE/LIFFのデュアルモードUIを通じて生産者に最適なユーザー体験を提供します。また、ハイブリッドなデプロイメント戦略とマネージドサービス（特にMongoDB Atlas）の活用により、本番環境での高い信頼性と運用効率を確保します。

このシステムは、生産者の思考と記憶を代行する強力な基盤となりますが、さらなる発展の可能性も秘めています。

* **マルチエージェントシステムへの進化:** 単一の「アグリアドバイザー」エージェントから、天候分析、市場価格分析、病害虫同定など、それぞれが専門知識を持つ複数のエージェントが協調して動作する階層的なマルチエージェントシステムへと進化させることが考えられます 60。これにより、より高度で専門的な意思決定支援が可能になります。  
* **プロアクティブなタスク起動:** IoT土壌センサーや衛星画像などのリアルタイムデータソースと連携し、ユーザーからの指示を待つことなく、システムが自律的に灌漑ワークフローなどを起動する、受動的なアシスタントから能動的なパートナーへの進化を目指します。  
* **高度なデータ分析:** システムに蓄積された作業記録や農地のパフォーマンスデータを分析し、収量予測や経営改善に繋がる、より高次のビジネスインテリジェンスを生産者に提供します。

本システムは、テクノロジーの力で農業の未来を形作るための一つの設計図です。北海道の広大な大地で、データ駆動型の次世代農業が実現されることを期待します。

#### **引用文献**

1. 北海道農業の概要 \- 国土交通省 北海道開発局, 7月 31, 2025にアクセス、 [https://www.hkd.mlit.go.jp/ky/ns/nou\_seekei/ud49g70000006f4q.html](https://www.hkd.mlit.go.jp/ky/ns/nou_seekei/ud49g70000006f4q.html)  
2. 北海道データブック2024\_農業 \- 総合政策部知事室広報広聴課, 7月 31, 2025にアクセス、 [https://www.pref.hokkaido.lg.jp/ss/tkk/databook/193553.html](https://www.pref.hokkaido.lg.jp/ss/tkk/databook/193553.html)  
3. ジャガイモ疫病に対する減農薬防除技術, 7月 31, 2025にアクセス、 [https://www.hro.or.jp/agricultural/center/result/kenkyuseika/seikajoho/h08s\_joho/h0800018.htm](https://www.hro.or.jp/agricultural/center/result/kenkyuseika/seikajoho/h08s_joho/h0800018.htm)  
4. Introduction | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/docs](https://mastra.ai/docs)  
5. Mastra Agent System Review: A Fresh Take on AI Development | by Justin Rich | Jun, 2025, 7月 31, 2025にアクセス、 [https://justinrich.medium.com/mastra-agent-system-review-a-fresh-take-on-ai-development-04ca3e8e3a1b](https://justinrich.medium.com/mastra-agent-system-review-a-fresh-take-on-ai-development-04ca3e8e3a1b)  
6. Hybrid Search Explained \- MongoDB, 7月 31, 2025にアクセス、 [https://www.mongodb.com/resources/products/capabilities/hybrid-search](https://www.mongodb.com/resources/products/capabilities/hybrid-search)  
7. Comparing Vector Search Solutions 2023 \- Pureinsights, 7月 31, 2025にアクセス、 [https://pureinsights.com/blog/2023/comparing-vector-search-solutions-2023/](https://pureinsights.com/blog/2023/comparing-vector-search-solutions-2023/)  
8. Chatbot (Messaging API) \- LINE API Use Case, 7月 31, 2025にアクセス、 [https://lineapiusecase.com/en/api/msgapi.html](https://lineapiusecase.com/en/api/msgapi.html)  
9. LIFF v2 API reference \- LINE Developers, 7月 31, 2025にアクセス、 [https://developers.line.biz/en/reference/liff/](https://developers.line.biz/en/reference/liff/)  
10. Webhook | line-bot-sdk-nodejs, 7月 31, 2025にアクセス、 [https://line.github.io/line-bot-sdk-nodejs/guide/webhook.html](https://line.github.io/line-bot-sdk-nodejs/guide/webhook.html)  
11. 無農薬条件下でのジャガイモ疫病の感染時期と発病程度, 7月 31, 2025にアクセス、 [https://rakuno.repo.nii.ac.jp/record/2000097/files/S-48-2-149-157.pdf](https://rakuno.repo.nii.ac.jp/record/2000097/files/S-48-2-149-157.pdf)  
12. Agent Overview | Agent Documentation \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/agents/overview](https://mastra.ai/docs/agents/overview)  
13. Mastra.ai Quickstart \- How to build a TypeScript agent in 5 minutes or less \- WorkOS, 7月 31, 2025にアクセス、 [https://workos.com/blog/mastra-ai-quick-start](https://workos.com/blog/mastra-ai-quick-start)  
14. Mastra: The Typescript Agent framework, 7月 31, 2025にアクセス、 [https://mastra.ai/](https://mastra.ai/)  
15. EPIC: Agentic-Flow \- Enterprise Multi-LLM Orchestration Platform with Mastra AI Integration · Issue \#421 · ruvnet/claude-flow \- GitHub, 7月 31, 2025にアクセス、 [https://github.com/ruvnet/claude-flow/issues/421](https://github.com/ruvnet/claude-flow/issues/421)  
16. MongoDB Atlas vs Pinecone | Zilliz, 7月 31, 2025にアクセス、 [https://zilliz.com/comparison/mongodb-atlas-vs-pinecone](https://zilliz.com/comparison/mongodb-atlas-vs-pinecone)  
17. Atlas Vector Search Overview \- Atlas \- MongoDB Docs, 7月 31, 2025にアクセス、 [https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)  
18. How to Perform Hybrid Search \- Atlas \- MongoDB Docs, 7月 31, 2025にアクセス、 [https://www.mongodb.com/docs/atlas/atlas-search/tutorial/hybrid-search/](https://www.mongodb.com/docs/atlas/atlas-search/tutorial/hybrid-search/)  
19. Creating a AI Workflow using Mastra AI | by Faris M. Syariati \- Medium, 7月 31, 2025にアクセス、 [https://medium.com/@farissyariati/creating-a-ai-workflow-using-mastra-ai-5c3900d23e09](https://medium.com/@farissyariati/creating-a-ai-workflow-using-mastra-ai-5c3900d23e09)  
20. Build your first agent in 5 minutes with Mastra \- DEV Community, 7月 31, 2025にアクセス、 [https://dev.to/mastra\_ai/build-your-first-agent-in-5-minutes-with-mastra-2ah3](https://dev.to/mastra_ai/build-your-first-agent-in-5-minutes-with-mastra-2ah3)  
21. Building AI Agents with Mastra.ai: A Hands-on Experiment | by David Sam | Medium, 7月 31, 2025にアクセス、 [https://medium.com/@\_davidsam/building-ai-agents-with-mastra-ai-a-hands-on-experiment-d1bfdbbfcdf1](https://medium.com/@_davidsam/building-ai-agents-with-mastra-ai-a-hands-on-experiment-d1bfdbbfcdf1)  
22. Build a Fullstack Stock Portfolio Agent with Mastra and AG-UI \- DEV Community, 7月 31, 2025にアクセス、 [https://dev.to/copilotkit/build-a-fullstack-stock-portfolio-agent-with-mastra-and-ag-ui-1ci2](https://dev.to/copilotkit/build-a-fullstack-stock-portfolio-agent-with-mastra-and-ag-ui-1ci2)  
23. Memory overview \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/memory/overview](https://mastra.ai/docs/memory/overview)  
24. Using Mastra's Agent Memory API, 7月 31, 2025にアクセス、 [https://mastra.ai/blog/agent-memory-guide](https://mastra.ai/blog/agent-memory-guide)  
25. Mem0 with Mastra, 7月 31, 2025にアクセス、 [https://docs.mem0.ai/examples/mem0-mastra](https://docs.mem0.ai/examples/mem0-mastra)  
26. Using Workflows with Agents and Tools \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/workflows/using-with-agents-and-tools](https://mastra.ai/docs/workflows/using-with-agents-and-tools)  
27. Examples List: Workflows, Agents, RAG | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/examples](https://mastra.ai/examples)  
28. Build and manage your agent workflows \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/workflows](https://mastra.ai/workflows)  
29. A deep dive into Mastra AI workflows with code examples \- Khaled Garbaya, 7月 31, 2025にアクセス、 [https://khaledgarbaya.net/blog/mastering-mastra-ai-workflows](https://khaledgarbaya.net/blog/mastering-mastra-ai-workflows)  
30. Handling Complex LLM Operations | Workflows \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/workflows/overview](https://mastra.ai/docs/workflows/overview)  
31. Reference: Workflow Class | Building Workflows | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/reference/workflows/workflow](https://mastra.ai/reference/workflows/workflow)  
32. Branching, Merging, Conditions | Workflows | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/workflows/control-flow](https://mastra.ai/docs/workflows/control-flow)  
33. Building workflows with Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/blog/building-workflows](https://mastra.ai/blog/building-workflows)  
34. Suspend & Resume Workflows | Human-in-the-Loop | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/workflows/suspend-and-resume](https://mastra.ai/docs/workflows/suspend-and-resume)  
35. .resumeWithEvent() Method | Mastra Docs, 7月 31, 2025にアクセス、 [https://mastra.ai/reference/workflows/resumeWithEvent](https://mastra.ai/reference/workflows/resumeWithEvent)  
36. 成果情報 | 農研機構, 7月 31, 2025にアクセス、 [https://www.naro.go.jp/project/results/main/index.html](https://www.naro.go.jp/project/results/main/index.html)  
37. 北海道農業研究センター \- 農研機構, 7月 31, 2025にアクセス、 [https://www.naro.go.jp/laboratory/harc/index.html](https://www.naro.go.jp/laboratory/harc/index.html)  
38. 北海道農業試験会議 試験研究成果一覧 \- 北海道立総合研究機構, 7月 31, 2025にアクセス、 [https://www.hro.or.jp/agricultural/center/result/kenkyuseika.html](https://www.hro.or.jp/agricultural/center/result/kenkyuseika.html)  
39. 北海道立総合研究機構と連携した有機農業技術の開発について, 7月 31, 2025にアクセス、 [https://www.pref.hokkaido.lg.jp/ns/shs/yuki/dousoukentorenkeishitayukinougyougizyutukaihatu.html](https://www.pref.hokkaido.lg.jp/ns/shs/yuki/dousoukentorenkeishitayukinougyougizyutukaihatu.html)  
40. 営農支援｜ホクレン農業協同組合連合会, 7月 31, 2025にアクセス、 [https://www.hokuren.or.jp/role/farming/](https://www.hokuren.or.jp/role/farming/)  
41. 北海道農業担い手育成センター, 7月 31, 2025にアクセス、 [http://www.adhokkaido.or.jp/ninaite/](http://www.adhokkaido.or.jp/ninaite/)  
42. 身近で頼れる存在 指導農業士・農業士 \- アグリポートWeb, 7月 31, 2025にアクセス、 [https://agriport.jp/agriculture/ap-17569/](https://agriport.jp/agriculture/ap-17569/)  
43. 地域担い手育成センター窓口 \- 公益財団法人北海道農業公社, 7月 31, 2025にアクセス、 [https://www.adhokkaido.or.jp/ninaite/about/center/](https://www.adhokkaido.or.jp/ninaite/about/center/)  
44. The aRt of RAG Part 2: Hybrid Retrieval with Atlas | by Ross Ashman (PhD) | Medium, 7月 31, 2025にアクセス、 [https://medium.com/@rossashman/the-art-of-rag-with-atlas-part-2-hybrid-retrieval-77631457b565](https://medium.com/@rossashman/the-art-of-rag-with-atlas-part-2-hybrid-retrieval-77631457b565)  
45. Demo: NEW Hybrid search with $rankFusion in MongoDB Atlas \- YouTube, 7月 31, 2025にアクセス、 [https://www.youtube.com/watch?v=XFH6xUCBMmc](https://www.youtube.com/watch?v=XFH6xUCBMmc)  
46. Announcing Hybrid Search support via $rankFusion\! \- MongoDB, 7月 31, 2025にアクセス、 [https://www.mongodb.com/community/forums/t/announcing-hybrid-search-support-via-rankfusion/324476](https://www.mongodb.com/community/forums/t/announcing-hybrid-search-support-via-rankfusion/324476)  
47. Receive messages (webhook) \- LINE Developers, 7月 31, 2025にアクセス、 [https://developers.line.biz/en/docs/messaging-api/receiving-messages/](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)  
48. Using user data in LIFF apps and servers \- LINE Developers, 7月 31, 2025にアクセス、 [https://developers.line.biz/en/docs/liff/using-user-profile/](https://developers.line.biz/en/docs/liff/using-user-profile/)  
49. Validate Access Tokens | Okta Developer, 7月 31, 2025にアクセス、 [https://developer.okta.com/docs/guides/validate-access-tokens/dotnet/main/](https://developer.okta.com/docs/guides/validate-access-tokens/dotnet/main/)  
50. Deploying to Vercel, 7月 31, 2025にアクセス、 [https://vercel.com/docs/deployments](https://vercel.com/docs/deployments)  
51. Serverless Deployment \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/deployment/serverless-platforms](https://mastra.ai/docs/deployment/serverless-platforms)  
52. Vercel Deployer \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/deployment/serverless-platforms/vercel-deployer](https://mastra.ai/docs/deployment/serverless-platforms/vercel-deployer)  
53. Deploy A Mastra Server, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/deployment/server-deployment](https://mastra.ai/docs/deployment/server-deployment)  
54. Setting Up a Project \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/mastra-cloud/setting-up](https://mastra.ai/docs/mastra-cloud/setting-up)  
55. Installing Mastra | Getting Started, 7月 31, 2025にアクセス、 [https://mastra.ai/docs/getting-started/installation](https://mastra.ai/docs/getting-started/installation)  
56. Exploring MongoDB Atlas Backups \- Ottomatik, 7月 31, 2025にアクセス、 [https://ottomatik.io/post/exploring-mongodb-atlas-backups](https://ottomatik.io/post/exploring-mongodb-atlas-backups)  
57. Back Up, Restore, and Archive Data \- Atlas \- MongoDB Docs, 7月 31, 2025にアクセス、 [https://www.mongodb.com/docs/atlas/backup-restore-cluster/](https://www.mongodb.com/docs/atlas/backup-restore-cluster/)  
58. Restore Your Cluster \- Atlas \- MongoDB Docs, 7月 31, 2025にアクセス、 [https://www.mongodb.com/docs/atlas/backup/cloud-backup/restore-overview/](https://www.mongodb.com/docs/atlas/backup/cloud-backup/restore-overview/)  
59. Restore a single DB from MongoDB Atlas Cloud backup, 7月 31, 2025にアクセス、 [https://www.mongodb.com/community/forums/t/restore-a-single-db-from-mongodb-atlas-cloud-backup/15409](https://www.mongodb.com/community/forums/t/restore-a-single-db-from-mongodb-atlas-cloud-backup/15409)  
60. "Principles of Building AI Agents" is a worth a Read \- DEV Community, 7月 31, 2025にアクセス、 [https://dev.to/0xkoji/principles-of-building-ai-agents-is-a-worth-a-read-482h](https://dev.to/0xkoji/principles-of-building-ai-agents-is-a-worth-a-read-482h)  
61. Example: Hierarchical Multi-Agent System \- Mastra, 7月 31, 2025にアクセス、 [https://mastra.ai/examples/agents/hierarchical-multi-agent](https://mastra.ai/examples/agents/hierarchical-multi-agent)  
62. Agentic AI: Single vs Multi-Agent Systems | Towards Data Science, 7月 31, 2025にアクセス、 [https://towardsdatascience.com/agentic-ai-single-vs-multi-agent-systems/](https://towardsdatascience.com/agentic-ai-single-vs-multi-agent-systems/)