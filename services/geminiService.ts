import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import type { ProductConcept, ListingCopy, DesignStyle, ProductType } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const withRetry = async <T>(apiCall: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> => {
    let retries = 0;
    let delay = initialDelay;

    while (true) {
        try {
            return await apiCall();
        } catch (error: any) {
            // Handle various error structures from the SDK or raw API response
            const status = error.status || error.response?.status || error.error?.code;
            const message = error.message || error.error?.message || JSON.stringify(error);
            const errorMessage = String(message).toLowerCase();
            
            // Retry on rate limits (429), quotas, and server errors (500, 503)
            const isRetryable = 
                errorMessage.includes('429') || 
                errorMessage.includes('resource_exhausted') || 
                errorMessage.includes('quota') ||
                errorMessage.includes('internal') || 
                errorMessage.includes('overloaded') ||
                errorMessage.includes('server error') ||
                status === 500 ||
                status === 503;
            
            if (isRetryable && retries < maxRetries) {
                retries++;
                console.warn(`API Error (${status}: ${message}). Retrying in ${delay / 1000}s... (Attempt ${retries}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
            } else {
                 if (isRetryable) {
                     throw new Error(`The AI service is temporarily busy (Error ${status}). Please try again shortly.`);
                 }
                // Not a retryable error, or max retries reached
                throw error;
            }
        }
    }
};

const holidayGoldBlueprint = `
**Core Trends:**
1.  **Coziness & Comfort:** Warm, soft, comfortable is paramount.
2.  **Personalization:** The #1 driver. Customize with names, dates, photos.
3.  **Niche-Specific:** Reflect the recipient's identity (e.g., "Dog Mom," "Book Lover").
4.  **Retro & Nostalgia:** 70s, 80s, and 90s designs are popular.
5.  **Humor & Sarcasm:** Relatable, funny takes on holiday stress and cheer sell well.

**Top 10 High-Performing Products:**
1.  **Sweatshirts (Crewneck) & Hoodies:** King of cozy. Target 18-35. Earthy/muted colors (Sage, Sand) and classic holiday colors. Designs: Minimalist text, retro fonts, niche phrases.
2.  **Ceramic Mugs (11oz & 15oz):** Perfect affordable gift. Broad appeal (25-55). Designs: Sarcastic humor, personalization (names, photos), wraparound patterns.
3.  **Ornaments (Ceramic, Metal, Wood):** Collectible & sentimental. Personalization is key. Designs: Major life events ("Our First Home"), photo-based, pet themes.
4.  **T-Shirts:** Evergreen. Good for layering/warmer climates. Designs: Funny graphics, matching family sets, pop culture parodies.
5.  **Blankets (Sherpa Fleece):** Ultimate cozy, high-value gift. Designs: Photo collages, personalized text, large-scale art.
6.  **Tote Bags:** Eco-friendly & practical. Good for niche designs. Natural/beige colors. Designs: Bookish themes, simple chic illustrations, humor.
7.  **Pillows & Pillow Covers:** Festive home decor. Farmhouse style, personalized family names, classic phrases.
8.  **Wrapping Paper:** Unique and special. Trend: Photo face mash (hilarious).
9.  **Socks:** Classic stocking stuffer. Designs: Face mash, hobby-themed, funny text on the bottom.
10. **Phone Cases:** Seasonal accessory. Designs: Aesthetic winter scenes, subtle patterns, personalization.
`;

const alchemistSystemInstruction = `You are the 'Creative Alchemist,' an expert AI blending artistic mastery, market strategy, and copywriting genius. Your entire knowledge base comes from a top-secret print-on-demand strategy guide called the 'Holiday Gold Blueprint.' You are forbidden from using any outside knowledge. Your sole purpose is to synthesize the blueprint's principles into unique, commercially-proven product concepts that will be bestsellers on Etsy. You do not generate generic ideas. Your responses must always be in JSON format. The current year is 2025. Ensure any generated content with dates reflects this.

Here is the 'Holiday Gold Blueprint' you must adhere to:
${holidayGoldBlueprint}
`;

export const generateIdeationPackage = async (holiday: string, style: DesignStyle, productType: ProductType): Promise<ProductConcept[]> => {
    try {
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Based on the 'Holiday Gold Blueprint', generate 3 distinct product concept variations for a **${productType}**. The theme is **${holiday}** with a **${style}** aesthetic. Each variation must include:
- 'conceptTitle': A descriptive name for the concept.
- 'displayText': A short, commercially appealing, and creative phrase or quote that will be the central text of the design. **Crucially, this text MUST be a marketable slogan, NOT a literal description of the design style or theme.** For example, for a 'Geometric Modern' style Christmas design, instead of generating 'Geometric Cheer,' generate a creative holiday phrase like 'Pixelated Pines' or a classic quote like 'Oh So Merry.' The text should be clever, suitable for the design, and appealing to Etsy shoppers.
- 'fusion': An array of 2-3 keywords that describe the concept's fusion of styles.
- 'vision': A one-sentence creative vision for the design.
- 'whyItWorks': A brief explanation of why this concept will sell well, based on the blueprint.`,
            config: {
                systemInstruction: alchemistSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            conceptTitle: { type: Type.STRING },
                            displayText: { type: Type.STRING, description: "The concise text/quote to be rendered on the design." },
                            fusion: { type: Type.ARRAY, items: { type: Type.STRING } },
                            vision: { type: Type.STRING },
                            whyItWorks: { type: Type.STRING },
                        },
                        required: ["conceptTitle", "displayText", "fusion", "vision", "whyItWorks"],
                    },
                },
            },
        }));
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as ProductConcept[];
    } catch (error) {
        console.error("Error generating ideation package:", error);
        throw error;
    }
};

