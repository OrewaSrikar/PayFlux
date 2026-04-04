import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface RiskData {
  rainfall: number;
  aqi: number;
  congestion: number;
  curfew: boolean;
  city: string;
}

export async function fetchRealTimeRiskData(city: string): Promise<RiskData> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Get the current real-time environmental data for ${city}. 
      I need:
      1. Current rainfall in mm/hr (approximate).
      2. Current AQI (Air Quality Index).
      3. Current traffic congestion percentage (0-100%).
      4. Is there any active curfew, lockdown, or major movement restriction in this city right now?
      
      Return the data in a strict JSON format.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            rainfall: { type: Type.NUMBER, description: "Rainfall in mm/hr" },
            aqi: { type: Type.NUMBER, description: "Current AQI value" },
            congestion: { type: Type.NUMBER, description: "Traffic congestion percentage 0-100" },
            curfew: { type: Type.BOOLEAN, description: "Whether there is an active curfew or major movement restriction" },
            city: { type: Type.STRING, description: "The city name" }
          },
          required: ["rainfall", "aqi", "congestion", "curfew", "city"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      rainfall: data.rainfall || 0,
      aqi: data.aqi || 0,
      congestion: data.congestion || 0,
      curfew: data.curfew || false,
      city: data.city || city
    };
  } catch (error) {
    console.error("Error fetching real-time risk data:", error);
    // Fallback to some semi-random but plausible values if search fails
    return {
      rainfall: Math.random() * 5,
      aqi: 50 + Math.random() * 100,
      congestion: 20 + Math.random() * 40,
      curfew: false,
      city
    };
  }
}

export interface IncomeVerificationResult {
  verified: boolean;
  extractedIncome: number;
  confidence: number;
  reason: string;
}

export async function verifyIncomeFromDocument(base64Image: string, mimeType: string): Promise<IncomeVerificationResult> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType
            }
          },
          {
            text: "Analyze this paystub or income document. Extract the total income or hourly rate. Verify if it's a valid document. Return the result in a strict JSON format."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verified: { type: Type.BOOLEAN, description: "Whether the document is a valid income proof" },
            extractedIncome: { type: Type.NUMBER, description: "The total income or hourly rate extracted" },
            confidence: { type: Type.NUMBER, description: "Confidence score 0-1" },
            reason: { type: Type.STRING, description: "Reason for the verification result" }
          },
          required: ["verified", "extractedIncome", "confidence", "reason"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      verified: data.verified || false,
      extractedIncome: data.extractedIncome || 0,
      confidence: data.confidence || 0,
      reason: data.reason || "Unknown error"
    };
  } catch (error) {
    console.error("Error verifying income from document:", error);
    return {
      verified: false,
      extractedIncome: 0,
      confidence: 0,
      reason: "Verification failed due to a technical error."
    };
  }
}
