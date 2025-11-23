import fs from 'fs/promises';

const PROMPT = "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols. The scope you need to identify should include all uppercase English letters and numbers. No other characters will appear. The returned string length should be between 4 and 6 characters. Note that the CAPTCHA has a strong anti-bot design. You should make every effort to analyze and simulate human visual perception to identify the most likely result, instead of simply using OCR to recognize all characters. The actual characters should be relatively complete and occupy a larger proportion of the image. Tiny text should not be part of the result but rather a distraction design. Output a JSON object with a property 'text' containing the identified characters.";

class VllmOcr {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
        // Default to a set of high-performing models if none provided
        this.models = config.models || [
            'google/gemini-2.0-flash-001',
            'openai/gpt-4o',
            'anthropic/claude-3.5-sonnet'
        ];
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
        this.siteUrl = config.siteUrl || 'https://github.com/leask/decaptcha';
        this.appName = config.appName || 'Decaptcha';

        if (!this.apiKey) {
            throw new Error('OpenRouter API Key is required.');
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

        // Execute all model requests in parallel
        const promises = this.models.map(model => 
            this._callOpenRouter(model, base64Image, mimeType)
                .then(result => ({ model, ...result }))
                .catch(err => ({ model, error: err.message, text: null }))
        );

        const results = await Promise.all(promises);
        const finalResult = this._vote(results);

        return {
            final_text: finalResult,
            details: results
        };
    }

    async _callOpenRouter(model, base64Image, mimeType) {
        const url = `${this.baseUrl}/chat/completions`;
        const start = Date.now();

        const payload = {
            model: model,
            messages: [
                {
                    role: "system",
                    content: PROMPT,
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Read the text in this CAPTCHA image." },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            // OpenRouter specific: allow reasoning for models that support it (like o1/gemini-thinking)
            // though for standard models it might be ignored. 
            // We'll omit 'reasoning_effort' for generic compatibility unless specific models need it.
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': this.siteUrl,
                    'X-Title': this.appName,
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API Error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const duration = Date.now() - start;

            let rawText = '';
            try {
                const content = data.choices[0].message.content;
                const parsed = JSON.parse(content);
                rawText = parsed.text;
            } catch (e) {
                throw new Error(`Failed to parse JSON response: ${e.message}`);
            }

            if (typeof rawText !== 'string') {
                throw new Error('JSON response missing "text" string field');
            }

            return {
                text: this._postProcess(rawText),
                raw: rawText,
                duration
            };

        } catch (error) {
            return {
                text: null,
                error: error.message,
                duration: Date.now() - start
            };
        }
    }

    _postProcess(text) {
        // Post-processing: toUpperCase -> remove non-A-Z0-9
        if (!text) return '';
        return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    _vote(results) {
        const counts = {};
        
        for (const result of results) {
            if (result.text) {
                counts[result.text] = (counts[result.text] || 0) + 1;
            }
        }

        // Convert to array and sort by count (descending)
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

        if (sorted.length === 0) return null;

        // Return the text with the highest votes
        return sorted[0][0];
    }
}

export default VllmOcr;