const stylePrompts: Record<DesignStyle, string> = {
    'Minimalist Vector': "Create a sophisticated, single-color vector graphic. The design must be clean, modern, and immediately legible from a distance. Emphasize elegant, crisp line work, impactful silhouettes, and masterful use of negative space. Typography is key: use a high-end, minimalist sans-serif font (like Helvetica Neue, Futura, or a similar aesthetic) that is perfectly integrated as a core design element. The final asset should feel like it belongs in a modern art gallery. Strictly monochrome on a transparent background.",
    'Geometric Modern': "Construct a bold, abstract design using fundamental shapes (circles, triangles, squares). Create a dynamic, visually striking composition with a limited, high-contrast color palette (max 3-4 colors). The aesthetic is sharp, intentional, and influenced by Bauhaus and Swiss design. Typography must be a clean, geometric sans-serif (e.g., Avant-Garde, Century Gothic), treated as a structural element within the composition.",
    'Retro Script': "Channel a 1970s retro vibe with a modern twist. The centerpiece is a bold, flowing script font with exaggerated swashes and a thick, confident weight. Think funky, groovy, and highly stylized. Use a classic 70s color palette: burnt orange, avocado green, mustard yellow, and cream. The design can have a slightly distressed, screen-printed texture to feel authentic. Incorporate subtle supporting elements like sparkles, stars, or soft stripes that enhance the typography without cluttering it. The mood is playful, nostalgic, and confident.",
    'Vintage Engraving': "Emulate a classic, hand-carved woodcut or steel engraving style. The design must be monochrome (black on a transparent background). Use intricate, high-detail linework, cross-hatching, and stippling to create a sense of texture, depth, and craftsmanship. The final asset should look like a lost illustration from a 19th-century book or a classic artisanal logo. Typography must be a timeless serif font with character, like Garamond or a Caslon-style face.",
    'Watercolor Botanical': "Create a soft, organic design featuring delicate, hand-painted watercolor illustrations of flowers, leaves, or other natural elements. Colors should be translucent, with soft edges and beautiful blending, as if painted on cotton paper. The composition should feel airy and natural. Typography must be an elegant, light script or a refined serif font that complements the artistic, hand-painted aesthetic.",
    'Cosmic Doodle': "A whimsical, imaginative hand-drawn style that looks like it came from a professional artist's sketchbook. Think intricate, charming doodles of stars, planets, moons, and constellations with a playful, friendly feel. Use a consistent, clean line weight. The typography should be a unique, quirky, handwritten font that is perfectly integrated into the celestial doodles. The style is creative, dreamy, and full of wonder.",
    'Art Deco': "An elegant, glamorous, and symmetrical design inspired by the roaring 1920s. Use strong, sharp geometric lines, sunburst patterns, and a sense of luxury and order. The color palette should be bold and high-contrast, incorporating metallic gold or silver accents. The typography is CRITICAL: it must be a distinctive Art Deco-style font—tall, geometric, highly stylized, and perfectly centered to create a commanding presence (e.g., Poiret One, Mostra Nuova).",
    'Cyberpunk Glitch': "A futuristic, high-tech design with a deliberate glitch art aesthetic. Use a vibrant neon color palette (electric pinks, blues, purples) against a dark core. Incorporate digital distortion effects like scan lines, pixelation, chromatic aberration, and displaced elements. The typography should be a blocky, digital, or futuristic font that has a complementary glitch effect applied to it. The vibe is edgy, modern, and energetic."
};

