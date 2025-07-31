import { Mastra } from "@mastra/core";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

// Import agents with debug
console.log("🔍 Loading agents...");
import { supervisorAgent } from "./agents/supervisor-agent";
console.log("✅ SupervisorAgent loaded:", !!supervisorAgent);
import { readAgent } from "./agents/read-agent";
console.log("✅ ReadAgent loaded:", !!readAgent);
import { writeAgent } from "./agents/write-agent";
console.log("✅ WriteAgent loaded:", !!writeAgent);

// Import workflows (will be implemented)
// import { blightManagementWorkflow } from "./workflows/blight-management-workflow";

console.log("🔍 Creating Mastra instance...");

const agentsConfig = {
  supervisorAgent,
  readAgent,
  writeAgent,
};

console.log("🔍 Agents config:", Object.keys(agentsConfig));

export const mastra = new Mastra({
  agents: agentsConfig,
  workflows: {
    // blightManagementWorkflow,
  },
  storage: new LibSQLStore({
    url: ":memory:", // Use in-memory DB for development
  }),
  logger: new PinoLogger({ 
    name: "AgriAgent", 
    level: "info" 
  }),
});

console.log("✅ Mastra instance created");

export default mastra;