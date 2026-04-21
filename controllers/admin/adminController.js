import User from "../../models/userSchema.js";
import Product from "../../models/productSchema.js";
import Order from "../../models/orderSchema.js";
import Category from "../../models/categorySchema.js";


function getDateRange(period, year) {
  const now = new Date();
  const y = parseInt(year) || now.getFullYear();

  if (period === "weekly") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "monthly") {
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59),
    };
  }
  if (period === "quarterly") {
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59),
    };
  }
  if (period === "yearly") {
    return {
      start: new Date(y - 4, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59),
    };
  }
  // default: current month
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  };
}

function bucketize(orders, period) {
  const now = new Date();

  if (period === "weekly") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const revenue = new Array(7).fill(0);
    const counts = new Array(7).fill(0);
    orders.forEach((o) => {
      const d = new Date(o.createdOn);
  
      const idx = (d.getDay() + 6) % 7;
      revenue[idx] += o.finalAmount || 0;
      counts[idx]++;
    });
    return { labels: days, revenue, orders: counts };
  }

  if (period === "monthly") {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    const revenue = new Array(12).fill(0);
    const counts = new Array(12).fill(0);
    orders.forEach((o) => {
      const m = new Date(o.createdOn).getMonth();
      revenue[m] += o.finalAmount || 0;
      counts[m]++;
    });
    return { labels: monthNames, revenue, orders: counts };
  }

  if (period === "yearly") {
    const endYear = now.getFullYear();
    const labels = Array.from({ length: 6 }, (_, i) =>
      String(endYear - 5 + i)
    );
    const revenue = new Array(6).fill(0);
    const counts = new Array(6).fill(0);
    orders.forEach((o) => {
      const y = new Date(o.createdOn).getFullYear();
      const idx = y - (endYear - 5);
      if (idx >= 0 && idx < 6) {
        revenue[idx] += o.finalAmount || 0;
        counts[idx]++;
      }
    });
    return { labels, revenue, orders: counts };
  }

  return { labels: [], revenue: [], orders: [] };
}


export const loadDashboard = async (req, res) => {
  try {
    const [totalUsers, totalProducts, totalOrders, revenueAgg] = await Promise.all([
      User.countDocuments({ isAdmin: false }),
      Product.countDocuments({ isDeleted: false }),
      Order.countDocuments(),
      Order.aggregate([
        { $match: { status: { $nin: ["Cancelled", "Returned"] } } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),
    ]);

    res.render("admin/admin-dashboard", {
      activePage: "dashboard",
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue: revenueAgg[0]?.total || 0,
    });
  } catch (err) {
    console.error("Dashboard load error:", err);
    res.redirect("/admin/pageerror");
  }
};


export const getChartData = async (req, res) => {
  try {
    const { period = "monthly" } = req.query;
    const validPeriods = ["weekly", "monthly", "yearly"];
    const p = validPeriods.includes(period) ? period : "monthly";

    const now = new Date();
    let matchStart;

    if (p === "weekly") {
      matchStart = new Date(now);
      matchStart.setDate(now.getDate() - 6);
      matchStart.setHours(0, 0, 0, 0);
    } else if (p === "monthly") {
      matchStart = new Date(now.getFullYear(), 0, 1);
    } else {
      matchStart = new Date(now.getFullYear() - 5, 0, 1);
    }

    const orders = await Order.find(
      { createdOn: { $gte: matchStart }, status: { $nin: ["Cancelled"] } },
      { createdOn: 1, finalAmount: 1 }
    ).lean();

    const result = bucketize(orders, p);
    res.json(result);
  } catch (err) {
    console.error("Chart data error:", err);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
};


export const getBestProducts = async (req, res) => {
  try {
    const result = await Order.aggregate([
      // Only delivered / non-cancelled orders
      { $match: { status: { $nin: ["Cancelled", "Returned"] } } },
      { $unwind: "$orderedItems" },
      {
        $match: {
          "orderedItems.status": { $nin: ["Cancelled", "Returned"] },
        },
      },
      {
        $group: {
          _id: "$orderedItems.product",
          unitsSold: { $sum: "$orderedItems.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$orderedItems.price", "$orderedItems.quantity"],
            },
          },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $lookup: {
          from: "categories",
          localField: "product.category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $project: {
          name: "$product.productName",
          category: { $ifNull: [{ $arrayElemAt: ["$category.name", 0] }, "Uncategorised"] },
          unitsSold: 1,
          revenue: 1,
        },
      },
    ]);

    res.json({ products: result });
  } catch (err) {
    console.error("Best products error:", err);
    res.status(500).json({ error: "Failed to fetch best products" });
  }
};


export const getBestCategories = async (req, res) => {
  try {
    const result = await Order.aggregate([
      { $match: { status: { $nin: ["Cancelled", "Returned"] } } },
      { $unwind: "$orderedItems" },
      {
        $match: {
          "orderedItems.status": { $nin: ["Cancelled", "Returned"] },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "orderedItems.product",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          unitsSold: { $sum: "$orderedItems.quantity" },
          revenue: {
            $sum: {
              $multiply: ["$orderedItems.price", "$orderedItems.quantity"],
            },
          },
        },
      },
      { $sort: { unitsSold: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          let: { catId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$category", "$$catId"] },
                isDeleted: false,
              },
            },
            { $count: "count" },
          ],
          as: "productCount",
        },
      },
      {
        $project: {
          name: { $ifNull: ["$category.name", "Uncategorised"] },
          unitsSold: 1,
          revenue: 1,
          products: {
            $ifNull: [{ $arrayElemAt: ["$productCount.count", 0] }, 0],
          },
        },
      },
    ]);

    res.json({ categories: result });
  } catch (err) {
    console.error("Best categories error:", err);
    res.status(500).json({ error: "Failed to fetch best categories" });
  }
};