export const generateDesign = async (concept: ProductConcept, style: DesignStyle): Promise<string> => {
    try {
        const styleInstruction = stylePrompts[style] || stylePrompts['Minimalist Vector'];
        const quote = concept.displayText;

        const prompt = `**Primary Directive: Create a TRANSPARENT PNG of an ISOLATED graphic.**
- **Output MUST BE a graphic element on a transparent background.**
- **ABSOLUTELY NO MOCKUPS.** Do not show the design on a t-shirt, mug, or any other product.
- **NO BACKGROUNDS.** No colors, textures, or scenes in the background.

**Your Role:** A world-class graphic designer specializing in viral print-on-demand products.

**Task:** Create a design for the following concept.

**Design Details:**
- **Text to Render:** "${quote}"
- **Creative Vision:** ${concept.vision}
- **Art Style:** ${style}
- **Style Deep Dive:** ${styleInstruction}

**Execution Rules:**
1.  **Render ONLY the "Text to Render":** The text "${quote}" must be rendered exactly, with no spelling errors. Do not add any other words or text from this prompt. The typography should be the star of the design, perfectly matching the Art Style.
2.  **Compelling Composition:** The layout must be balanced, eye-catching, and work well for the specified product type.
3.  **Commercial Quality:** The final output must be a professional, high-resolution graphic ready for printing.
4.  **No Prompt Leakage:** Do not include any of these instructional labels (like "Text to Render") in the final image itself.`;
        
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        }));

        if (response.candidates && response.candidates.length > 0 && response.candidates[0].content.parts) {
            const imagePart = response.candidates[0].content.parts.find(part => part.inlineData);
            if (imagePart && imagePart.inlineData) {
                const base64ImageBytes = imagePart.inlineData.data;
                return `data:image/png;base64,${base64ImageBytes}`;
            }
        }
        throw new Error("No image was generated.");

    } catch (error) {
        console.error("Error generating design:", error);
        throw error;
    }
};

const generateListingCopy = async (concept: ProductConcept): Promise<ListingCopy> => {
     try {
        const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: `Generate a complete, SEO-optimized Etsy listing for the product concept: ${concept.conceptTitle}. The design aesthetic is ${concept.fusion.join(', ')}.

Follow these strict requirements based on the 'Holiday Gold' blueprint:
1. **Title:** Create a single, long-tail, keyword-rich title. It MUST be 140 characters or less.
2. **Description:** Write a compelling, SEO-optimized description that tells a story about the product line, its unique appeal, and its target audience.
3. **Variations:** Suggest 2-3 relevant product variations (e.g., color, size) appropriate for the product type based on the blueprint.
4. **Tags:** Provide exactly 13 unique, highly relevant Etsy tags. Each individual tag MUST be 20 characters or less.`,
            config: {
                systemInstruction: alchemistSystemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { 
                            type: Type.STRING,
                            description: "A keyword-rich Etsy title, 140 characters or less."
                        },
                        description: { 
                            type: Type.STRING,
                            description: "An SEO-optimized product description for an Etsy listing."
                        },
                        variations: { 
                            type: Type.ARRAY, 
                            items: { type: Type.STRING },
                            description: "A list of 2-3 product variation suggestions."
                        },
                        tags: { 
                            type: Type.ARRAY, 
                            items: { type: Type.STRING },
                            description: "An array of exactly 13 Etsy tags, each 20 characters or less."
                        },
                    },
                    required: ["title", "description", "variations", "tags"],
                },
            },
        }));
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as ListingCopy;
    } catch (error) {
        console.error("Error generating listing copy:", error);
        throw error;
    }
};

