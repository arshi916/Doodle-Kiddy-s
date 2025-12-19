const Product = require("../../models/productSchema");
const Category = require("../../models/categorySchema");
const sharp = require("sharp");
const fs = require("fs");
const multer = require('multer');
const path = require('path');

const addProduct = async (req, res) => {
  try {
    console.log('Add Product Request received');
    console.log('Request body:', req.body);
    console.log('Files received:', req.files);

    const imageFiles = req.files || [];

    // Validate images
    if (imageFiles.length < 3) {
      console.log('Image validation failed - count:', imageFiles.length);
      return res.status(400).json({
        success: false,
        message: `Please upload at least 3 images. You have uploaded ${imageFiles.length} image(s).`
      });
    }

    if (imageFiles.length > 4) {
      console.log('Image validation failed - too many images:', imageFiles.length);
      return res.status(400).json({
        success: false,
        message: `Maximum 4 images allowed. You have uploaded ${imageFiles.length} images.`
      });
    }

    for (let file of imageFiles) {
      if (!file.mimetype.startsWith("image/")) {
        console.log('Invalid file type:', file.mimetype);
        return res.status(400).json({
          success: false,
          message: "Please upload valid image files only (JPG, PNG, GIF, etc.)"
        });
      }
      if (file.size > 5 * 1024 * 1024) {
        console.log('File too large:', file.size);
        return res.status(400).json({
          success: false,
          message: "Each image must be less than 5MB"
        });
      }
    }

    // Process images
    const processedImages = [];
    for (let file of imageFiles) {
      const filename = `resized-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname}`;
      const outputPath = path.join("public", "images", filename);

      const imagesDir = path.join("public", "images");
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      await sharp(file.buffer || file.path)
        .resize(300, 300, {
          fit: "cover",
          position: "center",
        })
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      processedImages.push(filename);
      console.log('Image processed:', filename);
    }

    const {
      productName,
      description,
      category,
      regularPrice,
      salePrice,
      status,
      color,
      returnPolicy,
      sizes
    } = req.body;

    console.log('Validating product data...');

    // Validate product name
    if (!productName || productName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Product name is required and must be at least 3 characters long"
      });
    }

    if (productName.trim().length > 50) {
      return res.status(400).json({
        success: false,
        message: "Product name cannot exceed 50 characters"
      });
    }

    // Validate category
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      console.log('Category not found:', category);
      return res.status(400).json({
        success: false,
        message: "Please select a valid category"
      });
    }

    // Validate colors
    const colors = Array.isArray(color) ? color : (color ? [color] : []);
    if (colors.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one color for the product"
      });
    }

    // Validate prices
    const regPrice = Number(regularPrice);
    const salePriceNum = Number(salePrice);
    if (isNaN(regPrice) || regPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "Regular price must be a valid positive number"
      });
    }

    if (isNaN(salePriceNum) || salePriceNum <= 0) {
      return res.status(400).json({
        success: false,
        message: "Sale price must be a valid positive number"
      });
    }

    if (salePriceNum >= regPrice) {
      return res.status(400).json({
        success: false,
        message: "Sale price must be less than regular price"
      });
    }

    // Validate sizes and stock
    const selectedSizes = sizes ? sizes.split(',').filter(s => s.trim()) : [];
    const validSizes = ["XS", "S", "M", "L", "XL"];
    const seenSizes = new Set();
    const stocks = [];

    if (selectedSizes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one size"
      });
    }

    colors.forEach(col => {
      validSizes.forEach(size => {
        if (selectedSizes.includes(size)) {
          const stockKey = `stock_${col.toLowerCase()}_${size}`;
          const q = Number(req.body[stockKey]) || 0;
          if (!isNaN(q) && q >= 0) {
            stocks.push({ color: col.toLowerCase(), size, quantity: q });
            seenSizes.add(size);
          }
        }
      });
    });

    const totalQty = stocks.reduce((sum, v) => sum + v.quantity, 0);
    if (totalQty === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide stock quantity for at least one color-size combination"
      });
    }

    // Validate description
    if (!description || description.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Product description is required and must be at least 10 characters long"
      });
    }

    if (description.trim().length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Product description cannot exceed 1000 characters"
      });
    }

    // Validate status
    const validStatuses = ["Available", "out of stock", "Discontinued"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid status"
      });
    }

    // Check for duplicate product name
    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') },
      isDeleted: { $ne: true }
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "A product with this name already exists. Please choose a different name."
      });
    }

    // Create product
    const product = new Product({
      productName: productName.trim(),
      description: description.trim(),
      brand: req.body.brand?.trim() || "",
      category,
      regularPrice: regPrice,
      salePrice: salePriceNum,
      quantity: totalQty,
      status,
      productImage: processedImages,
      color: colors,
      size: Array.from(seenSizes),
      stocks,
      returnPolicy: returnPolicy === "true",
      isBlocked: false,
      isDeleted: false,
    });

    const savedProduct = await product.save();
    console.log('Product saved successfully:', savedProduct._id);

    // Set success message in session
    req.session.successMessage = `Product "${productName.trim()}" has been added successfully!`;

    return res.status(200).json({
      success: true,
      message: `Product "${productName.trim()}" has been added successfully!`,
      productId: savedProduct._id
    });
  } catch (error) {
    console.error("Error adding product:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while adding the product. Please try again."
    });
  }
};
const loadProductPage = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const query = {
      isDeleted: { $ne: true },
      ...(search && { productName: { $regex: search, $options: "i" } }),
    };

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Product.find(query)
      .populate("category")
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ createdAt: -1 });
    products.forEach(p => console.log(`Fetched: ${p.productName}, Quantity: ${p.quantity}`));

    // Get and clear success message
    const successMessage = req.session.successMessage;
    if (successMessage) {
      delete req.session.successMessage;
    }

    res.render("admin/products", {
      title: "Products",
      products,
      search,
      currentPage: page,
      totalPages,
      activePage: "products",
      successMessage
    });
  } catch (error) {
    console.error("Error loading product page:", error);
    res.redirect("/admin/pageerror");
  }
};

