// utils/offerHelper.js

/**
 * Attaches effective offer (product or category) to products
 * and calculates final price
 */
export const attachOffersToProducts = (products) => {
    if (!Array.isArray(products) || products.length === 0) {
        return products || [];
    }

    return products.map((product) => {
        let finalPrice = Number(product.salePrice) || Number(product.regularPrice) || 0;
        let discountPercent = 0;

        // 1. Product level offer has higher priority
        if (product.productOffer && product.productOffer > 0) {
            discountPercent = product.productOffer;
        } 
        // 2. Category level offer (only if better or no product offer)
        else if (product.category?.categoryOffer?.discount && 
                 product.category.categoryOffer.discount > 0) {
            
            discountPercent = product.category.categoryOffer.discount;
        }

        // Calculate final price
        if (discountPercent > 0) {
            finalPrice = Math.round(product.salePrice * (1 - discountPercent / 100));
        }

        return {
            ...product,
            finalPrice,
            discountPercent: Math.round(discountPercent),
            // Keep original data for safety
            originalSalePrice: product.salePrice,
            categoryOffer: product.category?.categoryOffer || null
        };
    });
};