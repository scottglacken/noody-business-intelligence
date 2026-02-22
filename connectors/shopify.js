// connectors/shopify.js
// COMPLETE REWRITE - Feb 22, 2026
// Fixed: NZ timezone, paid orders only, returning customer rate, gross vs net, benchmarking
// Uses OAuth client credentials grant flow

const axios = require("axios");

async function getAccessToken(storeName, clientId, clientSecret) {
  try {
    const response = await axios.post(
      `https://${storeName}.myshopify.com/admin/oauth/access_token`,
      `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.access_token;
  } catch (err) {
    console.error(`[Shopify/${storeName}] Token exchange failed:`, err.response?.data || err.message);
    throw err;
  }
}

async function getShopifyData(storeName, clientIdOrToken, clientSecret, businessName) {
  let accessToken;
  if (clientSecret) {
    accessToken = await getAccessToken(storeName, clientIdOrToken, clientSecret);
  } else {
    accessToken = clientIdOrToken;
  }

  const base = `https://${storeName}.myshopify.com/admin/api/2024-01`;
  const headers = { "X-Shopify-Access-Token": accessToken };

  // NZ TIME
  const nzTimeString = new Date().toLocaleString("en-US", { timeZone: "Pacific/Auckland" });
  const nowNZ = new Date(nzTimeString);
  const todayNZ = new Date(nowNZ.getFullYear(), nowNZ.getMonth(), nowNZ.getDate());

  const yesterdayNZ = new Date(todayNZ);
  yesterdayNZ.setDate(yesterdayNZ.getDate() - 1);
  const endOfYesterdayNZ = new Date(yesterdayNZ);
  endOfYesterdayNZ.setHours(23, 59, 59, 999);

  const dayBeforeNZ = new Date(yesterdayNZ);
  dayBeforeNZ.setDate(dayBeforeNZ.getDate() - 1);
  const endOfDayBeforeNZ = new Date(dayBeforeNZ);
  endOfDayBeforeNZ.setHours(23, 59, 59, 999);

  const weekAgoNZ = new Date(todayNZ);
  weekAgoNZ.setDate(weekAgoNZ.getDate() - 7);
  const twoWeeksAgoNZ = new Date(todayNZ);
  twoWeeksAgoNZ.setDate(twoWeeksAgoNZ.getDate() - 14);
  const monthStartNZ = new Date(todayNZ.getFullYear(), todayNZ.getMonth(), 1);
  const lastMonthStartNZ = new Date(todayNZ.getFullYear(), todayNZ.getMonth() - 1, 1);
  const lastMonthEndNZ = new Date(todayNZ.getFullYear(), todayNZ.getMonth(), 0, 23, 59, 59, 999);

  const fmt = (d) => d.toISOString();
  console.log(`[Shopify/${businessName}] Querying for NZ date: ${yesterdayNZ.toDateString()}`);

  try {
    const orderFields = "id,total_price,subtotal_price,total_discounts,total_tax,financial_status,line_items,customer,source_name,created_at,tags,discount_codes,refunds";
    const summaryFields = "id,total_price,financial_status,customer,created_at";

    const [yesterdayRes, dayBeforeRes, mtdRes, lastWeekRes, prevWeekRes, lastMonthRes] = await Promise.all([
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(yesterdayNZ), created_at_max: fmt(endOfYesterdayNZ), limit: 250 } }),
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(dayBeforeNZ), created_at_max: fmt(endOfDayBeforeNZ), limit: 250, fields: summaryFields } }),
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(monthStartNZ), created_at_max: fmt(todayNZ), limit: 250 } }),
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(weekAgoNZ), created_at_max: fmt(todayNZ), limit: 250, fields: summaryFields } }),
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(twoWeeksAgoNZ), created_at_max: fmt(weekAgoNZ), limit: 250, fields: summaryFields } }),
      axios.get(`${base}/orders.json`, { headers, params: { status: "any", created_at_min: fmt(lastMonthStartNZ), created_at_max: fmt(lastMonthEndNZ), limit: 250, fields: summaryFields } }),
    ]);

    // Filter valid orders (paid, authorized, pending — matches Shopify dashboard "Total Sales")
    const validStatuses = ["paid", "partially_paid", "pending", "authorized", "partially_refunded"];
    const filterPaid = (orders) => (orders || []).filter(o => validStatuses.includes(o.financial_status));
    const paidYesterday = filterPaid(yesterdayRes.data.orders);
    const paidDayBefore = filterPaid(dayBeforeRes.data.orders);
    const paidMtd = filterPaid(mtdRes.data.orders);
    const paidLastWeek = filterPaid(lastWeekRes.data.orders);
    const paidPrevWeek = filterPaid(prevWeekRes.data.orders);
    const paidLastMonth = filterPaid(lastMonthRes.data.orders);

    console.log(`[Shopify/${businessName}] Yesterday: ${(yesterdayRes.data.orders||[]).length} total, ${paidYesterday.length} valid`);
    const statusCounts = {};
    (yesterdayRes.data.orders||[]).forEach(o => { statusCounts[o.financial_status] = (statusCounts[o.financial_status]||0) + 1; });
    console.log(`[Shopify/${businessName}] Status breakdown:`, JSON.stringify(statusCounts));

    // Revenue helpers
    const calcRev = (orders) => orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const calcGross = (orders) => orders.reduce((s, o) => s + parseFloat(o.subtotal_price || 0), 0);
    const calcAOV = (orders) => orders.length > 0 ? calcRev(orders) / orders.length : 0;

    const yRevenue = calcRev(paidYesterday);
    const yGross = calcGross(paidYesterday);
    const dbRevenue = calcRev(paidDayBefore);
    const mtdRevenue = calcRev(paidMtd);
    const lwRevenue = calcRev(paidLastWeek);
    const pwRevenue = calcRev(paidPrevWeek);
    const lmRevenue = calcRev(paidLastMonth);

    // Dynamic targets — use last month actual + YTD trend (no arbitrary hardcoded target)
    const daysInMonth = new Date(todayNZ.getFullYear(), todayNZ.getMonth() + 1, 0).getDate();
    const daysElapsed = Math.max(todayNZ.getDate() - 1, 1);
    
    // YTD average as primary benchmark
    const yearStartNZ = new Date(todayNZ.getFullYear(), 0, 1);
    const daysInYear = Math.max(Math.floor((todayNZ - yearStartNZ) / 86400000), 1);
    
    // Use last month as the monthly benchmark (or MTD run rate if no last month data)
    const lmDailyAvg = lmRevenue > 0 ? lmRevenue / new Date(todayNZ.getFullYear(), todayNZ.getMonth(), 0).getDate() : 0;
    const mtdDailyAvg = mtdRevenue / daysElapsed;
    
    // Primary benchmark: last month's daily average (realistic, data-driven)
    const dailyBenchmark = lmDailyAvg > 0 ? lmDailyAvg : mtdDailyAvg;
    const monthlyBenchmark = dailyBenchmark * daysInMonth;
    const mtdTarget = dailyBenchmark * daysElapsed;

    // Customer metrics
    const customerStats = (orders) => {
      const newC = orders.filter(o => {
        const oc = o.customer?.orders_count;
        return oc === 1 || oc === undefined || oc === null;
      }).length;
      const retC = orders.filter(o => (o.customer?.orders_count || 0) > 1).length;
      const total = orders.length;
      return { new: newC, returning: retC, returningRate: total > 0 ? Math.round((retC / total) * 100) : 0 };
    };

    const yCust = customerStats(paidYesterday);
    const mtdCust = customerStats(paidMtd);
    console.log(`[Shopify/${businessName}] Customer orders_count values:`, paidYesterday.map(o => o.customer?.orders_count));

    // Discounts
    const totalDiscounts = paidYesterday.reduce((s, o) => s + parseFloat(o.total_discounts || 0), 0);

    // Top products (yesterday)
    const prodSales = {};
    paidYesterday.forEach(o => {
      (o.line_items || []).forEach(item => {
        const k = item.title;
        if (!prodSales[k]) prodSales[k] = { qty: 0, revenue: 0 };
        prodSales[k].qty += item.quantity;
        prodSales[k].revenue += parseFloat(item.price) * item.quantity;
      });
    });
    const topProducts = Object.entries(prodSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)
      .map(([name, d]) => ({ name, qty: d.qty, revenue: Math.round(d.revenue * 100) / 100 }));

    // MTD top products
    const mtdProdSales = {};
    paidMtd.forEach(o => {
      (o.line_items || []).forEach(item => {
        const k = item.title;
        if (!mtdProdSales[k]) mtdProdSales[k] = { qty: 0, revenue: 0 };
        mtdProdSales[k].qty += item.quantity;
        mtdProdSales[k].revenue += parseFloat(item.price) * item.quantity;
      });
    });
    const mtdTopProducts = Object.entries(mtdProdSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)
      .map(([name, d]) => ({ name, qty: d.qty, revenue: Math.round(d.revenue * 100) / 100 }));

    // Source breakdown
    const sourceBreakdown = {};
    paidYesterday.forEach(o => { const s = o.source_name || "unknown"; sourceBreakdown[s] = (sourceBreakdown[s] || 0) + 1; });

    // Scoring (vs last month's daily average)
    let revenueScore = "red";
    if (yRevenue >= dailyBenchmark) revenueScore = "green";
    else if (yRevenue >= dailyBenchmark * 0.7) revenueScore = "yellow";

    const dodChange = dbRevenue > 0 ? Math.round(((yRevenue - dbRevenue) / dbRevenue) * 100) : 0;
    const wowChange = pwRevenue > 0 ? Math.round(((lwRevenue - pwRevenue) / pwRevenue) * 100) : 0;
    const mtdPace = mtdTarget > 0 ? Math.round((mtdRevenue / mtdTarget) * 100) : 0;
    const projectedMonthly = Math.round((mtdDailyAvg * daysInMonth) * 100) / 100;

    console.log(`[Shopify/${businessName}] Revenue: $${yRevenue.toFixed(2)} (last month avg: $${dailyBenchmark.toFixed(2)}/day) | Score: ${revenueScore}`);
    console.log(`[Shopify/${businessName}] MTD: $${mtdRevenue.toFixed(2)} / $${mtdTarget.toFixed(2)} (${mtdPace}%) | Projected: $${projectedMonthly}`);
    console.log(`[Shopify/${businessName}] Returning rate: ${yCust.returningRate}% | AOV: $${calcAOV(paidYesterday).toFixed(2)}`);

    return {
      business: businessName,
      source: "shopify",
      date: yesterdayNZ.toDateString(),
      currency: "NZD",
      daily: {
        orders: paidYesterday.length,
        revenue: Math.round(yRevenue * 100) / 100,
        grossSales: Math.round(yGross * 100) / 100,
        aov: Math.round(calcAOV(paidYesterday) * 100) / 100,
        discounts: Math.round(totalDiscounts * 100) / 100,
        newCustomers: yCust.new,
        returningCustomers: yCust.returning,
        returningCustomerRate: yCust.returningRate,
        sourceBreakdown,
        topProducts,
      },
      comparison: {
        dayBefore: { revenue: Math.round(dbRevenue * 100) / 100, orders: paidDayBefore.length, changePercent: dodChange },
        lastWeek: { revenue: Math.round(lwRevenue * 100) / 100, orders: paidLastWeek.length, aov: Math.round(calcAOV(paidLastWeek) * 100) / 100 },
        prevWeek: { revenue: Math.round(pwRevenue * 100) / 100, orders: paidPrevWeek.length, wowChangePercent: wowChange },
        lastMonth: { revenue: Math.round(lmRevenue * 100) / 100, orders: paidLastMonth.length, aov: Math.round(calcAOV(paidLastMonth) * 100) / 100, dailyAvg: Math.round((lmRevenue / daysInMonth) * 100) / 100 },
      },
      mtd: {
        orders: paidMtd.length,
        revenue: Math.round(mtdRevenue * 100) / 100,
        aov: Math.round(calcAOV(paidMtd) * 100) / 100,
        daysElapsed,
        target: Math.round(mtdTarget * 100) / 100,
        monthlyBenchmark: Math.round(monthlyBenchmark * 100) / 100,
        pacePercent: mtdPace,
        projectedMonthly,
        newCustomers: mtdCust.new,
        returningCustomers: mtdCust.returning,
        returningCustomerRate: mtdCust.returningRate,
        topProducts: mtdTopProducts,
      },
      performance: {
        revenueScore,
        dailyBenchmark: Math.round(dailyBenchmark * 100) / 100,
        vsLastMonthAvg: dailyBenchmark > 0 ? Math.round(((yRevenue / dailyBenchmark) * 100) - 100) : 0,
        dodChange,
        wowChange,
        mtdPace,
        lastMonthDailyAvg: Math.round(lmDailyAvg * 100) / 100,
        mtdDailyAvg: Math.round(mtdDailyAvg * 100) / 100,
      },
    };
  } catch (err) {
    console.error(`[Shopify/${businessName}] Error:`, err.response?.data || err.message);
    return { business: businessName, source: "shopify", error: err.message };
  }
}

module.exports = { getShopifyData };
