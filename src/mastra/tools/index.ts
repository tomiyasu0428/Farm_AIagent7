// 農業用ツールの統合エクスポート

// 天気情報ツール
export { getExternalWeatherTool } from "./weather-tool";

// 圃場情報ツール
export { getFieldInfoTool } from "./field-info-tool";

// 日々の記録ツール
export { recordDailyWorkTool, getDailyRecordsTool } from "./daily-record-tool";

// ツール定義の型
export type ToolConfig = {
  id: string;
  description: string;
  agent: "read" | "write" | "supervisor";
};