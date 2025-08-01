import express from 'express';
import 'dotenv/config';
import { Client } from '@line/bot-sdk';
import { AppConfig } from '../config';

const app = express();
const port = 3000;

// LINE Client初期化
const lineConfig = AppConfig.getLineConfig();
const client = new Client({
  channelAccessToken: lineConfig.accessToken,
  channelSecret: lineConfig.channelSecret,
});

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Agri-Partner Server'
  });
});

app.post('/webhook-test', async (req, res) => {
  console.log('\n' + '='.repeat(50));
  console.log('🌾 Agri-Partner Webhook Called');
  console.log('='.repeat(50));
  
  try {
    if (req.body.events && req.body.events[0]) {
      const event = req.body.events[0];
      
      console.log('👤 User ID:', event.source?.userId);
      console.log('💬 Message:', event.message?.text);
      console.log('🔑 Reply Token:', event.replyToken);
      console.log('📅 Timestamp:', new Date(event.timestamp).toISOString());
      
      // メッセージイベントの場合
      if (event.type === 'message' && event.message?.type === 'text') {
        console.log('\n🤖 Processing with Mastra Agent...');
        
        try {
          // SupervisorAgentを呼び出し
          const { supervisorAgent } = await import('../mastra/agents/supervisor-agent');
          
          const userMessage = event.message.text;
          const userId = event.source.userId;
          
          const agentInput = `ユーザーからのメッセージ: "${userMessage}"
          
ユーザー情報:
- ID: ${userId}
- 名前: Unknown
- 農場ID: None

このメッセージに対して適切に応答してください。農作業の記録、質問、圃場情報の確認など、ユーザーの意図を理解して対応してください。`;

          console.log('📤 Mastra Input:', userMessage);
          
          const startTime = Date.now();
          const agentResponse = await supervisorAgent.generate(agentInput);
          const processingTime = Date.now() - startTime;
          
          console.log(`✅ Mastra Response (${processingTime}ms):`, typeof agentResponse === 'string' ? agentResponse : JSON.stringify(agentResponse));
          
          // レスポンスをフォーマット
          let replyMessage = '';
          if (typeof agentResponse === 'string') {
            replyMessage = agentResponse;
          } else if (agentResponse && agentResponse.text) {
            replyMessage = agentResponse.text;
          } else if (agentResponse && agentResponse.output) {
            replyMessage = agentResponse.output;
          } else if (agentResponse && agentResponse.steps && agentResponse.steps[0]) {
            replyMessage = agentResponse.steps[0].text;
          } else {
            replyMessage = '申し訳ございません。回答を生成できませんでした。';
          }
          
          // メッセージ長制限（LINEは5000文字まで）
          if (replyMessage.length > 4900) {
            replyMessage = replyMessage.substring(0, 4900) + '...';
          }
          
          // LINEに返信
          if (event.replyToken) {
            console.log('📱 Sending LINE Reply...');
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: replyMessage
            });
            console.log('✅ LINE Reply Sent Successfully');
          }
          
        } catch (agentError) {
          console.log('❌ Mastra Agent Error:', agentError);
          
          // エラー時の応答
          if (event.replyToken) {
            await client.replyMessage(event.replyToken, {
              type: 'text',
              text: '申し訳ございません。現在システムの処理中にエラーが発生しました。しばらく経ってから再度お試しください。'
            });
          }
        }
      }
      
      // フォローイベントの場合
      else if (event.type === 'follow') {
        console.log('👋 New follower!');
        
        if (event.replyToken) {
          const welcomeMessage = `🌾 農業AIエージェント「Agri-Partner」へようこそ！

私はあなたの農場に特化したAIパートナーです。

📝 できること：
• 日々の作業記録
• 過去の記録検索  
• 圃場情報管理
• 天気情報取得
• 個別化されたアドバイス

何でもお気軽にお話しください！`;

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: welcomeMessage
          });
          
          console.log('✅ Welcome message sent');
        }
      }
    }
    
    console.log('='.repeat(50));
    res.json({ success: true, message: 'Agri-Partner processed' });
    
  } catch (error) {
    console.log('❌ Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, () => {
  console.log('🌾🤖 Agri-Partner Server Started!');
  console.log(`🚀 Running on port ${port}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   POST /webhook-test`);
  console.log('');
  console.log('🔧 Configuration:');
  console.log(`   Google API Key: ${process.env.GOOGLE_API_KEY ? 'Set ✅' : 'Not set ❌'}`);
  console.log(`   MongoDB URI: ${process.env.MONGODB_URI ? 'Set ✅' : 'Not set ❌'}`);
  console.log(`   LINE Token: ${process.env.LINE_CHANNEL_ACCESS_TOKEN ? 'Set ✅' : 'Not set ❌'}`);
  console.log('');
  console.log('📱 Ready for LINE messages!');
});