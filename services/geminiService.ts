
import { GoogleGenAI, Type } from "@google/genai";

// Always use process.env.API_KEY directly for initialization.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSmartMatchingInsights = async (driverCount: number, orderHeatMap: any) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze logistics for ${driverCount} online drivers. Recommendations for Admin?`,
      config: {
        systemInstruction: "You are a logistics expert for an on-demand delivery platform."
      }
    });
    return response.text;
  } catch (error) {
    return "Optimize coverage in high-demand areas.";
  }
};

/**
 * Searches for places using Google Maps grounding.
 * Only supported in Gemini 2.5 series models.
 */
export const searchNearbyPlaces = async (query: string, lat: number, lng: number) => {
  try {
    const response = await ai.models.generateContent({
      // Use gemini-2.5-flash for Maps grounding as specified in the 2.5 series requirement.
      model: "gemini-2.5-flash",
      contents: query,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      },
    });

    return {
      text: response.text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Google Maps Grounding error:", error);
    return { text: "Não foi possível buscar locais no momento.", groundingChunks: [] };
  }
};
