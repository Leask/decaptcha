import fs from 'fs/promises';

const PROMPT = "You are a CAPTCHA testing engine tasked with ensuring the accuracy and security of CAPTCHA codes. Your responsibility is to identify the text within images, providing the most probable result with maximum effort. Return only the text, ensuring it is clean and contains only English letters and numbers, devoid of extra spaces or symbols. The scope you need to identify should include all uppercase English letters and numbers. No other characters will appear. The returned string length should be between 4 and 6 characters. Note that the CAPTCHA has a strong anti-bot design. You should make every effort to analyze and simulate human visual perception to identify the most likely result, instead of simply using OCR to recognize all characters. The actual characters should be relatively complete and occupy a larger proportion of the image. Tiny text should not be part of the result but rather a distraction design. You need to simulate the characteristics of how the human eye perceives images for acute analysis. Return the three most probable and distinct results, ranked by likelihood. Output a JSON object with a property 'results' array containing the identified characters results. Example: {\"results\": [\"ABCD\", \"ABCE\", \"ABCF\"]}.";

class VllmOcr {
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
        // Default to a set of high-performing models if none provided
        this.models = config.models || [
            'google/gemini-3-pro-preview',
            'openai/gpt-5.1',
            'google/gemini-3-pro-image-preview',
            'meta-llama/llama-4-maverick',
            'qwen/qwen3-vl-235b-a22b-thinking',
            'opengvlab/internvl3-78b'
        ];
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
        this.siteUrl = config.siteUrl || 'https://github.com/leask/decaptcha';
        this.appName = config.appName || 'Decaptcha';
        this.fastMode = config.fastMode || false;

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

        const controller = new AbortController();
        const signal = controller.signal;

        const results = [];
        const globalCounts = {}; // Track votes across all candidates
        let completedCount = 0;
        let resolved = false;

        return new Promise((resolve) => {
            const checkCompletion = () => {
                completedCount++;
                if (completedCount === this.models.length && !resolved) {
                    resolved = true;
                    const finalResult = this._vote(results);
                    resolve({
                        final_text: finalResult,
                        details: this._sortResultsByModelOrder(results)
                    });
                }
            };

            this.models.forEach(model => {
                this._callOpenRouter(model, base64Image, mimeType, signal)
                    .then(result => {
                        const resObj = { model, ...result };
                        results.push(resObj);

                        if (!resolved && result.candidates && result.candidates.length > 0) {
                            // Add votes from all candidates
                            for (const cand of result.candidates) {
                                if (cand) {
                                    globalCounts[cand] = (globalCounts[cand] || 0) + 1;
                                    
                                    // Consensus Reached: 2 models agree on this candidate (Fast Mode)
                                    if (this.fastMode && globalCounts[cand] >= 2) {
                                        resolved = true;
                                        controller.abort(); 
                                        resolve({
                                            final_text: cand,
                                            details: this._sortResultsByModelOrder(results)
                                        });
                                        return; 
                                    }
                                }
                            }
                        }
                        checkCompletion();
                    })
                    .catch(err => {
                        results.push({ 
                            model, 
                            error: err.name === 'AbortError' ? 'Skipped (Consensus Reached)' : err.message, 
                            candidates: [] 
                        });
                        checkCompletion();
                    });
            });
        });
    }

    _sortResultsByModelOrder(results) {
        // Sort results to match the config model order for consistent reporting
        return results.sort((a, b) => {
            return this.models.indexOf(a.model) - this.models.indexOf(b.model);
        });
    }

        async _callOpenRouter(model, base64Image, mimeType, signal) {
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
                    body: JSON.stringify(payload),
                    signal: signal // Pass the abort signal
                });
    
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API Error: ${response.status} - ${errorText}`);
                }
    
                const data = await response.json();
                const duration = Date.now() - start;
    
                let candidates = [];
                try {
                    const content = data.choices[0].message.content;
                    
                    // Robust JSON extraction
                    let jsonString = content;
                    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
                    if (codeBlockMatch) jsonString = codeBlockMatch[1];
    
                    const startIndex = jsonString.indexOf('{');
                    const endIndex = jsonString.lastIndexOf('}');
                    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                        jsonString = jsonString.substring(startIndex, endIndex + 1);
                    }
    
                    const parsed = JSON.parse(jsonString);
                    
                    // Handle 'results' array or legacy 'text' field
                    if (Array.isArray(parsed.results)) {
                        candidates = parsed.results.map(t => this._postProcess(t)).filter(t => t);
                    } else if (parsed.text) {
                        const processed = this._postProcess(parsed.text);
                        if (processed) candidates = [processed];
                    }
    
                } catch (e) {
                    throw new Error(`Failed to parse JSON response: ${e.message}. Content: ${data.choices?.[0]?.message?.content?.substring(0, 100)}...`);
                }
    
                if (candidates.length === 0) {
                    // Throw if we found nothing valid
                    throw new Error('JSON response missing "results" array or "text" field');
                }
    
                return {
                    candidates: candidates,
                    duration
                };
    
            } catch (error) {
                // If aborted, allow the caller to handle the logic or return specific object
                if (error.name === 'AbortError') {
                    throw error; // Re-throw to be caught by caller's catch block
                }
                return {
                    candidates: [],
                    error: error.message,
                    duration: Date.now() - start
                };
            }
        }    _postProcess(text) {
        // Post-processing: toUpperCase -> remove non-A-Z0-9
        if (!text) return '';
        return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

        _vote(results) {
            const counts = {};
            
            // Count votes for each candidate text
            for (const result of results) {
                if (result.candidates && result.candidates.length > 0) {
                    for (const cand of result.candidates) {
                        counts[cand] = (counts[cand] || 0) + 1;
                    }
                }
            }
    
            // Convert to array and sort by count (descending)
            const sortedCandidates = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    
            if (sortedCandidates.length === 0) return null;
    
            const maxVotes = sortedCandidates[0][1];
            
            // Find all candidates with the maximum number of votes
            const topCandidates = sortedCandidates
                .filter(candidate => candidate[1] === maxVotes)
                .map(candidate => candidate[0]);
    
            // If there's a clear winner, return it
            if (topCandidates.length === 1) {
                return topCandidates[0];
            }
    
            // Tie-breaking: Choose the result from the highest-priority model
            // Iterate through the models in order
            for (const model of this.models) {
                // Find the result produced by this model
                const modelResult = results.find(r => r.model === model);
                
                // If this model produced valid candidates, check if any of them is a top candidate
                if (modelResult && modelResult.candidates) {
                    // We iterate through the model's candidates in order (assuming priority within the array)
                    for (const cand of modelResult.candidates) {
                        if (topCandidates.includes(cand)) {
                            return cand;
                        }
                    }
                }
            }
    
            // Fallback (should rarely happen if logic is correct): return the first top candidate
            return topCandidates[0];
        }}

export default VllmOcr;
