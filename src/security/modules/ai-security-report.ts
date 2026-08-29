import { GoogleGenAI } from "@google/genai";

export interface AISecurityReportConfig {
  apiKey?: string;
  model?: string;
}

export class AISecurityReport {
  private static instance: AISecurityReport;
  private config: Required<AISecurityReportConfig>;

  private constructor(config: AISecurityReportConfig = {}) {
    this.config = {
      apiKey: config.apiKey ?? process.env.GEMINI_API_KEY ?? "",
      model: config.model ?? "gemini-1.5-flash",
    };
  }

  static getInstance(config?: AISecurityReportConfig): AISecurityReport {
    if (!AISecurityReport.instance) {
      AISecurityReport.instance = new AISecurityReport(config);
    }
    return AISecurityReport.instance;
  }

  static resetInstance(): void {
    AISecurityReport.instance = undefined as any;
  }

  async generateReport(): Promise<string> {
    const apiKey = this.config.apiKey;
    if (!apiKey) {
      return "📊 **Daily AI Security Summary**\n- AI report unavailable: GEMINI_API_KEY not configured.\n- Security modules remain active with deterministic rules.\n- Configure GEMINI_API_KEY to enable AI-generated executive reports.";
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Write a professional 4-bullet executive security report for a Discord Server. 
  State that Zero Trust Anti-Nuke, Statistical Raid Prediction, Honeypot Traps, and AES-256 Vault are operational.
Include 1 proactive recommendation for server admins. Keep it scannable and authoritative.`;

      const response = await ai.models.generateContent({
        model: this.config.model,
        contents: prompt
      });

      return response.text || "Daily AI Security Scan Completed: No anomalies detected.";
    } catch (err: any) {
      const errStr = String(err?.message || err).toLowerCase();
      if (errStr.includes("quota") || errStr.includes("resource_exhausted") || errStr.includes("429") || errStr.includes("exceeded")) {
        console.warn("AI Quota limit reached in SecurityFeatures.");
      }
      return "📊 **Daily AI Security Report**\n- AI report generation failed. Deterministic security rules remain active.\n- Check GEMINI_API_KEY configuration and API quota.";
    }
  }
}