// ==========================
// ⚙️ CẤU HÌNH OLLAMA
// ==========================
const AIConf = {
  base() { return Store.get('ai_base', 'http://127.0.0.1:11434'); },
  model() { return Store.get('ai_model', 'llama3.1:8b'); },
  save(base, model) { Store.set('ai_base', base); Store.set('ai_model', model); }
};

function saveAIConf() {
  const b = document.getElementById('ai_base').value.trim();
  const m = document.getElementById('ai_model').value.trim();
  AIConf.save(b, m);
  alert('✅ Đã lưu cấu hình AI');
}

// ==========================
// 💾 LỊCH SỬ CHAT
// ==========================
const AILog = {
  key() {
    const me = Auth.me();
    return `${TD_NS}:ai_chat_${me ? me.id : 'anon'}`;
  },
  load() { return Store.get(this.key(), []); },
  save(list) { Store.set(this.key(), list); },
  clear() { localStorage.removeItem(this.key()); },
  renderLog() {
    const log = this.load();
    const box = document.getElementById('chatlog');
    if (!box) return;
    box.innerHTML = log.map(m => {
      const time = new Date(m.ts || Date.now()).toLocaleTimeString();
      const role = m.role === 'user' ? 'user' : 'bot';
      const avatar = role === 'user' ? '🤵' : '🤖';
      const safe = (m.text || '').replace(/\n/g, '<br>');
      return `
        <div class="msg ${role}">
          ${role === 'bot' ? `<div class="avatar">${avatar}</div>` : ''}
          <div class="stack"><div class="bubble">${safe}</div><div class="meta">${time}</div></div>
          ${role === 'user' ? `<div class="avatar">${avatar}</div>` : ''}
        </div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
};

// ==========================
// 📎 GẮN THƯ MỤC + 🧹 XÓA CHAT
// ==========================
function attachFolder(e) {
  const files = Array.from(e.target.files).map(f => f.webkitRelativePath || f.name);
  if (!files.length) return;
  const txt = "📁 Thư mục gắn:\n" + files.map(f => "• " + f).join("\n");
  const el = document.getElementById('ai_input');
  el.value += (el.value ? "\n\n" : "") + txt;
  alert(`Đã gắn ${files.length} file.`);
}

function resetAIChat() {
  if (confirm("🧹 Xóa toàn bộ hội thoại?")) {
    AILog.clear();
    AILog.renderLog();
  }
}

// ==========================
// 🤖 AI DISCOVERY 
// ==========================
const AIEndpoint = (() => {
  const make = (name, path, buildBody, parse) => ({ name, path, buildBody, parse });
  const strategies = [
    make(
      'chat', '/api/chat',
      (model, context, q) => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: context },
            { role: 'user', content: q }
          ]
        })
      }),
      d => d?.message?.content ?? d?.response ?? '[Không có phản hồi]'
    ),
    make(
      'generate', '/api/generate',
      (model, context, q) => ({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: context + "\n\n" + q, stream: false })
      }),
      d => d?.response ?? '[Không có phản hồi]'
    )
  ];

  const probe = base => s => fetch(base + s.path, { method: 'OPTIONS' })
    .then(r => r.ok ? s : Promise.reject(s.name));

  const pick = base => Promise.any(strategies.map(probe(base)))
    .catch(() => strategies[0]);

  return { strategies, pick };
})();

async function pickModelRealtime(base, preferred) {
  return fetch(base + '/api/tags')
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(d => (d?.models || []).map(m => m?.model || m?.name).filter(Boolean))
    .then(list => [preferred && list.includes(preferred) ? preferred : null, ...list].find(Boolean) || preferred || 'llama3.1:8b')
    .catch(() => preferred || 'llama3.1:8b');
}

// ==========================
// 🧠 BUILD CONTEXT REALTIME
// ==========================
function buildCompanyContext() {
  const users = DB.users();
  const tasks = DB.tasks();
  const att = DB.attendance();

  const active = users.filter(u => u.active);
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const performance = totalTasks ? ((doneTasks / totalTasks) * 100).toFixed(1) : 0;

  const lines = users.map(u => {
    const myTasks = tasks.filter(t => t.assignedTo === u.id);
    const done = myTasks.filter(t => t.status === 'done').length;
    const attCount = att.filter(a => a.userId === u.id).length;
    const working = u.active ? '✅' : '❌';
    return `- ${u.name} (${u.dept || 'Không rõ'}) ${working} — ${done}/${myTasks.length} việc, ${attCount} bản ghi công.`;
  }).join("\n");

  return [
    "Bạn là Trợ lý AI của Công ty Thành Đô.",
    "Hãy trả lời như một chuyên gia HR, biết rõ toàn bộ dữ liệu nhân viên, công việc, chấm công và KPI.",
    "Luôn trả lời bằng tiếng Việt, có gạch đầu dòng, dễ đọc.",
    `Tổng nhân viên: ${active.length}`,
    `Tổng công việc: ${totalTasks} (${performance}% hoàn thành)`,
    "Chi tiết nhân viên:",
    lines,
    "\nHãy dùng dữ liệu này để trả lời các câu hỏi quản trị."
  ].join("\n");
}

// ==========================
// 🚀 GỌI OLLAMA VỚI DỮ LIỆU THẬT
// ==========================
async function callAIRealtime(q) {
  const base = AIConf.base();
  const want = AIConf.model();
  const context = buildCompanyContext();
  const [strategy, model] = await Promise.all([
    AIEndpoint.pick(base),
    pickModelRealtime(base, want)
  ]);

  return fetch(base + strategy.path, strategy.buildBody(model, context, q))
    .then(r => r.json())
    .then(strategy.parse);
}

// ==========================
// 💬 GỬI TIN NHẮN
// ==========================
async function onSendAI(e) {
  e.preventDefault();
  const el = document.getElementById('ai_input');
  const q = el.value.trim();
  if (!q) return false;

  AILog.save([...AILog.load(), { role: 'user', text: q, ts: Date.now() }]);
  AILog.renderLog();
  el.value = '';

  try {
    const answer = await callAIRealtime(q);
    AILog.save([...AILog.load(), { role: 'assistant', text: answer, ts: Date.now() }]);
    AILog.renderLog();
  } catch (err) {
    const note = [
      '❌ Lỗi gọi Ollama:', err?.message || err,
      'Kiểm tra Base URL hoặc chạy: OLLAMA_ORIGINS=* ollama serve'
    ].join('\n');
    AILog.save([...AILog.load(), { role: 'assistant', text: note, ts: Date.now() }]);
    AILog.renderLog();
  }
  return false;
}
function renderChatMessage(role, text) {
  const chatlog = document.getElementById('chatlog');
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `
    <div class="avatar">${role === 'user' ? '🧑‍💼' : '🤖'}</div>
    <div class="bubble">${(text || '').replace(/\n/g, '<br>')}</div>`;
  chatlog.appendChild(wrap);
  chatlog.scrollTop = chatlog.scrollHeight;
}

function showTyping() {
  const chatlog = document.getElementById('chatlog');
  const el = document.createElement('div');
  el.id = 'typingIndicator';
  el.className = 'msg bot';
  el.innerHTML = `<div class="avatar">🤖</div><div class="bubble typing">Đang suy nghĩ<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>`;
  chatlog.appendChild(el);
  chatlog.scrollTop = chatlog.scrollHeight;
}
function hideTyping() { const el = document.getElementById('typingIndicator'); if (el) el.remove(); }

async function sendAIMessageRealtime() {
  const input = document.getElementById('ai_input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';

  // lưu + render user
  const log1 = AILog.load().concat([{ role:'user', text:q, ts:Date.now() }]);
  AILog.save(log1);
  renderChatMessage('user', q);
  showTyping();
  
  try {
  const { answer, plan, results, review } = await callAISmart(q);
  hideTyping();
  maybeShowDataFreshnessNotice && maybeShowDataFreshnessNotice();

  // 1) Định dạng câu trả lời thành bố cục rõ ràng
  const pretty = formatAIAnswer(mdToHtml(answer), { plan, results });


  // 2) Nhật ký phân tích (gọn trong details)
  const technical = `<details><summary>🛠️ Nhật ký phân tích</summary>
<pre>${escapeHtml(JSON.stringify({ plan, results, review }, null, 2))}</pre></details>`;

  const finalHtml = pretty + technical;

  const log2 = AILog.load().concat([{ role:'assistant', text:finalHtml, ts:Date.now() }]);
  AILog.save(log2);
  renderChatMessage('bot', finalHtml);

} catch (err) {
  hideTyping();
  const fallback = await callAIRealtime(q);
  const finalHtml = formatAIAnswer(mdToHtml(fallback), { plan:null, results:[] });
  const log2 = AILog.load().concat([{ role:'assistant', text:finalHtml, ts:Date.now() }]);
  AILog.save(log2);
  renderChatMessage('bot', finalHtml);
}

  // --- LIVE SNAPSHOT mỗi lần gọi AI ---
function getLiveDBSnapshot() {
  // Đọc trực tiếp từ Store/DB ở thời điểm hiện tại (không cache)
  const users = DB.users();
  const tasks = DB.tasks();
  const attendance = DB.attendance();
  const payrollSettings = DB.payrollSettings ? DB.payrollSettings() : {};
  const now = new Date();

  return {
    nowISO: now.toISOString(),
    counts: {
      users: users.length,
      tasks: tasks.length,
      attendance: attendance.length
    },
    users, tasks, attendance, payrollSettings
  };
}

// --- Context tươi dựa trên snapshot ---
function buildCompanyContext() {
  const snap = getLiveDBSnapshot();
  const done = snap.tasks.filter(t => t.status === 'done').length;
  const pct = snap.tasks.length ? ((done / snap.tasks.length) * 100).toFixed(1) : '0.0';

  return [
    `Thời điểm: ${snap.nowISO}`,
    `Tổng nhân viên: ${snap.counts.users}`,
    `Tổng công việc: ${snap.counts.tasks} (hoàn thành: ${done} = ${pct}%)`,
    `Tổng bản ghi chấm công: ${snap.counts.attendance}`,
    `Lưu ý: mọi số liệu dưới đây luôn lấy realtime từ hệ thống (localStorage).`
  ].join('\n');
}
// PLANNER strict
async function aiPlanStrict(q) {
  const system = aiToolingSystemPrompt() + "\n\n" + buildCompanyContext(); // <-- context tươi
  const user   = `Yêu cầu: ${q}\nChỉ trả về JSON kế hoạch (không giải thích thêm).`;
  // ... giữ nguyên phần còn lại ...
}

// WRITER
async function aiWriteFromResults(q, plan, results) {
  const evidence = _composeEvidence(results);
  const system = "Bạn là Trợ lý dữ liệu nội bộ, trả lời tiếng Việt, súc tích, dựa trên số liệu thực.";
  const user = [
    `Câu hỏi: ${q}`,
    "Ngữ cảnh hệ thống (realtime):",
    buildCompanyContext(),              // <-- context tươi
    "Kế hoạch:", JSON.stringify(plan),
    "Kết quả tools:", JSON.stringify(results),
    "Bằng chứng rút gọn:",
    evidence || "(không có)",
    "Yêu cầu định dạng: ... (giữ như trước)"
  ].join("\n");

  return _aiCall({ system, user, temperature: 0.2 });
}

}
// =======================
//  assets/js/ai_ui.js
//  Chatbox V2 kiểu ChatGPT
// =======================

function renderChatMessage(role, text) {
  const chatlog = document.getElementById('chatlog');
  if (!chatlog) return;
  const wrap = document.createElement('div');
  wrap.className = `msg ${role}`;
  wrap.innerHTML = `
    <div class="avatar">${role === 'user' ? '🧑‍💼' : '🤖'}</div>
    <div class="bubble">${(text || '').replace(/\n/g, '<br>')}</div>`;
  chatlog.appendChild(wrap);
  chatlog.scrollTop = chatlog.scrollHeight;
}

function showTyping() {
  const chatlog = document.getElementById('chatlog');
  if (!chatlog) return;
  const el = document.createElement('div');
  el.id = 'typingIndicator';
  el.className = 'msg bot';
  el.innerHTML = `<div class="avatar">🤖</div><div class="bubble typing">Đang suy nghĩ<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>`;
  chatlog.appendChild(el);
  chatlog.scrollTop = chatlog.scrollHeight;
}
function hideTyping() { const el = document.getElementById('typingIndicator'); if (el) el.remove(); }

async function sendAIMessageRealtime() {
  const input = document.getElementById('ai_input');
  if (!input) return;
  const q = input.value.trim();
  if (!q) return;
  input.value = '';

  const log1 = AILog.load().concat([{ role:'user', text:q, ts:Date.now() }]);
  AILog.save(log1);
  renderChatMessage('user', q);
  showTyping();

  try {
    const answer = await callAIRealtime(q);
    hideTyping();
    const log2 = AILog.load().concat([{ role:'assistant', text:answer, ts:Date.now() }]);
    AILog.save(log2);
    renderChatMessage('bot', answer);
  } catch (err) {
    hideTyping();
    const msg = '❌ Lỗi: ' + (err?.message || err);
    const log2 = AILog.load().concat([{ role:'assistant', text:msg, ts:Date.now() }]);
    AILog.save(log2);
    renderChatMessage('bot', msg);
  }
}

// Nạp dữ liệu thô nhanh vào prompt
function insertDataset(type) {
  const users = DB.users();
  const tasks = DB.tasks();
  const att = DB.attendance();

  const datasetMap = {
    users: users,
    tasks: tasks,
    attendance: att,
    kpi: {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'done').length
    }
  };
  const data = datasetMap[type];
  const el = document.getElementById('ai_input');
  if (!el) return;
  el.value = (typeof data === 'string') ? data : JSON.stringify(data, null, 2);
  el.focus();
}

function clearChat() {
  if (confirm('Xóa toàn bộ hội thoại?')) {
    AILog.clear();
    const box = document.getElementById('chatlog');
    if (box) box.innerHTML = '';
  }
}
function exportChatLog() {
  const log = AILog.load();
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'ai_chat_log.json'; a.click();
  URL.revokeObjectURL(url);
}
// ===== PLANNER: yêu cầu model trả về JSON kế hoạch =====
async function aiPlan(q) {
  const base = AIConf.base();
  const want = AIConf.model();
  const [strategy, model] = await Promise.all([
    AIEndpoint.pick(base),
    pickModelRealtime(base, want)
  ]);

  // context dữ liệu thật
  const context = buildCompanyContext();

  const body = {
    model, stream: false,
    messages: [
      { role: "system", content: aiToolingSystemPrompt() + "\n\n" + context },
      { role: "user", content: `Yêu cầu: ${q}\nHãy trả JSON kế hoạch duy nhất theo định dạng đã cho.` }
    ]
  };

  const raw = await fetch(base + strategy.path, {
    method: "POST", headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(r=>r.json()).then(strategy.parse);

  // Cố gắng bóc JSON từ câu trả lời (model có thể rào trước/sau)
  const jsonMatch = (raw||'').match(/\{[\s\S]*\}/);
  try {
    return JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    // fallback: không parse được -> không dùng tool
    return { intent: 'free_answer', steps: [] };
  }
}

// ===== WRITER: sau khi có results, nhờ model viết câu trả lời tự nhiên =====
async function aiWriteAnswer(q, plan, results) {
  const base = AIConf.base();
  const want = AIConf.model();
  const [strategy, model] = await Promise.all([
    AIEndpoint.pick(base),
    pickModelRealtime(base, want)
  ]);

  const context = [
    buildCompanyContext(),
    "Dưới đây là kế hoạch và kết quả thực thi:",
    "Kế hoạch:", JSON.stringify(plan, null, 2),
    "Kết quả:", JSON.stringify(results, null, 2),
    "Hãy viết câu trả lời ngắn gọn, có mục 'Kết quả chính', 'Phân tích', 'Đề xuất'."
  ].join("\n");

  const body = {
    model, stream:false,
    messages: [
      { role: "system", content: "Bạn là trợ lý dữ liệu nội bộ, viết tiếng Việt rõ ràng." },
      { role: "user", content: `Câu hỏi: ${q}\n${context}` }
    ]
  };

  return fetch(base + strategy.path, {
    method: "POST", headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(r=>r.json()).then(strategy.parse);
}

// ===== ORCHESTRATOR: pipeline đầy đủ cho UI chat =====
async function callAISmart(q) {
  // 1) Lập kế hoạch
  const plan = await aiPlan(q);

  // 2) Thực thi kỹ năng
  const results = await runSkillPlan(plan);

  // 3) Nhờ model viết câu trả lời trên kết quả
  const answer = await aiWriteAnswer(q, plan, results);

  // 4) Trả về cả answer + log kỹ thuật (để gỡ lỗi nếu cần)
  return { answer, plan, results };
}
// ===== Helper gọi model có kiểm soát =====
async function _aiCall({ system, user, temperature = 0.2 }) {
  const base = AIConf.base();
  const want = AIConf.model();
  const [strategy, model] = await Promise.all([AIEndpoint.pick(base), pickModelRealtime(base, want)]);

  const body = { model, stream:false, options:{ temperature }, messages:[
    { role:"system", content: system },
    { role:"user",   content: user }
  ]};

  const txt = await fetch(base + strategy.path, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body)
  }).then(r=>r.json()).then(strategy.parse);

  return (txt||"").trim();
}

// Tạo tóm tắt bối cảnh doanh nghiệp (giữ hàm cũ nếu bạn đã có)
function _ctx() { return buildCompanyContext(); }

// Ráp “bằng chứng” dạng bullet từ results tools
function _composeEvidence(results) {
  const bullets = [];
  for (const r of results) {
    if (r.error) { bullets.push(`• ❌ ${r.tool}: ${r.error}`); continue; }
    if (r.tool === "kpi_overview" && r.result) {
      const k = r.result; bullets.push(`• KPI: ${k.employees} NV • ${k.tasks} task • Hoàn thành ${k.progressPct}%`);
    }
    if (r.tool === "tasks_near_deadline" && Array.isArray(r.result)) {
      bullets.push(`• Việc sắp đến hạn: ${r.result.length} mục`);
    }
    if (r.tool === "attendance_anomalies" && Array.isArray(r.result)) {
      bullets.push(`• Bất thường chấm công: ${r.result.length} dòng`);
    }
    if (r.tool === "compute_payroll" && r.result?.summary) {
      bullets.push(`• Lương tổng kỳ này: ${(+r.result.summary.total).toLocaleString()} VND`);
    }
  }
  return bullets.join("\n");
}

// ===== 1) Planner: bắt buộc trả JSON kế hoạch =====
async function aiPlanStrict(q) {
  const system = aiToolingSystemPrompt() + "\n\n" + _ctx();
  const user   = `Yêu cầu: ${q}\nChỉ trả về JSON kế hoạch (không giải thích thêm).`;
  const raw    = await _aiCall({ system, user, temperature: 0.1 });
  const m = raw.match(/\{[\s\S]*\}$/);
  try { return JSON.parse(m ? m[0] : raw); }
  catch { return { intent:"general", steps:[] }; }
}

// ===== 2) Writer: viết báo cáo có số liệu & đề xuất =====
async function aiWriteFromResults(q, plan, results) {
  const evidence = _composeEvidence(results);
  const mustHave = [
    "• Có mục 'Kết quả chính' liệt kê số liệu (dùng số, %) từ kết quả tools.",
    "• Có mục 'Phân tích' nêu ý nghĩa số liệu, so sánh tăng/giảm nếu có.",
    "• Có mục 'Đề xuất' gồm 3-5 việc hành động, gắn chủ sở hữu & thời hạn.",
    "• Mục 'Nguồn dữ liệu' ghi rõ tools đã dùng."
  ].join("\n");

  const system = "Bạn là Trợ lý dữ liệu nội bộ, trả lời tiếng Việt, súc tích, dựa trên số liệu thực.";
  const user = [
    `Câu hỏi: ${q}`,
    "Kế hoạch:", JSON.stringify(plan),
    "Kết quả tools:", JSON.stringify(results),
    "Bằng chứng rút gọn:",
    evidence || "(không có)",
    "Yêu cầu định dạng bắt buộc:",
    mustHave
  ].join("\n");

  return _aiCall({ system, user, temperature: 0.2 });
}

// ===== 3) Critic: phản biện nếu câu trả lời hời hợt =====
async function aiCritique(draft, q) {
  const rules = [
    "Kiểm tra: có số liệu cụ thể (số, %) không? Có nguồn dữ liệu không? Có đề xuất hành động rõ người phụ trách & deadline không?",
    "Nếu thiếu, trả về JSON {score:0-100, fix:'hướng dẫn sửa chi tiết'}; nếu đủ tốt, score>=80 và fix=''."
  ].join("\n");
  const system = "Bạn là reviewer nghiêm khắc.";
  const user   = `Yêu cầu: ${q}\nBản nháp:\n${draft}\n${rules}\nChỉ trả về JSON.`;
  const raw    = await _aiCall({ system, user, temperature: 0.1 });
  const m = raw.match(/\{[\s\S]*\}$/);
  try { return JSON.parse(m ? m[0] : raw); }
  catch { return { score: 50, fix: "Không parse được phản biện, hãy bổ sung số liệu & nguồn." }; }
}

// ===== 4) Revise: sửa theo phản biện =====
async function aiRevise(draft, fix) {
  const system = "Bạn là biên tập viên. Sửa bản nháp theo hướng dẫn, giữ cấu trúc 3 mục + Nguồn dữ liệu.";
  const user   = `Bản nháp:\n${draft}\nHướng dẫn sửa:\n${fix}\nTrả bản cuối.`;
  return _aiCall({ system, user, temperature: 0.2 });
}

// ===== Orchestrator nghiêm ngặt =====
async function callAISmart(q) {
  // Lập kế hoạch (bắt buộc dùng tool nếu cần)
  const plan = await aiPlanStrict(q);
  // Thực thi
  const results = await runSkillPlan(plan);
  // Viết nháp
  let draft = await aiWriteFromResults(q, plan, results);
  // Phản biện
  const review = await aiCritique(draft, q);
  if ((review.score||0) < 80 && review.fix) {
    draft = await aiRevise(draft, review.fix);
  }
  return { answer: draft, plan, results, review };
}

const STRICT_LOCAL = true;

// … trong callAISmart(q) sau khi có plan:
async function callAISmart(q) {
  const plan = await aiPlanStrict(q);

  // Nếu model tự nhận out-of-scope
  if (plan?.intent === 'out_of_scope') {
    return {
      answer: "Mình chỉ hỗ trợ dữ liệu & nghiệp vụ nội bộ (nhân viên, công việc, chấm công, lương, KPI, xuất CSV, bản đồ). Bạn mô tả nhu cầu trong phạm vi này nhé!",
      plan, results: [], review: { score: 100, fix: "" }
    };
  }

  // STRICT: nếu không có step mà câu hỏi lại có vẻ liên quan dữ liệu → buộc trả lời lại bằng tools
  const looksData = /nhân viên|employee|task|công việc|chấm công|attendance|kpi|lương|payroll|csv|bản đồ|map/i.test(q);
  if (STRICT_LOCAL && looksData && (!plan.steps || plan.steps.length === 0)) {
    return {
      answer: "Mình cần dùng dữ liệu thật để trả lời. Hãy nêu rõ khoảng thời gian/phòng ban/đối tượng để mình truy xuất số liệu nhé!",
      plan: { intent: "need_more_specific", steps: [] },
      results: [], review: { score: 90, fix: "" }
    };
  }

  // … phần còn lại như trước
  const results = await runSkillPlan(plan);
  let draft = await aiWriteFromResults(q, plan, results);
  const review = await aiCritique(draft, q);
  if ((review.score||0) < 80 && review.fix) draft = await aiRevise(draft, review.fix);
  return { answer: draft, plan, results, review };
}
// sau khi nhận { answer, plan, ... }:
let finalHtml = answer;
if (plan?.intent === 'out_of_scope') {
  finalHtml = `<div class="badge warn">Ngoài phạm vi hệ thống</div><div>${answer}</div>`;
}
