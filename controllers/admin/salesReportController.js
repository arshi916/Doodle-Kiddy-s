import { query } from "express-validator";
import Order from "../../models/orderSchema.js";
import User from "../../models/userSchema.js";

function getDateRange(filter, startDate, endDate) {
  const now = new Date();
  let start, end;

  switch (filter) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;

    case "week": {
      const day = now.getDay(); 
      start = new Date(now);
      start.setDate(now.getDate() - day);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }

    case "year":
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
      end   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      break;

    case "custom":
      start = new Date(startDate + "T00:00:00");
      end   = new Date(endDate   + "T23:59:59");
      break;

    case "month":
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
  }

  return { start, end };
}


async function getReportData(start, end, page, limit) {
    const orders = await Order.find({
    createdOn: { $gte: start, $lte: end },
    status: { $nin: ["Cancelled"] }
  })
    .sort({ createdOn: -1 })
  .skip((page - 1) * limit)  
  .limit(limit)      
    .lean();

  const userIds = [...new Set(
    orders
      .map(o => o.user ?? o.userId ?? o.customerId ?? o.customer ?? null)
      .filter(id => id != null)
  )];

  let userMap = {};
  try {
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } }, "name email").lean();
      users.forEach(u => { userMap[u._id.toString()] = u; });
    }
  } catch (_) { /* silently ignore — address fallback will be used */ }

  let totalSalesCount      = 0;
  let totalOrderAmount     = 0;
  let totalDiscount        = 0;
  let totalCouponDiscount  = 0;

  const formattedOrders = orders.map(order => {
    const grossAmount    = order.totalPrice     ?? order.grossAmount    ?? order.subtotal ?? 0;
    const discount       = order.discount       ?? order.offerDiscount  ?? 0;
    const couponDiscount = order.couponDiscount ?? order.couponSavings  ?? order.couponAmount ?? 0;
    const netAmount      = order.finalAmount    ?? order.netAmount      ?? order.totalAmount
                           ?? (grossAmount - discount - couponDiscount);

    totalSalesCount++;
    totalOrderAmount    += grossAmount;
    totalDiscount       += discount;
    totalCouponDiscount += couponDiscount;

    const userRef   = order.user ?? order.userId ?? order.customerId ?? order.customer ?? null;
    const userDoc   = userRef ? userMap[userRef.toString()] : null;

    const addrObj   = Array.isArray(order.address) ? order.address[0] : order.address;

    const customerName  = userDoc?.name  ?? addrObj?.name  ?? addrObj?.fullName  ?? "Guest";
    const customerEmail = userDoc?.email ?? addrObj?.email ?? "—";

    const dateStr = new Date(order.createdOn ?? order.createdAt ?? order.orderDate)
      .toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

    return {
      orderId:        order._id.toString(),
      customerName,
      customerEmail,
      dateStr,
      status:         order.status ?? "Pending",
      grossAmount:    Math.round(grossAmount),
      discount:       Math.round(discount),
      couponDiscount: Math.round(couponDiscount),
      netAmount:      Math.round(netAmount),
    };
  });

  const netRevenue = totalOrderAmount - totalDiscount - totalCouponDiscount;

  return {
    orders: formattedOrders,
    summary: {
      totalSalesCount,
      totalOrderAmount:    Math.round(totalOrderAmount),
      totalDiscount:       Math.round(totalDiscount),
      totalCouponDiscount: Math.round(totalCouponDiscount),
      netRevenue:          Math.round(netRevenue),
    }
  };
}


export const loadSalesReport = async (req, res) => {
  try {
    const search = req.query.search ? req.query.search.trim() : "";
    const page  = parseInt(req.query.page) || 1;
    const limit = 8;

    const filter    = req.query.filter    ?? "month";
    const startDate = req.query.startDate ?? null;
    const endDate   = req.query.endDate   ?? null;

    const { start, end } = getDateRange(filter, startDate, endDate);

    const total = await Order.countDocuments({
      createdOn: { $gte: start, $lte: end },
      status: { $nin: ["Cancelled"] }
    });

    const { orders, summary } = await getReportData(start, end, page, limit);

    res.render("admin/sales-report", {
      orders,
      summary,
      filter,
      startDate,
      endDate,
      activePage: "sales-report",
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      search
    });

  } catch (error) {
    console.error("Sales report error:", error);
    res.redirect("/admin/pageerror");
  }
};

export const getSalesReportData = async (req, res) => {
  try {
    const filter    = req.query.filter    ?? "month";
    const startDate = req.query.startDate ?? null;
    const endDate   = req.query.endDate   ?? null;

    const { start, end } = getDateRange(filter, startDate, endDate);
    const data = await getReportData(start, end);

    res.json(data);
  } catch (error) {
    console.error("Sales report data error:", error);
    res.status(500).json({ error: "Failed to fetch report data" });
  }
};