import { useState, useEffect } from 'react';

export default function Settings() {
  const [limits, setLimits] = useState({
    Food: 35, Transport: 20, Shopping: 25, Health: 30, Entertainment: 20,
  });
  const [income, setIncome] = useState('');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    const savedLimits = localStorage.getItem('expenseOS_budgetLimits');
    if (savedLimits) {
      try { setLimits(JSON.parse(savedLimits)); } catch (e) {}
    }
    const savedIncome = localStorage.getItem('expenseOS_income');
    if (savedIncome) setIncome(savedIncome);
  }, []);

  const handleSave = () => {
    localStorage.setItem('expenseOS_budgetLimits', JSON.stringify(limits));
    localStorage.setItem('expenseOS_income', income);
    setSaveMsg('// settings saved successfully');
    setTimeout(() => setSaveMsg(''), 2500);
  };

  return (
    <div className="settings-page">
      <div className="section-label stagger-1" style={{ marginBottom: '24px' }}>// BUDGET THRESHOLDS (%)</div>
      <div className="settings-grid">
        {Object.keys(limits).map((cat, i) => (
          <div key={cat} className={`settings-input-group stagger-${(i % 5) + 1}`}>
            <label>{cat}</label>
            <div className="input-with-symbol">
              <input
                type="number" min="0" max="100"
                value={limits[cat]}
                onChange={(e) => setLimits({ ...limits, [cat]: Number(e.target.value) })}
              />
              <span className="symbol">%</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-label stagger-3" style={{ marginTop: '40px', marginBottom: '24px' }}>// MONTHLY INCOME</div>
      <div className="settings-grid stagger-4">
        <div className="settings-input-group">
          <label>Expected Monthly Income</label>
          <div className="input-with-symbol">
            <span className="symbol" style={{ right: 'auto', left: '12px', pointerEvents: 'none' }}>₹</span>
            <input
              type="number" min="0"
              style={{ paddingLeft: '28px' }}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="e.g. 50000"
            />
          </div>
        </div>
      </div>

      <div className="settings-footer">
        <button className="settings-save-btn" onClick={handleSave}>SAVE SETTINGS</button>
        {saveMsg && <span className="settings-save-msg">{saveMsg}</span>}
      </div>
    </div>
  );
}
