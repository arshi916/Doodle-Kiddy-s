const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};


ensureDirectoryExists(path.join(__dirname, '../public/images'));
ensureDirectoryExists(path.join(__dirname, '../public/uploads/profiles'));
ensureDirectoryExists(path.join(__dirname, '../Uploads/temp'));


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../Uploads/temp');
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});


const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  console.log('File received:', file.fieldname, file.originalname, file.mimetype);
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};


const profileUpload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, 
  },
  fileFilter: fileFilter
}).single('profileImage');


const profileUploadMiddleware = (req, res, next) => {
  profileUpload(req, res, function (err) {
    const isAjax = req.xhr || req.headers.accept.includes('json');
    if (err instanceof multer.MulterError) {
      console.log('Multer error:', err.message);
      if (err.code === 'LIMIT_FILE_SIZE') {
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum 5MB allowed.'
          });
        }
        return res.render('admin/admin-error', {
          title: 'Error',
          message: 'File size too large. Maximum 5MB allowed.'
        });
      }
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }
      return res.render('admin/admin-error', {
        title: 'Error',
        message: 'File upload error: ' + err.message
      });
    } else if (err) {
      console.log('Upload error:', err.message);
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.render('admin/admin-error', {
        title: 'Error',
        message: err.message
      });
    }
    console.log('Profile image uploaded successfully');
    next();
  });
};


const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, 
  },
  fileFilter: fileFilter
});


const uploadMultiple = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4 
  },
  fileFilter: fileFilter
}).array('productImage', 4);


const uploadMultipleMiddleware = (req, res, next) => {
  uploadMultiple(req, res, function (err) {
    const isAjax = req.xhr || req.headers.accept.includes('json');
    if (err instanceof multer.MulterError) {
      console.log('Multer error:', err.message);
      if (err.code === 'LIMIT_FILE_COUNT') {
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 4 files allowed.'
          });
        }
        return res.render('admin/admin-error', {
          title: 'Error',
          message: 'Too many files. Maximum 4 files allowed.'
        });
      } else if (err.code === 'LIMIT_FILE_SIZE') {
        if (isAjax) {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum 5MB per file allowed.'
          });
        }
        return res.render('admin/admin-error', {
          title: 'Error',
          message: 'File size too large. Maximum 5MB per file allowed.'
        });
      }
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: 'File upload error: ' + err.message
        });
      }
      return res.render('admin/admin-error', {
        title: 'Error',
        message: 'File upload error: ' + err.message
      });
    } else if (err) {
      console.log('Upload error:', err.message);
      if (isAjax) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      return res.render('admin/admin-error', {
        title: 'Error',
        message: err.message
      });
    }
    console.log('Files uploaded successfully:', req.files ? req.files.length : 0);
    next();
  });
};


const resizeImages = (req, res, next) => {
  console.log('Resize middleware called, files:', req.files ? req.files.length : 0);
  next();
};

const resizeSingleImage = (req, res, next) => {
  console.log('Resize single image middleware called');
  next();
};

module.exports = {
  upload,
  profileUpload: profileUploadMiddleware,
  uploadMultiple: uploadMultipleMiddleware,
  resizeImages,
  resizeSingleImage
};