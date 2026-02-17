// connectors/xero.js
// Pulls P&L, cashflow, outstanding invoices, bank balance

const axios = require("axios");

async function refreshXeroToken(clientId, clientSecret, refreshToken) {
  const res = await axios.post("https://identity.xero.com/connect/token",
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return res.data.access_token;
}

async function getXeroData(clientId, clientSecret, refreshToken, tenantId, businessName) {
  try {
    const accessToken = await refreshXeroToken(clientId, clientSecret, refreshToken);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
    };
    const base = "https://api.xero.com/api.xro/2.0";

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const [balanceRes, plRes, cashRes, overdueRes] = await Promise.all([
      // Bank balance
      axios.get(`${base}/Reports/BalanceSheet`, {
        headers,
        params: { date: fmt(today) }
      }),
      // P&L this month
      axios.get(`${base}/Reports/ProfitAndLoss`, {
        headers,
        params: { fromDate: fmt(monthStart), toDate: fmt(today) }
      }),
      // Cash summary
      axios.get(`${base}/Reports/BankSummary`, {
        headers,
        params: { fromDate: fmt(monthStart), toDate: fmt(today) }
      }),
      // Overdue invoices
      axios.get(`${base}/Invoices`, {
        headers,
        params: {
          where: 'Status=="AUTHORISED"',
          order: "DueDate ASC",
        }
      }),
    ]);

    // Parse P&L report
    const plReport = plRes.data.Reports?.[0];
    const findRow = (report, title) => {
      for (const section of report?.Rows || []) {
        for (const row of section.Rows || []) {
          if (row.Cells?.[0]?.Value === title) {
            return parseFloat(row.Cells?.[1]?.Value?.replace(/[^0-9.-]/g, "") || 0);
          }
        }
      }
      return null;
    };

    const mtdRevenue = findRow(plReport, "Total Income");
    const mtdExpenses = findRow(plReport, "Total Operating Expenses");
    const mtdNetProfit = findRow(plReport, "Net Profit");

    // Overdue invoices
    const allInvoices = overdueRes.data.Invoices || [];
    const overdueInvoices = allInvoices.filter(inv => {
      const due = new Date(inv.DueDateString);
      return due < today && inv.AmountDue > 0;
    });
    const totalOverdue = overdueInvoices.reduce((s, i) => s + (i.AmountDue || 0), 0);

    return {
      business: businessName,
      source: "xero",
      mtd: {
        revenue: mtdRevenue,
        expenses: mtdExpenses,
        netProfit: mtdNetProfit,
        profitMargin: mtdRevenue > 0 ? Math.round((mtdNetProfit / mtdRevenue) * 100) : null,
      },
      receivables: {
        overdueCount: overdueInvoices.length,
        overdueAmount: Math.round(totalOverdue * 100) / 100,
        overdueInvoices: overdueInvoices.slice(0, 5).map(i => ({
          contact: i.Contact?.Name,
          amount: i.AmountDue,
          dueDate: i.DueDateString,
          daysOverdue: Math.floor((today - new Date(i.DueDateString)) / 86400000)
        }))
      }
    };

  } catch (err) {
    console.error(`[Xero/${businessName}] Error:`, err.response?.data || err.message);
    return { business: businessName, source: "xero", error: err.message };
  }
}

module.exports = { getXeroData };
