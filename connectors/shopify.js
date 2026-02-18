// connectors/shopify.js
// Pulls yesterday's orders, revenue, refunds, top products
// Updated for 2026: Uses OAuth client credentials grant flow

const axios = require("axios");

// Get access token using client credentials (new 2026 method)
async function getAccessToken(storeName, clientId, clientSecret) {
  try {
    const response = await axios.post(
      `https://${storeName}.myshopify.com/admin/oauth/access_token`,
      `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.access_token;
  } catch (err) {
    console.error(`[Shopify/${storeName}] Token exchange failed:`, err.response?.data || err.message);
    throw err;
  }
}

async function getShopifyData(storeName, clientIdOrToken, clientSecret, businessName) {
  // Support both old (direct token) and new (client credentials) methods
  let accessToken;
  if (clientSecret) {
    // New method: exchange client credentials for access token
    accessToken = await getAccessToken(storeName, clientIdOrToken, clientSecret);
  } else {
    // Old method: direct access token (for backward compatibility)
    accessToken = clientIdOrToken;
  }

  const base = `https://${storeName}.myshopify.com/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": accessToken };

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const dayBefore = new Date(yesterday);
  dayBefore.setDate(dayBefore.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const fmt = (d) => d.toISOString();

  try {
    // ── Yesterday's Orders ──────────────────────────────────
    const [ordersRes, refundsRes, mtdRes, wow7Res] = await Promise.all([
      axios.get(`${base}/orders.json`, {
        headers,
        params: {
          status: "any",
          created_at_min: fmt(yesterday),
          created_at_max: fmt(today),
          limit: 250,
          fields: "id,total_price,subtotal_price,financial_status,line_items,customer,source_name,created_at,tags"
        }
      }),
      axios.get(`${base}/orders.json`, {
        headers,
        params: {
          status: "any",
          financial_status: "refunded,partially_refunded",
          created_at_min: fmt(yesterday),
          created_at_max: fmt(today),
          limit: 250,
          fields: "id,total_price,refunds"
        }
      }),
      axios.get(`${base}/orders.json`, {
        headers,
        params: {
          status: "any",
          created_at_min: fmt(monthStart),
          created_at_max: fmt(today),
          limit: 250,
          fields: "id,total_price,financial_status,created_at"
        }
      }),
      axios.get(`${base}/orders.json`, {
        headers,
        params: {
          status: "any",
          created_at_min: fmt(weekAgo),
          created_at_max: fmt(today),
          limit: 250,
          fields: "id,total_price,created_at,customer"
        }
      }),
    ]);

    const orders = ordersRes.data.orders || [];
    const mtdOrders = mtdRes.data.orders || [];
    const weekOrders = wow7Res.data.orders || [];

    // CRITICAL FIX: Filter to only PAID orders (exclude drafts, cancelled, refunded)
    const paidOrders = orders.filter(o => 
      o.financial_status === 'paid' || o.financial_status === 'partially_paid'
    );
    const paidMtdOrders = mtdOrders.filter(o => 
      o.financial_status === 'paid' || o.financial_status === 'partially_paid'
    );

    console.log(`[Shopify/${businessName}] Total orders: ${orders.length}, Paid orders: ${paidOrders.length}`);

    // ── Revenue Calculations (ONLY PAID ORDERS) ────────────────────────────────
    const revenue = paidOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const mtdRevenue = paidMtdOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const refundAmount = (refundsRes.data.orders || []).reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

    // ── New vs Returning Customers (ONLY PAID ORDERS) ──────────────────────────
    const customerIds = paidOrders.map(o => o.customer?.id).filter(Boolean);
    const uniqueCustomers = new Set(customerIds).size;
    const newCustomers = paidOrders.filter(o => o.customer?.orders_count === 1).length;

    // ── Top Products (ONLY PAID ORDERS) ────────────────────────────────────────
    const productSales = {};
    paidOrders.forEach(order => {
      (order.line_items || []).forEach(item => {
        const key = item.title;
        if (!productSales[key]) productSales[key] = { qty: 0, revenue: 0 };
        productSales[key].qty += item.quantity;
        productSales[key].revenue += parseFloat(item.price) * item.quantity;
      });
    });

    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // ── Traffic Source Breakdown (ONLY PAID ORDERS) ────────────────────────────
    const sourceBreakdown = {};
    paidOrders.forEach(o => {
      const src = o.source_name || "unknown";
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    });

    // ── Average Order Value (ONLY PAID ORDERS) ─────────────────────────────────
    const aov = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
    const mtdAov = paidMtdOrders.length > 0 ? mtdRevenue / paidMtdOrders.length : 0;

    // ── Week-over-week comparison (last 7 days vs prior 7) ──
    const last7Rev = weekOrders
      .filter(o => new Date(o.created_at) >= weekAgo)
      .reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

    return {
      business: businessName,
      source: "shopify",
      date: yesterday.toDateString(),
      daily: {
        orders: paidOrders.length,
        revenue: Math.round(revenue * 100) / 100,
        aov: Math.round(aov * 100) / 100,
        refunds: Math.round(refundAmount * 100) / 100,
        newCustomers,
        uniqueCustomers,
        sourceBreakdown,
        topProducts,
      },
      mtd: {
        orders: paidMtdOrders.length,
        revenue: Math.round(mtdRevenue * 100) / 100,
        aov: Math.round(mtdAov * 100) / 100,
        daysElapsed: today.getDate() - 1,
      },
      weekly: {
        orders: weekOrders.length,
        revenue: Math.round(last7Rev * 100) / 100,
      }
    };

  } catch (err) {
    console.error(`[Shopify/${businessName}] Error:`, err.response?.data || err.message);
    return { business: businessName, source: "shopify", error: err.message };
  }
}

module.exports = { getShopifyData };
