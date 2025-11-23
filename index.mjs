import fs from 'fs/promises';
import path from 'path';

class GeminiOCR {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY;
        this.model = config.model || 'gemini-3-pro-preview';

        if (!this.apiKey) {
            throw new Error('API Key is required. Provide it in config or set GOOGLE_API_KEY env var.');
        }
    }

    async recognize(imagePathOrBuffer) {
        let base64Image;
        let mimeType;

        if (Buffer.isBuffer(imagePathOrBuffer)) {
            base64Image = imagePathOrBuffer.toString('base64');
            mimeType = 'image/jpeg';
        } else if (typeof imagePathOrBuffer === 'string') {
            const buffer = await fs.readFile(imagePathOrBuffer);
            base64Image = buffer.toString('base64');
            mimeType = imagePathOrBuffer.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
        } else {
            throw new Error('Invalid input. Expected file path string or Buffer.');
        }

        return this._callApi(base64Image, mimeType);
    }

    async _callApi(base64Image, mimeType) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

        const payload = {
            contents: [{
                parts: [
                    { text: "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols. The scope you need to identify should include all uppercase English letters and numbers. No other characters will appear.The returned string length should be between 4 and 6 characters. Note that the CAPTCHA has a strong anti-bot design. You should make every effort to analyze and simulate human visual perception to identify the most likely result, instead of simply using OCR to recognize all characters. The actual characters should be relatively complete and occupy a larger proportion of the image. Tiny text should not be part of the result but rather a distraction design. Output a JSON object with a property 'text' containing the identified characters." },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                response_mime_type: "application/json",
                thinking_config: {
                    include_thoughts: true
                }
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        try {
            // Find the part that contains the JSON response
            const parts = data.candidates[0].content.parts;
            let rawText = '';
            
            for (const part of parts) {
                try {
                    // Try to parse each part as JSON
                    const parsed = JSON.parse(part.text);
                    if (parsed.text) {
                        rawText = parsed.text;
                        break;
                    }
                } catch (e) {
                    // Not valid JSON or not the part we want, continue
                }
            }

            if (!rawText) {
                 // Fallback: if no JSON part found, try to find first text part? 
                 // Or maybe the thoughts are one part and the JSON is another. 
                 // If we failed to find structured JSON, throw.
                 throw new Error('No valid JSON response found in candidates');
            }

            // Post-processing: toUpperCase -> remove non-A-Z0-9
            const processedText = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
            return processedText;

        } catch (e) {
            console.error('Failed to parse API response:', JSON.stringify(data, null, 2));
            throw new Error(`Failed to parse API response: ${e.message}`);
        }
    }
}

export default GeminiOCR;
