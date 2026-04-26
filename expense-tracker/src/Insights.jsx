import { useState, useEffect, useRef } from 'react';

/* Matrix rain canvas during loading */
function MatrixRain() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    const cols = Math.floor(canvas.width / 14);
    const drops = Array(cols).fill(1);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789₹$%#@!+-=><';
    const draw = () => {
      ctx.fillStyle = 'rgba(10,10,15,0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,255,148,0.7)';
      ctx.font = '12px monospace';
      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = y * 14 < 30 ? 'rgba(0,255,148,1)' : 'rgba(0,255,148,0.5)';
        ctx.fillText(char, i * 14, y * 14);
        if (y * 14 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      });
    };
    const id = setInterval(draw, 50);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={canvasRef} className="matrix-canvas" />;
}

/* Typing card */
function TypingCard({ insight, delay }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  useEffect(() => {
    const full = insight.text;
    let i = 0;
    const start = setTimeout(() => {
      const id = setInterval(() => {
        setDisplayed(full.slice(0, ++i));
        if (i >= full.length) { clearInterval(id); setDone(true); }
      }, 18);
      return () => clearInterval(id);
    }, delay);
    return () => clearTimeout(start);
  }, [insight.text, delay]);

  return (
    <div className={`insight-card ${insight.type}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="insight-header">
        <span className="insight-icon">
          {insight.type === 'warning' ? '⚠' : insight.type === 'success' ? '✓' : '💡'}
        </span>
        <span className="insight-title">{insight.title}</span>
      </div>
      <p className="insight-text">
        {displayed}
        {!done && <span className="boot-cursor">▋</span>}
      </p>
    </div>
  );
}

export default function Insights({ allEntries }) {
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState([]);

  const handleGenerate = () => {
    setLoading(true);
    setInsights([]);
    setTimeout(() => {
      const total = allEntries.reduce((s, e) => s + e.amount, 0);
      const cats = {};
      allEntries.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
      const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      const generated = [];

      if (top) {
        const pct = ((top[1] / total) * 100).toFixed(0);
        generated.push({
          id: 1, type: pct > 40 ? 'warning' : 'success',
          title: `${top[0]} is your top category`,
          text: `You've spent ₹${top[1].toLocaleString('en-IN')} on ${top[0]}, which is ${pct}% of your total spend. ${pct > 40 ? 'Consider reducing this to stay within budget.' : 'This looks healthy!'}`,
        });
      }
      if (allEntries.length > 5) {
        generated.push({
          id: 2, type: 'info',
          title: 'Spending Frequency',
          text: `You've logged ${allEntries.length} entries. Consistent logging helps identify patterns — keep it up!`,
        });
      }
      if (sorted.length > 1) {
        generated.push({
          id: 3, type: 'info',
          title: 'Category Diversity',
          text: `Your spending spans ${sorted.length} categories: ${sorted.map(([c]) => c).join(', ')}. Diversified spending usually indicates a balanced lifestyle.`,
        });
      }
      if (generated.length === 0) {
        generated.push({
          id: 1, type: 'info',
          title: 'Not enough data',
          text: 'Log a few more expenses first to get personalized insights!',
        });
      }

      setInsights(generated);
      setLoading(false);
    }, 2200);
  };

  return (
    <div className="insights-page">
      <button
        className={`generate-btn${loading ? ' loading' : ''}`}
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? 'ANALYZING SPENDING PATTERNS...' : '✨ GENERATE AI INSIGHTS'}
      </button>

      {loading && (
        <div className="matrix-container">
          <MatrixRain />
          <div className="matrix-overlay-text">// processing expense data...</div>
        </div>
      )}

      {insights.length === 0 && !loading && (
        <div className="empty-state" style={{ marginTop: '32px' }}>
          <div className="empty-state-icon">🤖</div>
          <p>No insights yet.<br />Click the button above to analyze your spending habits.</p>
        </div>
      )}

      {insights.length > 0 && (
        <div className="insights-list">
          <div className="section-label" style={{ marginTop: '32px', marginBottom: '16px' }}>
            // ANALYSIS RESULTS
          </div>
          {insights.map((insight, i) => (
            <TypingCard key={insight.id} insight={insight} delay={i * 400} />
          ))}
        </div>
      )}
    </div>
  );
}