const base64ToPart = (base64DataUrl: string) => {
    const [header, data] = base64DataUrl.split(',');
    if (!header || !data) {
        throw new Error("Invalid base64 data URL format.");
    }
    const mimeType = header.match(/:(.*?);/)?.[1] ?? 'image/png';
    return {
        inlineData: {
            mimeType,
            data,
        }
    };
};

const getMockupPrompts = (productType: ProductType, concept: ProductConcept, holiday: string): string[] => {
    const modelQualityRule = "Model Quality Rule: The image must be photorealistic. If a person is visible, they must be in-focus with a natural, realistic pose and a clearly visible face. ABSOLUTELY NO headless or faceless/blurred-face models.";

    const basePrompts = [
        // 1. Hero Shot (White/Light Neutral)
        `A professional studio hero mockup of a White (or very light neutral) ${productType} featuring the design. Minimalist, neutral background. Perfect for an Etsy thumbnail.`,
        
        // 2. Lifestyle (Sand/Beige)
        `An aesthetic lifestyle mockup of a Sand or Beige ${productType} with the design. Warm, cozy lighting.`,

        // 3. Studio (Black)
        `A high-contrast studio mockup of a Black ${productType} with the design. Light background to make the product pop.`,

        // 4. Studio (Navy)
        `A professional mockup of a Navy Blue ${productType} showing the design. Clean setting.`,

        // 5. Lifestyle (Heather Grey)
        `A cozy, authentic lifestyle shot of a Dark Heather Grey ${productType} with the design. Candid and artistic composition.`,

        // 6. Studio (Forest Green)
        `A studio shot of a Forest Green ${productType} featuring the design. Neutral background.`,

        // 7. Studio (Maroon)
        `A studio shot of a Maroon ${productType} featuring the design. Neutral background.`,

        // 8. Studio (Light Pink)
        `A studio shot of a Light Pink ${productType} featuring the design. Soft lighting.`,

        // 9. Detail Shot
        `A close-up detail shot of the ${productType} highlighting the texture and print quality of the design.`,

        // 10. Flatlay
        `A creative flatlay of the ${productType} (in a neutral color) with the design, arranged with simple props related to ${holiday} or ${concept.fusion.join(', ')}.`,

        // 11. Contextual Holiday
        `A lifestyle photo showing the ${productType} with the design in a clear ${holiday} setting (e.g. near decorations, trees, or seasonal elements).`,
        
        // 12. Angled/Folded
        `A mockup of the ${productType} with the design, shown from an angle or folded to display the form.`
    ];
    return basePrompts.map(prompt => `${prompt} ${modelQualityRule}`);
};

export const generateFinalAssets = async (
    designUrl: string,
    concept: ProductConcept,
    holiday: string,
    productType: ProductType,
    onProgress?: (progress: number, total: number) => void
): Promise<{ mockups: string[], listingCopy: ListingCopy }> => {
    try {
        // Prepare prompts to calculate total steps
        const scenePrompts = getMockupPrompts(productType, concept, holiday);
        const totalSteps = scenePrompts.length + 1; // Mockups + 1 Listing Copy step

        // Generate Listing Copy first
        onProgress?.(0, totalSteps); 
        const listingCopy = await generateListingCopy(concept);
        onProgress?.(1, totalSteps);

        // Prepare for mockups
        const designPart = base64ToPart(designUrl);
        
        const mockupUrls: string[] = [];
        const total = scenePrompts.length;
        
        for (let i = 0; i < total; i++) {
            const prompt = scenePrompts[i];
            
            onProgress?.(i + 2, totalSteps); // Progress is now at 2+ (Listing copy done, starting mockups)
            
            const response: GenerateContentResponse = await withRetry(() => ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [designPart, { text: prompt }] },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            }));

            if (response.candidates && response.candidates.length > 0 && response.candidates[0].content.parts) {
                const imagePart = response.candidates[0].content.parts.find(part => part.inlineData);
                if (imagePart && imagePart.inlineData) {
                    const base64ImageBytes = imagePart.inlineData.data;
                    mockupUrls.push(`data:image/jpeg;base64,${base64ImageBytes}`);
                }
            }

            // Add a small delay between mockup generations to avoid hitting API rate limits.
            if (i < total - 1) { 
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        if (mockupUrls.length === 0) throw new Error("No mockups were generated.");
        
        return { mockups: mockupUrls, listingCopy };
    } catch (error) {
        console.error("Error generating final assets:", error);
        throw error;
    }
};