const listProducts = async (req, res) => {
  try {
    const products = await Product.find({ isBlocked: false, isDeleted: { $ne: true } })
      .populate("category");
    res.render("admin/products", {
      title: "Products",
      products,
      activePage: "products",
    });
  } catch (error) {
    console.error("Error listing products:", error);
    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong",
    });
  }
};

const getAddProduct = async (req, res) => {
  try {
    console.log('Loading add product page...');
    
    const categories = await Category.find({ 
      isListed: true 
    }).sort({ name: 1 });
    
    console.log('Found categories:', categories.length);
    console.log('Categories data:', categories.map(cat => ({ 
      id: cat._id, 
      name: cat.name, 
      isListed: cat.isListed 
    })));
    
    res.render("admin/add-product", { 
      categories, 
      title: "Add Product" 
    });
    
    console.log('Add product page rendered successfully');
  } catch (error) {
    console.error("Error loading add product page:", error);
    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong loading the add product page",
    });
  }
};

const loadProducts = async (req, res) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } })
      .populate("category")
      .sort({ updatedAt: -1 })
      .limit(5);
    res.render("admin/products", {
      title: "Products",
      products,
      activePage: "products",
    });
  } catch (error) {
    console.error("Error loading products:", error);
    res.render("admin/products", { products: [], title: "Products" });
  }
};

const getEditProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId).populate("category");
    
    const categories = await Category.find({ 
      isListed: true 
    }).sort({ name: 1 });

    if (!product) {
      return res.render("admin/admin-error", {
        title: "Error",
        message: "Product not found",
      });
    }

    console.log('Categories for edit:', categories.length);
    console.log('Categories:', categories.map(cat => ({ id: cat._id, name: cat.name })));

    res.render("admin/edit-product", {
      product,
      categories,
      title: "Edit Product",
    });
  } catch (error) {
    console.error("Error loading edit product page:", error);
    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong",
    });
  }
};

