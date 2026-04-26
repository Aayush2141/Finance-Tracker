import React, { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis
} from 'recharts';

function formatINR(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// Colors from App.jsx
const CAT_COLORS = {
  Food: '#F59E0B',
  Transport: '#22D3EE',
  Shopping: '#A78BFA',
  Health: '#F87171',
  Entertainment: '#FBBF24',
  Other: '#6B7280',
};

export default function Dashboard({ allEntries }) {
  const now = new Date();

  const [limits, setLimits] = useState({
    Food: 35,
    Transport: 20,
    Shopping: 25,
    Health: 30,
    Entertainment: 20
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('expenseOS_budgetLimits');
    if (saved) {
      try {
        setLimits(JSON.parse(saved));
      } catch (e) {
        console.warn('Failed to parse saved limits');
      }
    }
  }, []);

  const handleSaveLimits = () => {
    localStorage.setItem('expenseOS_budgetLimits', JSON.stringify(limits));
    setSaveMsg('// thresholds saved');
    setTimeout(() => setSaveMsg(''), 2000);
  };

  // Helpers
  const isCurrentMonth = (ts) => {
    if (!ts) return false;
    const d = new Date(ts);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  const isWithinDays = (ts, daysAgoStart, daysAgoEnd) => {
    if (!ts) return false;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(today.getDate() - daysAgoStart);

    const end = new Date(today);
    end.setDate(today.getDate() - daysAgoEnd);

    return d <= start && d > end;
  };

  // 1. Monthly Summary Data
  const monthlyEntries = allEntries.filter(e => isCurrentMonth(e.ts));
  const monthlyTotal = monthlyEntries.reduce((s, e) => s + e.amount, 0);

  const currentDayOfMonth = now.getDate();
  const avgPerDay = currentDayOfMonth > 0 ? (monthlyTotal / currentDayOfMonth) : 0;

  // Group by day for highest spending day
  const monthlyByDay = {};
  monthlyEntries.forEach(e => {
    const day = new Date(e.ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    monthlyByDay[day] = (monthlyByDay[day] || 0) + e.amount;
  });
  const maxDayEntry = Object.entries(monthlyByDay).sort((a, b) => b[1] - a[1])[0];
  const maxDay = maxDayEntry ? maxDayEntry[0] : '—';

  // Most expensive single entry
  const maxEntry = monthlyEntries.length > 0 ? [...monthlyEntries].sort((a, b) => b.amount - a.amount)[0] : null;

  // 2. Weekly Comparison Data
  // Last 7 days (0 to 7 days ago) vs Previous 7 days (7 to 14 days ago)
  const thisWeekTotal = allEntries.filter(e => isWithinDays(e.ts, 0, 7)).reduce((s, e) => s + e.amount, 0);
  const lastWeekTotal = allEntries.filter(e => isWithinDays(e.ts, 7, 14)).reduce((s, e) => s + e.amount, 0);

  let percentChange = 0;
  if (lastWeekTotal > 0) {
    percentChange = ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100;
  } else if (thisWeekTotal > 0) {
    percentChange = 100;
  }

  // 3. Category Distribution (Pie Chart) - Current Month
  const categoryTotals = {};
  monthlyEntries.forEach(e => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const pieData = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }));

  // 4. Trend Line Chart (Last 7 Days)
  // Generate last 7 days labels
  const last7DaysData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' });

    // Sum amount for this specific day
    const dayTotal = allEntries
      .filter(e => {
        if (!e.ts) return false;
        const entryD = new Date(e.ts);
        return entryD.getDate() === d.getDate() &&
          entryD.getMonth() === d.getMonth() &&
          entryD.getFullYear() === d.getFullYear();
      })
      .reduce((s, e) => s + e.amount, 0);

    last7DaysData.push({ day: label, amount: dayTotal });
  }

  // 5. Budget Alerts
  const alerts = [];
  if (monthlyTotal > 0) {
    for (const [cat, limit] of Object.entries(limits)) {
      const catTotal = categoryTotals[cat] || 0;
      const pct = (catTotal / monthlyTotal) * 100;
      if (pct > limit) {
        alerts.push({
          type: 'warning',
          category: cat,
          pct: pct.toFixed(0),
          limit: limit
        });
      } else {
        alerts.push({
          type: 'success',
          category: cat,
          pct: pct.toFixed(0),
          limit: limit
        });
      }
    }
  }

  // Custom Tooltip for PieChart
  const CustomPieTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const pct = monthlyTotal > 0 ? ((data.value / monthlyTotal) * 100).toFixed(0) : 0;
      return (
        <div className="custom-tooltip">
          <p className="label">{data.name}</p>
          <p className="value">{formatINR(data.value)} ({pct}%)</p>
        </div>
      );
    }
    return null;
  };

  const CustomLineTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="label">{label}</p>
          <p className="value">{formatINR(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="dashboard-wrapper">

      {/* Dashboard Header */}
      <div className="dashboard-header">
        <h2 className="section-label" style={{ marginBottom: 0 }}>// OVERVIEW</h2>
        <button
          className={`settings-toggle-btn ${settingsOpen ? 'active' : ''}`}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          ⚙ SETTINGS
        </button>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="settings-panel">
          <div className="settings-header">
            <span className="section-label" style={{ marginBottom: 0 }}>// budget thresholds (%)</span>
            {saveMsg && <span className="settings-save-msg">{saveMsg}</span>}
          </div>
          <div className="settings-grid">
            {Object.keys(limits).map(cat => (
              <div key={cat} className="settings-input-group">
                <label>{cat}</label>
                <div className="input-with-symbol">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={limits[cat]}
                    onChange={(e) => setLimits({ ...limits, [cat]: Number(e.target.value) })}
                  />
                  <span className="symbol">%</span>
                </div>
              </div>
            ))}
          </div>
          <button className="settings-save-btn" onClick={handleSaveLimits}>
            SAVE THRESHOLDS
          </button>
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="dashboard-alerts">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-card ${alert.type}`}>
              <div className="alert-icon">{alert.type === 'warning' ? '⚠' : '✓'}</div>
              <div className="alert-content">
                {alert.type === 'warning' ? (
                  <><strong>{alert.category}</strong> is at {alert.pct}% — exceeds {alert.limit}% budget limit</>
                ) : (
                  <><strong>{alert.category}</strong> is at {alert.pct}% — On track</>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top Cards Grid */}
      <div className="dashboard-grid top-cards">

        {/* Monthly Summary */}
        <div className="dashboard-card monthly-summary stagger-1">
          <div className="section-label">// current month</div>
          <div className="monthly-total accent">{formatINR(monthlyTotal)}</div>

          <div className="monthly-stats-grid">
            <div className="stat-sm">
              <div className="stat-sm-label">Daily Avg</div>
              <div className="stat-sm-val">{formatINR(avgPerDay)}</div>
            </div>
            <div className="stat-sm">
              <div className="stat-sm-label">Highest Day</div>
              <div className="stat-sm-val">{maxDay}</div>
            </div>
            <div className="stat-sm">
              <div className="stat-sm-label">Largest Expense</div>
              <div className="stat-sm-val" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {maxEntry ? `${formatINR(maxEntry.amount)} (${maxEntry.category})` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Comparison */}
        <div className="dashboard-card weekly-compare stagger-2">
          <div className="section-label">// 7-day comparison</div>

          <div className="compare-row">
            <div>
              <div className="compare-label">This Week</div>
              <div className="compare-val">{formatINR(thisWeekTotal)}</div>
            </div>
            <div className="vs-badge">VS</div>
            <div style={{ textAlign: 'right' }}>
              <div className="compare-label">Last Week</div>
              <div className="compare-val">{formatINR(lastWeekTotal)}</div>
            </div>
          </div>

          <div className={`trend-indicator ${percentChange > 0 ? 'up' : percentChange < 0 ? 'down' : 'flat'}`}>
            <span className="trend-arrow">{percentChange > 0 ? '↑' : percentChange < 0 ? '↓' : '—'}</span>
            <span>{Math.abs(percentChange).toFixed(1)}% {percentChange > 0 ? 'increase' : percentChange < 0 ? 'decrease' : 'no change'}</span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="dashboard-grid charts-grid">

        {/* Trend Line Chart */}
        <div className="dashboard-card trend-chart stagger-3">
          <div className="section-label">// daily trend (last 7 days)</div>
          <div className="chart-container" style={{ height: '240px', marginTop: '16px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={last7DaysData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} width={55} />
                <RechartsTooltip content={<CustomLineTooltip />} cursor={{ stroke: 'var(--border)', strokeWidth: 1, strokeDasharray: '4 4' }} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="var(--green)"
                  strokeWidth={2}
                  isAnimationActive={true}
                  animationDuration={1000}
                  dot={{ r: 4, fill: 'var(--bg)', stroke: 'var(--green)', strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: 'var(--green)', stroke: 'var(--bg)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Pie Chart */}
        <div className="dashboard-card pie-chart stagger-4">
          <div className="section-label">// category distribution</div>
          {pieData.length > 0 ? (
            <div className="chart-container" style={{ height: '240px', display: 'flex', alignItems: 'center', marginTop: '16px' }}>
              <div style={{ flex: 1, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="80%"
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                      isAnimationActive={true}
                      animationBegin={0}
                      animationDuration={900}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CAT_COLORS[entry.name] || CAT_COLORS.Other} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Custom Legend */}
              <div className="pie-legend">
                {pieData.map((entry, i) => (
                  <div key={i} className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: CAT_COLORS[entry.name] || CAT_COLORS.Other }}></span>
                    <span className="legend-name">{entry.name}</span>
                    <span className="legend-val">{((entry.value / monthlyTotal) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="breakdown-empty" style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              No data for current month
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
