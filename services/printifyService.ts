
import type { ProductType, PrintifyShop, PrintifyImageUploadResponse, PrintifyProductResponse, ListingCopy } from '../types';

const BASE_URL = 'https://api.printify.com/v1';

// Map App Product Types to specific Printify Blueprints and Providers
// These are common defaults (e.g., Monster Digital for apparel, District Photo for mugs)
const PRODUCT_MAP: Record<ProductType, { blueprint_id: number; print_provider_id: number; variants: number[]; placement: string }> = {
    'T-Shirt': { 
        blueprint_id: 12, // Bella+Canvas 3001
        print_provider_id: 29, // Monster Digital
        variants: [45174, 45175, 45176], // S, M, L (example IDs)
        placement: "front"
    },
    'Hoodie': { 
        blueprint_id: 77, // Gildan 18500
        print_provider_id: 29, // Monster Digital
        variants: [45426, 45427, 45428], // S, M, L
        placement: "front"
    },
    'Sweatshirt': { 
        blueprint_id: 53, // Gildan 18000
        print_provider_id: 29,
        variants: [45300, 45301, 45302],
        placement: "front"
    },
    'Mug': { 
        blueprint_id: 68, // 11oz Ceramic Mug
        print_provider_id: 23, // District Photo
        variants: [46317],
        placement: "front" // Wraparound often requires specific dimensions, sticking to front for safety
    },
    'Tote Bag': { 
        blueprint_id: 485, // AOP Tote
        print_provider_id: 3, // Spoke
        variants: [58503],
        placement: "front"
    },
    'Pillow': { 
        blueprint_id: 58, // Spun Polyester Square Pillow
        print_provider_id: 3,
        variants: [45364],
        placement: "front"
    },
    'Ornament': {
        blueprint_id: 847, // Ceramic Ornament
        print_provider_id: 66,
        variants: [96973],
        placement: "front"
    }
};

const getHeaders = (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
});

/**
 * 1. Get the user's first shop ID
 */
export const getPrintifyShop = async (token: string): Promise<PrintifyShop> => {
    const response = await fetch(`${BASE_URL}/shops.json`, {
        method: 'GET',
        headers: getHeaders(token),
    });

    if (!response.ok) throw new Error('Failed to fetch Printify shops. Check your API Token.');
    
    const shops = await response.json();
    if (shops.length === 0) throw new Error('No Printify shops found for this account.');
    
    return { id: shops[0].id, title: shops[0].title };
};

/**
 * 2. Upload the Base64 image to Printify Media Library
 */
export const uploadImageToPrintify = async (token: string, base64Image: string, fileName: string): Promise<string> => {
    // Strip the prefix (data:image/png;base64,)
    const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");

    const response = await fetch(`${BASE_URL}/uploads/images.json`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            file_name: fileName,
            contents: cleanBase64,
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Image upload failed: ${JSON.stringify(error)}`);
    }

    const data: PrintifyImageUploadResponse = await response.json();
    return data.id;
};

/**
 * 3. Create the Product
 */
export const createPrintifyProduct = async (
    token: string,
    shopId: string,
    productType: ProductType,
    imageId: string,
    listingCopy: ListingCopy
): Promise<PrintifyProductResponse> => {
    const mapping = PRODUCT_MAP[productType];
    if (!mapping) throw new Error(`Printify mapping not found for ${productType}`);

    const payload = {
        title: listingCopy.title,
        description: listingCopy.description,
        blueprint_id: mapping.blueprint_id,
        print_provider_id: mapping.print_provider_id,
        variants: mapping.variants.map(id => ({ id, price: 2500, is_enabled: true })), // Default price 2500 cents ($25.00)
        print_areas: [
            {
                variant_ids: mapping.variants,
                placeholders: [
                    {
                        position: mapping.placement,
                        images: [
                            {
                                id: imageId,
                                x: 0.5, // Center X
                                y: 0.5, // Center Y
                                scale: 0.8, // 80% scale
                                angle: 0,
                            },
                        ],
                    },
                ],
            },
        ],
        tags: listingCopy.tags,
    };

    const response = await fetch(`${BASE_URL}/shops/${shopId}/products.json`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Product creation failed: ${JSON.stringify(error)}`);
    }

    return await response.json();
};
