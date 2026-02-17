// connectors/unleashed.js
// Pulls stock levels, low stock alerts, sales orders

const axios = require("axios");
const crypto = require("crypto");

function signRequest(apiKey, apiId, queryString) {
  const signature = crypto.createHmac("sha256", apiKey).update(queryString).digest("base64");
  return signature;
}

async function getUnleashedData(apiId, apiKey) {
  const base = "https://api.unleashedsoftware.com";

  const makeRequest = async (endpoint, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const signature = signRequest(apiKey, apiId, queryString);
    const url = `${base}/${endpoint}${queryString ? `?${queryString}` : ""}`;

    const res = await axios.get(url, {
      headers: {
        "api-auth-id": apiId,
        "api-auth-signature": signature,
        Accept: "application/json",
        "Content-Type": "application/json",
      }
    });
    return res.data;
  };

  try {
    const [stockRes, lowStockRes, salesRes] = await Promise.all([
      makeRequest("StockOnHand/1", { pageSize: 200 }),
      makeRequest("StockOnHand/1", { belowMinimumStockLevel: "true", pageSize: 50 }),
      makeRequest("SalesOrders/1", { orderStatus: "Placed,Backordered", pageSize: 50 }),
    ]);

    const stockItems = stockRes.Items || [];
    const lowStockItems = (lowStockRes.Items || []).map(item => ({
      name: item.ProductDescription,
      sku: item.ProductCode,
      onHand: item.QtyOnHand,
      minimum: item.MinimumLevel,
      deficit: item.MinimumLevel - item.QtyOnHand,
    }));

    const pendingOrders = (salesRes.Items || []).map(o => ({
      orderNumber: o.OrderNumber,
      customer: o.Customer?.CustomerName,
      value: o.SubTotal,
      status: o.OrderStatus,
      requiredDate: o.RequiredDate,
    }));

    const totalStockValue = stockItems.reduce((s, i) => s + (i.Total || 0), 0);

    return {
      source: "unleashed",
      inventory: {
        totalProducts: stockItems.length,
        totalStockValue: Math.round(totalStockValue * 100) / 100,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 10),
      },
      orders: {
        pendingCount: pendingOrders.length,
        pendingOrders: pendingOrders.slice(0, 10),
      }
    };

  } catch (err) {
    console.error(`[Unleashed] Error:`, err.response?.data || err.message);
    return { source: "unleashed", error: err.message };
  }
}

module.exports = { getUnleashedData };
