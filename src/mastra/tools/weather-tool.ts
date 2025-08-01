import { createTool } from "@mastra/core";
import { z } from "zod";

/**
 * 天気に基づく農作業推奨事項を生成
 */
function generateWeatherRecommendation(weather: string, isToday: boolean): string {
  const recommendations = {
    "晴れ": isToday ? "散布作業に適した天候です" : "農作業に最適な天候が予想されます",
    "曇り": isToday ? "穏やかな作業日和です" : "安定した天候で作業しやすいでしょう", 
    "雨": isToday ? "屋外作業は避けてください" : "雨天のため屋内作業をお勧めします",
    "雪": isToday ? "雪による作業への影響にご注意ください" : "降雪の可能性があります"
  };
  return recommendations[weather] || "天候を注意深く観察してください";
}

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
        
        // より現実的な地域別温度範囲
        const baseTemp = location.includes('北海道') ? 10 : 20;
        const weather = ["晴れ", "曇り", "雨", "雪"][Math.floor(Math.random() * 4)];
        
        return {
          date: date.toISOString().split('T')[0],
          weather,
          temperature: {
            high: baseTemp + Math.floor(Math.random() * 10),
            low: baseTemp - Math.floor(Math.random() * 8),
          },
          humidity: Math.floor(Math.random() * 30) + 50, // 50-80%
          precipitation: weather === "雨" ? Math.floor(Math.random() * 15) + 5 : 0,
          windSpeed: Math.floor(Math.random() * 10) + 3,
          uvIndex: weather === "晴れ" ? Math.floor(Math.random() * 5) + 6 : Math.floor(Math.random() * 4) + 1,
          recommendation: generateWeatherRecommendation(weather, i === 0),
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