/**
 * OCR Service — Extracts text from images using Tesseract.js (runs in browser).
 * Free, no external API needed.
 *
 * Parsers for:
 *   - Aadhaar card (12-digit number extraction)
 *   - Soil Health Card (NPK + pH value extraction)
 */

import Tesseract from "tesseract.js";

/**
 * Extract all text from an image using Tesseract OCR.
 * @param imageUri - Local file URI or base64 image
 * @param language - Tesseract language code (eng, hin, tel, kan, tam)
 * @returns Extracted text string
 */
export async function extractTextFromImage(
  imageUri: string,
  language: string = "eng"
): Promise<string> {
  try {
    const result = await Tesseract.recognize(imageUri, language, {
      logger: (m) => {
        // Optional: track progress
        if (m.status === "recognizing text") {
          console.log(`OCR progress: ${Math.round((m.progress || 0) * 100)}%`);
        }
      },
    });
    return result.data.text;
  } catch (error: any) {
    console.error("OCR failed:", error.message);
    throw new Error("Could not read text from image. Please try again with a clearer photo.");
  }
}

/**
 * Parse Aadhaar number from OCR text.
 * Looks for 12-digit number pattern (XXXX XXXX XXXX).
 * @returns The 12-digit Aadhaar number or null if not found
 */
export function parseAadhaarNumber(ocrText: string): string | null {
  if (!ocrText) return null;

  // Remove newlines and normalize spaces
  const cleaned = ocrText.replace(/\n/g, " ").replace(/\s+/g, " ");

  // Pattern 1: 4-4-4 with spaces (e.g., "1234 5678 9012")
  const spaced = cleaned.match(/\b(\d{4})\s+(\d{4})\s+(\d{4})\b/);
  if (spaced) return `${spaced[1]}${spaced[2]}${spaced[3]}`;

  // Pattern 2: 12 consecutive digits
  const consecutive = cleaned.match(/\b(\d{12})\b/);
  if (consecutive) return consecutive[1];

  // Pattern 3: digits with OCR noise (O→0, l→1, etc.)
  const noisy = cleaned
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8");
  const noisyMatch = noisy.match(/\b(\d{4})\s*(\d{4})\s*(\d{4})\b/);
  if (noisyMatch) return `${noisyMatch[1]}${noisyMatch[2]}${noisyMatch[3]}`;

  return null;
}

/**
 * Parse Soil Health Card values from OCR text.
 * Extracts: pH, Nitrogen (N), Phosphorus (P), Potassium (K),
 * Sulphur (S), Iron (Fe), Boron (B), Organic Carbon (OC).
 * @returns Object with parsed values (null for unparsed fields)
 */
export function parseSoilHealthCard(ocrText: string): {
  ph: string | null;
  nitrogen: string | null;
  phosphorus: string | null;
  potassium: string | null;
  sulphur: string | null;
  iron: string | null;
  boron: string | null;
  organicCarbon: string | null;
} {
  const result = {
    ph: null as string | null,
    nitrogen: null as string | null,
    phosphorus: null as string | null,
    potassium: null as string | null,
    sulphur: null as string | null,
    iron: null as string | null,
    boron: null as string | null,
    organicCarbon: null as string | null,
  };

  if (!ocrText) return result;

  const text = ocrText.replace(/\n/g, " ").replace(/\s+/g, " ");

  // Helper: find a number after a keyword
  const findValue = (patterns: string[]): string | null => {
    for (const pattern of patterns) {
      const regex = new RegExp(pattern + "\\s*[:\\-=]?\\s*([\\d.]+)", "i");
      const match = text.match(regex);
      if (match) return match[1];
    }
    return null;
  };

  result.ph = findValue(["pH", "ph", "P\\.H", "acidity"]);
  result.nitrogen = findValue(["Nitrogen", "N\\b", "N2", "Available N"]);
  result.phosphorus = findValue(["Phosphorus", "P\\b", "P2O5", "Available P"]);
  result.potassium = findValue(["Potassium", "K\\b", "K2O", "Available K"]);
  result.sulphur = findValue(["Sulphur", "Sulfur", "S\\b", "Available S"]);
  result.iron = findValue(["Iron", "Fe\\b", "Available Fe"]);
  result.boron = findValue(["Boron", "B\\b", "Available B"]);
  result.organicCarbon = findValue(["Organic Carbon", "OC\\b", "Org\\. C", "Carbon"]);

  return result;
}
