import { mastra } from "./mastra";

async function main() {
  console.log("🌾 Agricultural AI Agent Starting...");
  
  try {
    // Test direct agent access
    console.log("🔍 Testing direct agent usage...");
    
    const { supervisorAgent, readAgent, writeAgent } = await import("./mastra/agents/supervisor-agent");
    console.log("🔍 Direct import test - supervisorAgent:", !!supervisorAgent);
    
    // Test agent generate method
    if (supervisorAgent) {
      console.log("🔍 Testing agent generate method...");
      // This would require OPENAI_API_KEY to actually work
      console.log("✅ Agent methods available:", typeof supervisorAgent.generate);
    }
    
    console.log("✅ Mastra initialized successfully");
    console.log("🚀 Agricultural AI Agent is ready!");
  } catch (error) {
    console.error("❌ Failed to start Agricultural AI Agent:", error);
    process.exit(1);
  }
}

// Run main function if this file is executed directly
main();