export const getLedgerData = async (req, res) => {
  try {
    const { period = "monthly", year } = req.query;
    const validPeriods = ["monthly", "quarterly", "yearly"];
    const p = validPeriods.includes(period) ? period : "monthly";
    const { start, end } = getDateRange(p, year);

    const orders = await Order.find(
      { createdOn: { $gte: start, $lte: end } },
      { createdOn: 1, totalPrice: 1, finalAmount: 1, discount: 1, status: 1 }
    ).lean();


    const entries = buildLedgerEntries(orders, p, parseInt(year) || new Date().getFullYear());

    res.json({ entries });
  } catch (err) {
    console.error("Ledger data error:", err);
    res.status(500).json({ error: "Failed to fetch ledger data" });
  }
};

function buildLedgerEntries(orders, period, year) {
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  
  let buckets = [];

  if (period === "monthly") {
    buckets = monthNames.map((m, i) => ({
      period: `${m} ${year}`,
      monthIndex: i,
      quarterIndex: null,
      yearVal: year,
    }));
  } else if (period === "quarterly") {
    buckets = [
      { period: `Q1 ${year}`, months: [0, 1, 2] },
      { period: `Q2 ${year}`, months: [3, 4, 5] },
      { period: `Q3 ${year}`, months: [6, 7, 8] },
      { period: `Q4 ${year}`, months: [9, 10, 11] },
    ];
  } else {
    const startYear = year - 4;
    buckets = Array.from({ length: 5 }, (_, i) => ({
      period: String(startYear + i),
      yearVal: startYear + i,
    }));
  }

  const filled = buckets.map((b) => ({
    ...b,
    orders: 0,
    gross: 0,
    credits: 0,
    debits: 0,
    net: 0,
    running: 0,
  }));

  orders.forEach((o) => {
    const d = new Date(o.createdOn);
    const m = d.getMonth();
    const y = d.getFullYear();
    const gross = o.totalPrice || 0;
    const productDiscount = o.discount || 0;
    const couponDiscount = Math.max(0, gross - (o.finalAmount || 0) - productDiscount);
    const totalDebit = productDiscount + couponDiscount;
    const net = o.finalAmount || gross;

    const isCancelled = ["Cancelled", "Returned"].includes(o.status);

    let idx = -1;
    if (period === "monthly" && y === year) {
      idx = m;
    } else if (period === "quarterly" && y === year) {
      idx = Math.floor(m / 3);
    } else if (period === "yearly") {
      idx = y - (year - 4);
    }

    if (idx >= 0 && idx < filled.length) {
      filled[idx].orders++;
      if (!isCancelled) {
        filled[idx].gross += gross;
        filled[idx].credits += net;
        filled[idx].debits += totalDebit;
        filled[idx].net += net;
      }
    }
  });

  let running = 0;
  filled.forEach((e) => {
    running += e.net;
    e.running = running;
  });

  return filled.map((e) => ({
    period: e.period,
    orders: e.orders,
    gross: Math.round(e.gross),
    credits: Math.round(e.credits),
    debits: Math.round(e.debits),
    net: Math.round(e.net),
    running: Math.round(e.running),
  }));
}

export default {
  loadDashboard,
  getChartData,
  getBestProducts,
  getBestCategories,
  getLedgerData,
};