const updateProductPost = async (req, res) => {
  try {
    const productId = req.params.id;

    console.log('=== UPDATE REQUEST ===');
    console.log('body.existingImages:', req.body.existingImages);
    console.log('files count:', req.files?.length || 0);

    const {
      productName,
      description,
      category,
      regularPrice,
      salePrice,
      status,
      color,
      returnPolicy,
      sizes
    } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // === FIXED IMAGE HANDLING ===
    let oldImages = [];
    if (req.body.existingImages) {
      try {
        oldImages = JSON.parse(req.body.existingImages);
      } catch (err) {
        return res.status(400).json({ success: false, message: "Invalid existing images data" });
      }
    }

    let newImages = [];
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        
        newImages.push(filename);
      }
    }

    const productImages = [...oldImages, ...newImages];

    if (productImages.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: `Product must have at least 3 images. Currently ${productImages.length}.` 
      });
    }

    if (productImages.length > 4) {
      return res.status(400).json({ 
        success: false, 
        message: `Maximum 4 images allowed. Currently ${productImages.length}.` 
      });
    }

    // Validate product name
    if (!productName || productName.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Product name must be at least 3 characters long" });
    }

    if (productName.trim().length > 50) {
      return res.status(400).json({ success: false, message: "Product name cannot exceed 50 characters" });
    }

    // Check for duplicate product name
    const existingProduct = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, 'i') },
      _id: { $ne: productId },
      isDeleted: { $ne: true }
    });

    if (existingProduct) {
      return res.status(400).json({ 
        success: false, 
        message: "A product with this name already exists. Please choose a different name." 
      });
    }

    // Validate category
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return res.status(400).json({ success: false, message: "Please select a valid category" });
    }

    // Validate colors
    const colors = Array.isArray(color) ? color : (color ? [color] : []);
    if (colors.length === 0) {
      return res.status(400).json({ success: false, message: "Please select at least one color" });
    }

    // Validate prices
    const regPrice = Number(regularPrice);
    const salePriceNum = Number(salePrice);
    
    if (isNaN(regPrice) || regPrice <= 0) {
      return res.status(400).json({ success: false, message: "Regular price must be a valid positive number" });
    }
    
    if (isNaN(salePriceNum) || salePriceNum <= 0) {
      return res.status(400).json({ success: false, message: "Sale price must be a valid positive number" });
    }
    
    if (salePriceNum >= regPrice) {
      return res.status(400).json({ success: false, message: "Sale price must be less than regular price" });
    }

    // Updated stock management: per color per size
    const stocks = [];
    const selectedSizes = sizes ? sizes.split(',').filter(s => s.trim()) : [];
    const validSizes = ["XS", "S", "M", "L", "XL"];
    const seenSizes = new Set();

    colors.forEach(col => {
      validSizes.forEach(size => {
        if (selectedSizes.includes(size)) {
          const stockKey = `stock_${col.toLowerCase()}_${size}`;
          const q = Number(req.body[stockKey]) || 0;
          if (!isNaN(q) && q >= 0) {
            stocks.push({ color: col.toLowerCase(), size, quantity: q });
            seenSizes.add(size);
          }
        }
      });
    });

    const totalQty = stocks.reduce((sum, v) => sum + v.quantity, 0);

    if (selectedSizes.length === 0) {
      return res.status(400).json({ success: false, message: "Please select at least one size" });
    }

    if (totalQty === 0) {
      return res.status(400).json({ success: false, message: "Please provide stock quantity for at least one color-size combination" });
    }

    // Validate description
    if (!description || description.trim().length < 10) {
      return res.status(400).json({ success: false, message: "Description must be at least 10 characters long" });
    }

    if (description.trim().length > 1000) {
      return res.status(400).json({ success: false, message: "Description cannot exceed 1000 characters" });
    }

    // Validate status
    const validStatuses = ["Available", "out of stock", "Discontinued"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Please select a valid status" });
    }

    // Update product fields
    product.productName = productName.trim();
    product.description = description.trim();
    product.category = category;
    product.regularPrice = regPrice;
    product.salePrice = salePriceNum;
    product.quantity = totalQty;
    product.status = status;
    product.productImage = productImages;
    product.color = colors;
    product.size = Array.from(seenSizes);
    product.stocks = stocks;
    product.returnPolicy = returnPolicy === "true";

    await product.save();
    console.log('Product updated successfully:', productId);

    // Set success message
    req.session.successMessage = `Product "${productName.trim()}" has been updated successfully!`;

    // Handle response
    const isAjax = req.headers['content-type']?.includes('multipart/form-data') && 
                   (req.headers['accept']?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest') ||
                   req.xhr;

    if (isAjax) {
      return res.status(200).json({
        success: true,
        message: `Product "${productName.trim()}" has been updated successfully!`
      });
    }

    res.redirect("/admin/products");
  } catch (error) {
    console.error("Product update failed:", error);

    const isAjax = req.headers['content-type']?.includes('multipart/form-data') && 
                   (req.headers['accept']?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest') ||
                   req.xhr;

    if (isAjax) {
      return res.status(400).json({
        success: false,
        message: error.message || "Something went wrong while updating the product"
      });
    }

    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong while updating the product",
    });
  }
};

const DeleteProduct = async (req, res) => {
  try {
    const { productsId } = req.body;
    if (!productsId) {
      return res.render("admin/admin-error", {
        title: "Error",
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productsId);
    if (!product) {
      return res.render("admin/admin-error", {
        title: "Error",
        message: "Product not found",
      });
    }

    await Product.findByIdAndUpdate(productsId, { isDeleted: true });
    
    req.session.successMessage = `Product "${product.productName}" has been deleted successfully!`;
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Soft delete failed:", error);
    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong while deleting the product",
    });
  }
};

const toggleBlockStatus = async (req, res) => {
  try {
    const { productsId } = req.body;
    if (!productsId) {
      return res.render("admin/admin-error", {
        title: "Error",
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productsId);
    if (!product) {
      return res.render("admin/admin-error", {
        title: "Error",
        message: "Product not found",
      });
    }

   
    const previousStatus = product.isBlocked;
    product.isBlocked = !product.isBlocked;
    await product.save();

    const statusText = product.isBlocked ? 'blocked' : 'unblocked';
    req.session.successMessage = `Product "${product.productName}" has been ${statusText} successfully!`;

    res.redirect("/admin/products");
  } catch (error) {
    console.error("Error toggling block status:", error);
    res.render("admin/admin-error", {
      title: "Error",
      message: "Something went wrong while updating the product status",
    });
  }
};

module.exports = {
  loadProductPage,
  addProduct,
  getAddProduct,
  listProducts,
  loadProducts,
  getEditProduct,
  updateProductPost,
  DeleteProduct,
  toggleBlockStatus,
};