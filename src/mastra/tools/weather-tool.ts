import { createTool } from "@mastra/core";
import { z } from "zod";

/**
 * 外部天気情報取得ツール
 * ReadAgentで使用し、指定された場所の天気予報を取得する
 */
export const getExternalWeatherTool = createTool({
  id: "getExternalWeather",
  description: "指定された場所の天気予報を取得します。農作業の計画に重要な情報を提供します。",
  inputSchema: z.object({
    location: z.string().describe("天気を取得したい場所（例：北海道札幌市、十勝帯広市）"),
    days: z.number().min(1).max(7).default(3).describe("取得する日数（1-7日、デフォルト3日）"),
  }),
  outputSchema: z.object({
    location: z.string(),
    forecast: z.array(z.object({
      date: z.string(),
      weather: z.string(),
      temperature: z.object({
        high: z.number(),
        low: z.number(),
      }),
      humidity: z.number(),
      precipitation: z.number(),
      windSpeed: z.number(),
      uvIndex: z.number().optional(),
      recommendation: z.string().describe("農作業への推奨事項"),
    })),
    summary: z.string().describe("全体的な天候サマリーと農作業への影響"),
  }),
  execute: async ({ location, days }) => {
    try {
      // TODO: 実際の天気APIを統合（OpenWeatherMap, WeatherAPI等）
      // 現段階ではモックデータを返す
      const mockForecast = Array.from({ length: days }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        return {
          date: date.toISOString().split('T')[0],
          weather: ["晴れ", "曇り", "雨", "雪"][Math.floor(Math.random() * 4)],
          temperature: {
            high: Math.floor(Math.random() * 10) + 15,
            low: Math.floor(Math.random() * 10) + 5,
          },
          humidity: Math.floor(Math.random() * 40) + 40,
          precipitation: Math.floor(Math.random() * 20),
          windSpeed: Math.floor(Math.random() * 15) + 2,
          uvIndex: Math.floor(Math.random() * 10) + 1,
          recommendation: i === 0 ? "散布作業に適した天候です" : "天候を注意深く観察してください",
        };
      });

      const summary = `${location}の${days}日間の天気予報です。農作業に適した日程を検討してください。`;

      return {
        location,
        forecast: mockForecast,
        summary,
      };
    } catch (error) {
      throw new Error(`天気情報の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

export default getExternalWeatherTool;