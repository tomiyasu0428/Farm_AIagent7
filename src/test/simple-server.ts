import express from 'express';
import 'dotenv/config';

const app = express();
const port = 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Simple Test Server'
  });
});

app.post('/webhook-test', (req, res) => {
  console.log('📨 Webhook test received:', JSON.stringify(req.body, null, 2));
  
  // メッセージの詳細を表示
  if (req.body.events && req.body.events[0]) {
    const event = req.body.events[0];
    console.log('👤 User ID:', event.source?.userId);
    console.log('💬 Message:', event.message?.text);
    console.log('🔑 Reply Token:', event.replyToken);
    console.log('📅 Timestamp:', new Date(event.timestamp).toISOString());
  }
  
  res.json({ success: true, message: 'Test webhook received' });
});

app.listen(port, () => {
  console.log(`🚀 Simple test server running on port ${port}`);
  console.log(`📋 Endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   POST /webhook-test`);
});