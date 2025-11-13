// =======================
//  assets/js/payroll.js
//  Tính lương dựa trên chấm công (localStorage)
// =======================

function _toStartOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function _toEndOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }

function _hoursBetween(startISO, endISO) {
  if (!startISO || !endISO) return 0;
  const ms = new Date(endISO) - new Date(startISO);
  return Math.max(0, ms / 36e5); // ms -> hours
}

// Chuẩn hoá 1 bản ghi ngày công
function normalizeWorkday(entry) {
  const h = _hoursBetween(entry.checkIn, entry.checkOut);
  const stdHours = Math.min(8, h);
  const otHours  = Math.max(0, h - 8);
  return { stdHours, otHours, rawHours: h };
}

// Lấy cấu hình lương cho userId
function getPayConfig(userId) {
  const map = DB.payrollSettings();
  const def = { baseSalary: 10000000, hourlyRate: 40000, otMultiplier: 1.5, allowance: 0, deduction: 0 };
  return { ...def, ...(map[userId] || {}) };
}

// Tính lương cho 1 nhân viên
function computePayrollForUser(user, entries) {
  const cfg = getPayConfig(user.id);

  let days = 0, stdHours = 0, otHours = 0;
  entries.forEach(e => {
    const d = normalizeWorkday(e);
    if (d.rawHours > 0) days++;
    stdHours += d.stdHours;
    otHours  += d.otHours;
  });

  const payStd = stdHours * cfg.hourlyRate;
  const payOT  = otHours  * cfg.hourlyRate * cfg.otMultiplier;
  const total  = cfg.baseSalary + payStd + payOT + cfg.allowance - cfg.deduction;

  return {
    userId: user.id, name: user.name, dept: user.dept || '',
    days: +days.toFixed(0),
    stdHours: +stdHours.toFixed(2),
    otHours: +otHours.toFixed(2),
    baseSalary: cfg.baseSalary,
    hourlyRate: cfg.hourlyRate,
    otMultiplier: cfg.otMultiplier,
    allowance: cfg.allowance,
    deduction: cfg.deduction,
    payStd: Math.round(payStd),
    payOT: Math.round(payOT),
    total: Math.round(total)
  };
}

// Tính lương toàn bộ (lọc theo phòng ban nếu có)
function computePayroll({ start, end, dept = null }) {
  const users = DB.users().filter(u => u.active !== false && (dept ? u.dept === dept : true));
  // attendance.date đang là ISO (yyyy-mm-dd) hoặc ISO full – so sánh bằng range ngày
  const S = _toStartOfDay(start).toISOString().slice(0, 10);
  const E = _toEndOfDay(end).toISOString().slice(0, 10);

  const within = DB.attendance()
    .filter(a => a.date >= S && a.date <= E);

  const rows = users.map(u => {
    const my = within.filter(x => x.userId === u.id);
    return computePayrollForUser(u, my);
  });

  const summary = rows.reduce((acc, r) => {
    acc.employees++;
    acc.stdHours += r.stdHours;
    acc.otHours  += r.otHours;
    acc.total    += r.total;
    return acc;
  }, { employees: 0, stdHours: 0, otHours: 0, total: 0 });

  summary.stdHours = +summary.stdHours.toFixed(2);
  summary.otHours  = +summary.otHours.toFixed(2);

  return { rows, summary };
}

// Lưu “kỳ lương” đã chốt
function savePayrollRun({ title, start, end, dept, rows, summary }) {
  const runs = DB.payrollRuns();
  runs.push({
    id: uid(),
    title,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    dept: dept || null,
    createdAt: nowISO(),
    rows,
    summary
  });
  DB.savePayrollRuns(runs);
  return runs[runs.length - 1];
}
