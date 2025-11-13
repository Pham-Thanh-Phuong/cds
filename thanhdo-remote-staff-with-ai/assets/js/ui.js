// UI render helpers + views (Dept filter, CSV export, GPS attendance) + Tab AI (Admin)
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));}
// ===== Markdown 
// ===== Markdown renderer nâng cao (dùng marked.js) =====
function mdToHtml(md) {
  if (!md) return '';
  try {
    // cấu hình marked để hỗ trợ code, bảng, emoji, link
    marked.setOptions({
      breaks: true,
      gfm: true, // GitHub Flavored Markdown (table, checklist,...)
      headerIds: false,
      mangle: false
    });
    return marked.parse(md);
  } catch (err) {
    console.error("Markdown parse error:", err);
    return md.replace(/\n/g, '<br/>'); // fallback
  }
}
function navLinks(){
  const me = Auth.me();
  const links = [
    { href:'#/dashboard', label:'Bảng điều khiển' },
    ...(me && me.role===Roles.ADMIN ? [{ href:'#/employees', label:'Nhân viên' }] : []),
    { href:'#/tasks', label:'Công việc' },
    { href:'#/attendance', label:'Chấm công' },
    ...(me && me.role===Roles.ADMIN ? [{ href:'#/payroll', label:'Tính lương' }] : []), 
    ...(me && me.role===Roles.ADMIN ? [{ href:'#/ai', label:'AI (Admin)' }, { href:'#/admin', label:'Quản trị' }] : [])
    
  ];
  
  const cur = location.hash || '#/login';
  return links.map(l=>`<a href="${l.href}" class="${cur===l.href?'active':''}">${l.label}</a>`).join('');
}

function renderNavbar(){
  const me = Auth.me();
  const nav = document.getElementById('navbar');
  if(!me){ nav.innerHTML = ''; return; }
  nav.innerHTML = navLinks();
}

function userMenuHTML(){
  const me=Auth.me();
  if(!me) return `<div class="stack"><a class="btn" href="#/login">Đăng nhập</a></div>`;
  return `
    <div class="stack">
      <div class="flex-between">
        <div>
          <strong>${me.name}</strong><br/>
          <small class="badge muted">${me.role==='admin'?'Quản trị': 'Nhân viên'}</small>
        </div>
        <span class="badge">${me.email}</span>
      </div>
      <div class="row">
        <button class="btn warn" onclick="toggleTheme()">Đổi giao diện</button>
        <button class="btn" onclick="location.hash='#/profile'">Hồ sơ</button>
      </div>
      <button class="btn danger" onclick="doLogout()">Đăng xuất</button>
    </div>`;
}

function toggleTheme(){
  const html=document.documentElement;
  html.setAttribute('data-theme', html.getAttribute('data-theme')==='light'?'dark':'light');
}

function mountUserMenu(){
  const wrap = document.getElementById('userMenuWrap');
  const box = document.getElementById('userMenu');
  if(!wrap||!box) return;
  const me = Auth.me();
  if(!me){ wrap.classList.add('hidden'); return; }
  box.innerHTML = userMenuHTML();
}

function doLogout(){ Auth.logout(); location.hash = '#/login'; }

// ===== CSV helpers =====
function toCSV(rows){
  return rows.map(r=> r.map(v=>{
    const s = (v??'').toString();
    if(/[",\n]/.test(s)) return '"'+s.replaceAll('"','""')+'"';
    return s;
  }).join(',')).join('\n');
}
function downloadCSV(filename, rows){
  const csv = toCSV(rows);
  const blob=new Blob(["\uFEFF"+csv], {type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=filename.endsWith('.csv')?filename:filename+'.csv'; a.click(); URL.revokeObjectURL(url);
}
function exportUsersCSV(filterDept=null){
  const data = DB.users().filter(u=>!filterDept||u.dept===filterDept);
  const rows = [["Họ tên","Email","Vai trò","Phòng ban","Trạng thái"]]
    .concat(data.map(u=>[u.name,u.email,u.role==='admin'?'Quản trị':'Nhân viên',u.dept||'',u.active?'Hoạt động':'Khoá']));
  downloadCSV('users', rows);
}
function exportTasksCSV(filterDept=null){
  const users = DB.users();
  const pick = DB.tasks().filter(t=>{
    if(!filterDept) return true;
    const u = users.find(x=>x.id===t.assignedTo); return u && u.dept===filterDept;
  });
  const rows = [["Tiêu đề","Mô tả","Người nhận","Phòng ban","Hạn","Trạng thái"]]
    .concat(pick.map(t=>{ const u=users.find(x=>x.id===t.assignedTo); return [t.title,t.desc||'',u?u.name:'?',u?u.dept:'',t.due?new Date(t.due).toLocaleDateString():'',t.status]; }));
  downloadCSV('tasks', rows);
}
function exportAttendanceCSV(filterDept=null){
  const users = DB.users();
  const pick = DB.attendance().filter(a=>{
    if(!filterDept) return true;
    const u = users.find(x=>x.id===a.userId); return u && u.dept===filterDept;
  });
  const rows = [["Nhân viên","Phòng ban","Ngày","Check-in","Check-out","Lat","Lng"]]
    .concat(pick.map(e=>{ const u=users.find(x=>x.id===e.userId); return [u?u.name:'?',u?u.dept:'',new Date(e.date).toLocaleDateString(), e.checkIn?new Date(e.checkIn).toLocaleTimeString():'', e.checkOut?new Date(e.checkOut).toLocaleTimeString():'', e.lat??'', e.lng??'']; }));
  downloadCSV('attendance', rows);
}
// ===== Google Maps helper =====
function gmapLink(lat, lng, label = 'Google Maps') {
  if (lat == null || lng == null) return '';
  const q = `${lat},${lng}`;
  // z=18 để phóng to mức đường/phố
  return `<a target="_blank" rel="noopener" href="https://www.google.com/maps?q=${q}&z=18">${label}</a>`;
}
// Chuẩn hoá & đóng gói câu trả lời theo bố cục rõ ràng
function formatAIAnswer(answerText, meta = {}) {
  const txt = (answerText || '').trim();

  // Bóc vài con số/KPI đơn giản nếu có (tuỳ chọn)
  const kpi = extractKPIFromResults(meta.results || []);

  // Dàn bố cục: Kết quả chính – Phân tích – Đề xuất – Nguồn dữ liệu
  // Nếu model đã có tiêu đề tương tự, vẫn sẽ hiển thị gọn trong các khối.
  const sections = splitSections(txt);

  return `
  <div class="ai-answer">
    ${kpi ? renderKPI(kpi) : ''}

    <div class="ai-section">
      <div class="ai-title">Kết quả chính</div>
      ${sections.main}
    </div>

    <div class="ai-section">
      <div class="ai-title">Phân tích</div>
      ${sections.analysis}
    </div>

    <div class="ai-section">
      <div class="ai-title">Đề xuất hành động</div>
      ${sections.actions}
    </div>

    <div class="ai-section">
      <div class="ai-title">Nguồn dữ liệu</div>
      ${renderSources(meta.results || [])}
      ${renderChips(meta.plan)}
    </div>
  </div>`;
}

// --- Mini utils ---
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));}

function toListHtml(textBlock) {
  // chuyển dòng bắt đầu bằng - hoặc • thành <li>
  const lines = textBlock.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const lis   = lines.map(l => {
    const m = l.match(/^[-•]\s*(.*)$/); 
    return `<li>${escapeHtml(m ? m[1] : l)}</li>`;
  }).join('');
  return `<ul class="ai-list">${lis || '<li>—</li>'}</ul>`;
}

function splitSections(txt){
  // tách theo các tiêu đề thường gặp; fallback thành danh sách
  const norm = txt.replace(/\r/g,'').trim();
  const get = (regex) => {
    const m = norm.match(regex);
    return m ? m[1].trim() : '';
  };
  const main     = get(/(?:Kết quả chính|Kết quả|KQ):?\s*([\s\S]*?)(?=\n(?:Phân tích|Đề xuất|Nguồn)|$)/i) || norm;
  const analysis = get(/Phân tích:?\s*([\s\S]*?)(?=\n(?:Đề xuất|Nguồn)|$)/i);
  const actions  = get(/Đề xuất(?: hành động)?:?\s*([\s\S]*?)(?=\nNguồn|$)/i);

  return {
    main:     toListHtml(main),
    analysis: toListHtml(analysis || '• Không có phân tích chi tiết'),
    actions:  toListHtml(actions  || '• Chưa có đề xuất cụ thể (hãy thêm người phụ trách & deadline)')
  };
}

function renderSources(results){
  if (!results.length) return `<div class="muted">Không có tool nào được dùng.</div>`;
  const items = results
    .filter(r=>r.tool && r.tool!=='meta_snapshot')
    .map(r=>`<li>${escapeHtml(r.tool)} ${r.error ? '— ❌ ' + escapeHtml(r.error) : '— ✅ ok'}</li>`).join('');
  const meta = results.find(r=>r.tool==='meta_snapshot');
  const stamp = meta ? `<div class="muted">Thực thi lúc: ${escapeHtml(meta.result.ranAt)} • Counts: ${escapeHtml(JSON.stringify(meta.result.snapshot))}</div>` : '';
  return `<ul class="ai-list">${items}</ul>${stamp}`;
}

function renderChips(plan){
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return '';
  const chips = plan.steps.map(s=>`<span class="chip">${escapeHtml(s.tool)}</span>`).join('');
  return `<div class="chips">${chips}</div>`;
}

function extractKPIFromResults(results){
  const o = {};
  for (const r of results) {
    if (r.tool==='kpi_overview' && r.result) {
      o.employees = r.result.employees;
      o.tasks     = r.result.tasks;
      o.donePct   = r.result.progressPct;
    }
    if (r.tool==='tasks_near_deadline' && Array.isArray(r.result)) {
      o.nearDL = r.result.length;
    }
    if (r.tool==='attendance_anomalies' && Array.isArray(r.result)) {
      o.anoms = r.result.length;
    }
    if (r.tool==='compute_payroll' && r.result?.summary) {
      o.payTotal = r.result.summary.total;
    }
  }
  return Object.keys(o).length ? o : null;
}

function renderKPI(k){
  const p = (v) => (v==null?'—':(typeof v==='number'? v.toLocaleString(): v));
  return `
  <div class="kpis">
    <div class="kpi"><div class="muted">Nhân viên</div><div class="num">${p(k.employees)}</div></div>
    <div class="kpi"><div class="muted">Tổng task</div><div class="num">${p(k.tasks)}</div></div>
    <div class="kpi"><div class="muted">Hoàn thành</div><div class="num">${p(k.donePct)}%</div></div>
    <div class="kpi"><div class="muted">Gần deadline</div><div class="num">${p(k.nearDL)}</div></div>
    <div class="kpi"><div class="muted">Bất thường CC</div><div class="num">${p(k.anoms)}</div></div>
    <div class="kpi"><div class="muted">Tổng lương kỳ</div><div class="num">${p(k.payTotal)}</div></div>
  </div>`;
}

//====== Bẳng lương ========
function exportPayrollCSV(rows, start, end, deptLabel='Tất cả') {
  const head   = [['Kỳ lương', `${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()}`],
                  ['Phòng ban', deptLabel], []];
  const header = [['Nhân viên','Phòng ban','Ngày công','Giờ chuẩn','Giờ OT','Lương cơ bản','Lương giờ','HS OT','Phụ cấp','Khấu trừ','Tiền giờ','Tiền OT','Tổng']];
  const body   = rows.map(r => [
    r.name, r.dept, r.days, r.stdHours, r.otHours,
    r.baseSalary, r.hourlyRate, r.otMultiplier, r.allowance, r.deduction,
    r.payStd, r.payOT, r.total
  ]);
  downloadCSV('payroll', [...head, ...header, ...body]);
}
// Xuất CSV dựa trên bộ lọc đang hiển thị trên màn "Tính lương"
function exportPayrollCSVCurrent() {
  // Lấy range & dept đang chọn (nếu trống thì đặt mặc định)
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = (window._payrollStart || first.toISOString().slice(0,10));
  const end   = (window._payrollEnd   || now.toISOString().slice(0,10));
  const dept  = (window._payrollDept  || 'Tất cả');

  const { rows } = computePayroll({
    start, end, dept: (dept === 'Tất cả' ? null : dept)
  });

  exportPayrollCSV(rows, start, end, dept);
}

// ===== Views =====
const View = {
  login(){
    return `
      <div class="login-wrap">
        <div class="card">
          <h2 class="login-title">Đăng nhập hệ thống</h2>
          <form class="form" onsubmit="return onLogin(event)">
            <div>
              <label class="label">Email</label>
              <input class="input" type="email" id="login_email" placeholder="you@company.com" required />
            </div>
            <div>
              <label class="label">Mật khẩu</label>
              <input class="input" type="password" id="login_password" placeholder="••••••••" required />
            </div>
            <div class="help">Dùng tài khoản mẫu ở phần đầu tài liệu nếu chưa có dữ liệu.</div>
            <div class="actions">
              <button class="btn primary" type="submit">Đăng nhập</button>
            </div>
          </form>
        </div>
      </div>`;
  },
  dashboard(){
    const me = Auth.me();
    const tasks = DB.tasks();
    const myTasks = me.role===Roles.ADMIN ? tasks : tasks.filter(t=>t.assignedTo===me.id);
    const att = DB.attendance();
    const myAttToday = att.find(a=>a.userId===me.id && a.date===todayISO());
    return `
      <div class="grid">
        <div class="col-8">
          <div class="card">
            <div class="flex-between">
              <h3>Xin chào, ${me.name}</h3>
              <span class="badge">Vai trò: ${me.role==='admin'?'Quản trị':'Nhân viên'}</span>
            </div>
            <div class="row mt-3">
              <div class="kpi"><div>
                <div class="help">Công việc của tôi</div>
                <strong>${myTasks.length}</strong>
              </div><a class="btn" href="#/tasks">Xem</a></div>
              <div class="kpi"><div>
                <div class="help">Tổng nhân viên</div>
                <strong>${DB.users().length}</strong>
              </div>${Auth.require(Roles.ADMIN)?'<a class="btn" href="#/employees">Quản lý</a>':''}</div>
            </div>
          </div>
        </div>
        <div class="col-4">
          <div class="card">
            <h3>Chấm công hôm nay</h3>
            ${myAttToday?`
              <div class="stack mt-2">
                <div>Check-in: <span class="badge ok">${new Date(myAttToday.checkIn).toLocaleTimeString()}</span></div>
                <div>Check-out: <span class="badge ${myAttToday.checkOut?'ok':'warn'}">${myAttToday.checkOut?new Date(myAttToday.checkOut).toLocaleTimeString():'Chưa'}</span></div>
                ${myAttToday.checkOut?'' : '<button class="btn" onclick="doCheckout()">Check-out</button>'}
                ${myAttToday.lat ? `<div class="help">
                ${myAttToday.lat.toFixed(5)}, ${myAttToday.lng.toFixed(5)} ${gmapLink(myAttToday.lat, myAttToday.lng, 'Bản đồ')}</div>` : ''}

              </div>
            `: `
              <div class="stack">
                <div class="help">Bạn chưa check-in hôm nay. Hệ thống sẽ yêu cầu quyền vị trí khi chấm công.</div>
                <button class="btn primary" onclick="doCheckin()">Check-in (ghi tọa độ)</button>
              </div>
            `}
          </div>
        </div>
        <div class="col-12">
          <div class="card">
            <h3>Công việc gần đây</h3>
            ${tableTasks(me)}
          </div>
        </div>
      </div>`;
  },
  employees(){
    const me=Auth.me(); if(me.role!==Roles.ADMIN) return View.denied();
    const users=DB.users();
    const deptOptions = ['Tất cả'].concat(Departments);
    const curDept = window._deptFilter||'Tất cả';
    const filtered = curDept==='Tất cả'? users : users.filter(u=>u.dept===curDept);
    return `
      <div class="grid">
        <div class="col-8"><div class="card">
          <div class="flex-between">
            <h3>Danh sách nhân viên</h3>
            <div class="toolbar">
              <select class="input" onchange="setDeptFilter(this.value)">
                ${deptOptions.map(d=>`<option ${d===curDept?'selected':''}>${d}</option>`).join('')}
              </select>
              <button class="btn" onclick="exportUsersCSV(curDeptReal())">Xuất Excel (CSV)</button>
            </div>
          </div>
          <table class="table mt-2">
            <thead><tr><th>Tên</th><th>Email</th><th>Vai trò</th><th>Phòng ban</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              ${filtered.map(u=>`<tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>${u.role==='admin'?'Quản trị':'Nhân viên'}</td>
                <td>${u.dept||''}</td>
                <td>${u.active?'<span class="badge ok">Hoạt động</span>':'<span class="badge warn">Khoá</span>'}</td>
                <td class="flex">
                  <button class="btn" onclick="openEditUser('${u.id}')">Sửa</button>
                  <button class="btn warn" onclick="toggleActive('${u.id}')">${u.active?'Khoá':'Mở khoá'}</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div></div>
        <div class="col-4"><div class="card">
          <h3>Thêm nhân viên</h3>
          <form class="form" onsubmit="return onCreateUser(event)">
            <div><label class="label">Họ tên</label><input class="input" id="u_name" required></div>
            <div><label class="label">Email</label><input class="input" id="u_email" type="email" required></div>
            <div><label class="label">Vai trò</label>
              <select id="u_role" class="input">
                <option value="employee">Nhân viên</option>
                <option value="admin">Quản trị</option>
              </select></div>
            <div><label class="label">Phòng ban</label>
              <select id="u_dept" class="input">
                ${Departments.map(d=>`<option>${d}</option>`).join('')}
              </select>
            </div>
            <div><label class="label">Mật khẩu tạm</label><input class="input" id="u_pass" value="123456"></div>
            <div class="actions"><button class="btn primary">Tạo</button></div>
          </form>
        </div></div>
      </div>`;
  },
  tasks(){
    const me=Auth.me();
    const users=DB.users();
    const deptOptions = ['Tất cả'].concat(Departments);
    const curDept = window._deptFilterTasks||'Tất cả';
    return `
      <div class="grid">
        <div class="col-8">
          <div class="card">
            <div class="flex-between">
              <h3>Danh sách công việc</h3>
              <div class="toolbar">
                <select class="input" onchange="setDeptFilterTasks(this.value)">
                  ${deptOptions.map(d=>`<option ${d===curDept?'selected':''}>${d}</option>`).join('')}
                </select>
                <button class="btn" onclick="exportTasksCSV(curDeptRealTasks())">Xuất Excel (CSV)</button>
              </div>
            </div>
            ${tableTasks(me, curDept)}
          </div>
        </div>
        <div class="col-4">
          <div class="card">
            <h3>${me.role===Roles.ADMIN?'Giao việc mới':'Tạo việc cá nhân'}</h3>
            <form class="form" onsubmit="return onCreateTask(event)">
              <div><label class="label">Tiêu đề</label><input id="t_title" class="input" required></div>
              <div><label class="label">Mô tả</label><textarea id="t_desc" class="input" rows="3"></textarea></div>
              <div class="row">
                <div><label class="label">Hạn</label><input id="t_due" class="input" type="date" required></div>
                <div><label class="label">Giao cho</label>
                  ${me.role===Roles.ADMIN?`<select id="t_assignee" class="input">
                    ${users.filter(u=>u.active).map(u=>`<option value="${u.id}">${u.name} — ${u.dept}</option>`).join('')}
                  </select>`:`<input class="input" value="${me.name}" disabled><input id="t_assignee" type="hidden" value="${me.id}">`}
                </div>
              </div>
              <div class="actions"><button class="btn primary">Lưu</button></div>
            </form>
          </div>
        </div>
      </div>`;
  },
  attendance(){
    const me=Auth.me();
    const users = DB.users();
    const deptOptions = ['Tất cả'].concat(Departments);
    const curDept = window._deptFilterAtt||'Tất cả';
    const att = DB.attendance();
    const entriesRaw = me.role===Roles.ADMIN ? att : att.filter(a=>a.userId===me.id);
    const entries = curDept==='Tất cả'? entriesRaw : entriesRaw.filter(e=>{ const u=users.find(x=>x.id===e.userId); return u && u.dept===curDept; });
    return `
      <div class="card">
        <div class="flex-between">
          <h3>Chấm công</h3>
          <div class="toolbar">
            <select class="input" onchange="setDeptFilterAtt(this.value)">
              ${deptOptions.map(d=>`<option ${d===curDept?'selected':''}>${d}</option>`).join('')}
            </select>
            <button class="btn" onclick="doCheckin()">Check-in (ghi tọa độ)</button>
            <button class="btn" onclick="doCheckout()">Check-out</button>
            <button class="btn" onclick="exportAttendanceCSV(curDeptRealAtt())">Xuất Excel (CSV)</button>
            <button class="btn" onclick="exportJSON('attendance', DB.attendance())">Xuất JSON</button>
          </div>
        </div>
        <table class="table mt-2">
          <thead><tr><th>Nhân viên</th><th>Phòng ban</th><th>Ngày</th><th>Check-in</th><th>Check-out</th><th>Tọa độ</th></tr></thead>
          <tbody>
            ${entries.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{
              const u = users.find(x=>x.id===e.userId);
              const pos = (e.lat && e.lng)? `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)} ${gmapLink(e.lat, e.lng, 'Bản đồ')}`: '—';
              return `<tr>
                <td>${u?u.name:'?'}</td>
                <td>${u?u.dept:''}</td>
                <td>${new Date(e.date).toLocaleDateString()}</td>
                <td>${e.checkIn?new Date(e.checkIn).toLocaleTimeString():'—'}</td>
                <td>${e.checkOut?new Date(e.checkOut).toLocaleTimeString():'—'}</td>
                <td>${pos}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  },
  admin(){
    const me=Auth.me(); if(me.role!==Roles.ADMIN) return View.denied();
    const users=DB.users();
    const att=DB.attendance();
    const tasks=DB.tasks();
    const activeCount = users.filter(u=>u.active).length;
    const doneCount = tasks.filter(t=>t.status==='done').length;
    return `
      <div class="grid">
        <div class="col-12"><div class="card"><h3>Quản trị hệ thống</h3></div></div>
        <div class="col-4"><div class="card kpi"><div><div class="help">Tổng tài khoản</div><strong>${users.length}</strong></div><a class="btn" href="#/employees">Quản lý</a></div></div>
        <div class="col-4"><div class="card kpi"><div><div class="help">Đang hoạt động</div><strong>${activeCount}</strong></div><span class="badge ok">OK</span></div></div>
        <div class="col-4"><div class="card kpi"><div><div class="help">Công việc hoàn tất</div><strong>${doneCount}</strong></div><a class="btn" href="#/tasks">Xem</a></div></div>
        <div class="col-12"><div class="card">
          <h3>Công cụ dữ liệu</h3>
          <div class="row">
            <div>
              <div class="help">Sao lưu toàn bộ (users, tasks, attendance)</div>
              <button class="btn" onclick="exportAll()">Tải về JSON</button>
            </div>
            <div>
              <div class="help">Khôi phục từ JSON</div>
              <input id="importFile" type="file" accept="application/json" class="input" onchange="importAll(event)">
            </div>
          </div>
        </div></div>
      </div>`;
  },
  profile(){
    const me=Auth.me();
    return `
      <div class="card">
        <h3>Hồ sơ cá nhân</h3>
        <form class="form" onsubmit="return onUpdateProfile(event)">
          <div class="row">
            <div><label class="label">Họ tên</label><input id="p_name" class="input" value="${me.name}" required></div>
            <div><label class="label">Email</label><input id="p_email" class="input" value="${me.email}" disabled></div>
          </div>
          <div class="row">
            <div><label class="label">Mật khẩu mới</label><input id="p_pass" class="input" type="password" placeholder="Để trống nếu không đổi"></div>
            <div><label class="label">Vai trò</label><input class="input" value="${me.role==='admin'?'Quản trị':'Nhân viên'}" disabled></div>
          </div>
          <div class="actions"><button class="btn primary">Lưu</button></div>
        </form>
      </div>`;
  },
  //payroll
  payroll() {
  const me = Auth.me(); if (!me || me.role !== Roles.ADMIN) return View.denied();

  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = window._payrollStart || first.toISOString().slice(0,10);
  const end   = window._payrollEnd   || now.toISOString().slice(0,10);

  const depts = ['Tất cả', ...Departments];
  const dept  = window._payrollDept || 'Tất cả';

  const { rows, summary } = computePayroll({
    start, end, dept: (dept === 'Tất cả' ? null : dept)
  });

  function rowHTML(r) {
    return `<tr>
      <td><strong>${r.name}</strong><div class="help">${r.dept}</div></td>
      <td class="right">${r.days}</td>
      <td class="right">${r.stdHours}</td>
      <td class="right">${r.otHours}</td>
      <td class="right">${r.baseSalary.toLocaleString()}</td>
      <td class="right">${r.hourlyRate.toLocaleString()}</td>
      <td class="right">${r.otMultiplier}</td>
      <td class="right">${r.allowance.toLocaleString()}</td>
      <td class="right">${r.deduction.toLocaleString()}</td>
      <td class="right">${r.payStd.toLocaleString()}</td>
      <td class="right">${r.payOT.toLocaleString()}</td>
      <td class="right"><strong>${r.total.toLocaleString()}</strong></td>
      <td><button class="btn small" onclick="editPayrollSetting('${r.userId}')">Cấu hình</button></td>
    </tr>`;
  }

  return `
    <div class="card">
      <div class="flex-between">
        <h3>Tính lương</h3>
        <div class="toolbar">
          <label class="label">Từ ngày</label>
          <input type="date" class="input" value="${start}" onchange="window._payrollStart=this.value; render();">
          <label class="label">Đến ngày</label>
          <input type="date" class="input" value="${end}" onchange="window._payrollEnd=this.value; render();">
          <select class="input" onchange="window._payrollDept=this.value; render();">
            ${depts.map(d => `<option ${d===dept?'selected':''}>${d}</option>`).join('')}
          </select>
          <button class="btn" onclick="exportPayrollCSVCurrent()">Xuất Excel (CSV)</button>
          <button class="btn primary" onclick="saveCurrentPayrollRun()">Chốt lương</button>
        </div>
      </div>

      <table class="table mt-2">
        <thead>
          <tr>
            <th>Nhân viên</th><th class="right">Ngày công</th><th class="right">Giờ chuẩn</th><th class="right">Giờ OT</th>
            <th class="right">Lương cơ bản</th><th class="right">Lương giờ</th><th class="right">HS OT</th>
            <th class="right">Phụ cấp</th><th class="right">Khấu trừ</th>
            <th class="right">Tiền giờ</th><th class="right">Tiền OT</th><th class="right">Tổng</th><th></th>
          </tr>
        </thead>
        <tbody>${rows.map(rowHTML).join('')}</tbody>
        <tfoot>
          <tr>
            <th>Tổng (${rows.length} NV)</th>
            <th class="right">—</th>
            <th class="right">${summary.stdHours}</th>
            <th class="right">${summary.otHours}</th>
            <th colspan="7"></th>
            <th class="right"><strong>${summary.total.toLocaleString()}</strong></th>
            <th></th>
          </tr>
        </tfoot>
      </table>

      <div class="help mt-2">* 8h/ngày là giờ chuẩn, vượt 8h là OT (nhân hệ số).</div>
    </div>`;
},
//AI

  ai() {
  const me = Auth.me();
  if (!me || me.role !== Roles.ADMIN) return View.denied();
  const model = AIConf.model();
  const base = AIConf.base();

  return `
    <div class="grid ai-v2">
      <div class="col-12">
        <div class="card chatbox-v2">
          <div class="flex-between mb-2">
            <h3>🤖 Trợ lý AI Thành Đô</h3>
            <div>
              <button class="btn icon" title="Cài đặt" onclick="toggleAISettings()">
                ⚙️
              </button>
            </div>
          </div>
          <div id="chatlog" class="chatlog-v2"></div>
          <form class="form" onsubmit="sendAIMessageRealtime(); return false;">
            <textarea id="ai_input" class="input chatinput" rows="3"
              placeholder="Hỏi về KPI, nhân viên, chấm công..."></textarea>
            <div class="chat-actions">
              <button class="btn" type="button" onclick="insertQuickPrompt()">📊 Phân tích hệ thống</button>
              <button class="btn" type="button" onclick="insertDataset('users')">👥 Nhân viên</button>
              <button class="btn" type="button" onclick="insertDataset('tasks')">🗂 Công việc</button>
              <button class="btn" type="button" onclick="insertDataset('attendance')">🕒 Chấm công</button>
              <button class="btn" type="button" onclick="insertDataset('kpi')">📈 KPI</button>
              <button class="btn primary">💬 Gửi</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Popup cài đặt ẩn -->
      <div id="aiSettings" class="ai-settings hidden">
        <div class="card popup">
          <div class="flex-between mb-2">
            <h3>⚙️ Cấu hình & Tiện ích</h3>
            <button class="btn danger small" onclick="toggleAISettings()">Đóng ✖</button>
          </div>
          <div class="stack">
            <label class="label">Ollama URL</label>
            <input id="ai_base" class="input" value="${base}">
            <label class="label">Model</label>
            <input id="ai_model" class="input" value="${model}">
            <div class="row mt-2">
              <button class="btn" onclick="saveAIConf()">Lưu</button>
              <button class="btn warn" type="button" onclick="clearChat()">🧹 Xóa hội thoại</button>
              <button class="btn" type="button" onclick="exportChatLog()">⬇️ Xuất log</button>
            </div>
          </div>
          <div class="mt-3 help">
            <b>Gợi ý:</b><br>
            - “Phân tích KPI theo phòng ban tuần này.”<br>
            - “Tìm nhân viên chưa check-in 3 ngày gần nhất.”<br>
            - “Thống kê công việc gần deadline.”<br>
          </div>
        </div>
      </div>
    </div>`;
},

//
  denied(){ return `<div class="card"><h3>⚠️ Không có quyền truy cập</h3><p>Bạn cần quyền Quản trị để vào mục này.</p></div>`; }
};

function curDeptReal(){ return (window._deptFilter && window._deptFilter!=='Tất cả')? window._deptFilter : null; }
function setDeptFilter(v){ window._deptFilter=v; render(); }
function curDeptRealTasks(){ return (window._deptFilterTasks && window._deptFilterTasks!=='Tất cả')? window._deptFilterTasks : null; }
function setDeptFilterTasks(v){ window._deptFilterTasks=v; render(); }
function curDeptRealAtt(){ return (window._deptFilterAtt && window._deptFilterAtt!=='Tất cả')? window._deptFilterAtt : null; }
function setDeptFilterAtt(v){ window._deptFilterAtt=v; render(); }

function tableTasks(me, deptFilter){
  const users = DB.users();
  let tasks = me.role===Roles.ADMIN ? DB.tasks() : DB.tasks().filter(t=>t.assignedTo===me.id);
  if(deptFilter && deptFilter!=='Tất cả'){
    tasks = tasks.filter(t=>{ const u=users.find(x=>x.id===t.assignedTo); return u && u.dept===deptFilter; });
  }
  if(!tasks.length) return '<div class="help">Chưa có công việc.</div>';
  return `
    <table class="table mt-2">
      <thead><tr><th>Tên việc</th><th>Người nhận</th><th>Phòng ban</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody>
        ${tasks.sort((a,b)=> (a.status>b.status?1:-1)).map(t=>{
          const u = users.find(x=>x.id===t.assignedTo);
          return `<tr>
            <td>${t.title}<br/><small class="help">${t.desc||''}</small></td>
            <td>${u?u.name:'?'}</td>
            <td>${u?u.dept:''}</td>
            <td>${t.due? new Date(t.due).toLocaleDateString(): '—'}</td>
            <td>
              <select class="input" onchange="updateTaskStatus('${t.id}', this.value)">
                ${['todo','inprogress','done'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
              </select>
            </td>
            <td class="flex">
              ${me.role===Roles.ADMIN? `<button class="btn" onclick="editTask('${t.id}')">Sửa</button>
              <button class="btn warn" onclick="deleteTask('${t.id}')">Xoá</button>`:''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

// Actions (form handlers)
function onLogin(e){ e.preventDefault();
  const email=document.getElementById('login_email').value.trim();
  const pass=document.getElementById('login_password').value;
  const res = Auth.login(email, pass);
  if(!res.ok){ alert(res.msg); return false; }
  location.hash = '#/dashboard';
  return false;
}

function onCreateUser(e){ e.preventDefault();
  const users=DB.users();
  const u={ id:uid(), name:document.getElementById('u_name').value.trim(), email:document.getElementById('u_email').value.trim(), role:document.getElementById('u_role').value, dept:document.getElementById('u_dept').value, password:document.getElementById('u_pass').value, active:true };
  if(users.some(x=>x.email===u.email)) { alert('Email đã tồn tại'); return false; }
  users.push(u); DB.saveUsers(users); alert('Đã tạo tài khoản'); location.reload(); return false;
}

function openEditUser(id){
  const u = DB.users().find(x=>x.id===id); if(!u) return;
  const name = prompt('Cập nhật tên', u.name); if(name===null) return;
  const dept = prompt('Cập nhật phòng ban', u.dept||''); if(dept===null) return;
  const pass = prompt('Đổi mật khẩu (bỏ trống nếu giữ nguyên)', '');
  const list=DB.users().map(x=> x.id===id? { ...x, name: name||x.name, dept: dept||x.dept, password: (pass?pass:x.password) } : x);
  DB.saveUsers(list); alert('Đã cập nhật'); location.reload();
}

function toggleActive(id){ const list=DB.users().map(x=> x.id===id? { ...x, active: !x.active } : x); DB.saveUsers(list); location.reload(); }

function onCreateTask(e){ e.preventDefault();
  const t={ id:uid(), title:document.getElementById('t_title').value.trim(), desc:document.getElementById('t_desc').value.trim(), assignedTo:document.getElementById('t_assignee').value, status:'todo', due:new Date(document.getElementById('t_due').value).toISOString() };
  const tasks=DB.tasks(); tasks.push(t); DB.saveTasks(tasks); alert('Đã tạo công việc'); location.reload(); return false;
}

function updateTaskStatus(id, status){ const list=DB.tasks().map(t=> t.id===id?{...t,status}:t); DB.saveTasks(list); }
function editTask(id){ const t=DB.tasks().find(x=>x.id===id); if(!t) return; const title=prompt('Sửa tiêu đề', t.title); if(title===null) return; const desc=prompt('Sửa mô tả', t.desc||''); const due=prompt('Sửa hạn (YYYY-MM-DD)', t.due? t.due.slice(0,10):''); const list=DB.tasks().map(x=> x.id===id?{...x,title,desc,due: due?new Date(due).toISOString():null}:x); DB.saveTasks(list); location.reload(); }
function deleteTask(id){ if(!confirm('Xoá công việc?')) return; DB.saveTasks(DB.tasks().filter(t=>t.id!==id)); location.reload(); }
//
function editPayrollSetting(userId) {
  const map = DB.payrollSettings();
  const cur = map[userId] || { baseSalary:10000000, hourlyRate:40000, otMultiplier:1.5, allowance:0, deduction:0 };
  const base = prompt('Lương cơ bản (VND)', cur.baseSalary);      if (base === null) return;
  const rate = prompt('Lương giờ (VND/h)', cur.hourlyRate);       if (rate === null) return;
  const otm  = prompt('Hệ số OT (vd 1.5)', cur.otMultiplier);     if (otm === null) return;
  const plus = prompt('Phụ cấp (VND)', cur.allowance);            if (plus === null) return;
  const minus= prompt('Khấu trừ (VND)', cur.deduction);           if (minus === null) return;

  map[userId] = {
    baseSalary: Number(base)||0,
    hourlyRate: Number(rate)||0,
    otMultiplier: Number(otm)||1,
    allowance: Number(plus)||0,
    deduction: Number(minus)||0
  };
  DB.savePayrollSettings(map);
  alert('Đã lưu cấu hình lương'); render();
}

function saveCurrentPayrollRun() {
  const start = window._payrollStart, end = window._payrollEnd;
  const dept  = window._payrollDept || 'Tất cả';
  if (!start || !end) { alert('Chọn khoảng ngày trước khi chốt'); return; }

  const { rows, summary } = computePayroll({ start, end, dept: (dept==='Tất cả'?null:dept) });
  const title = prompt('Tên kỳ lương', `Kỳ ${new Date(start).toLocaleDateString()} - ${new Date(end).toLocaleDateString()} (${dept})`);
  if (title === null) return;

  savePayrollRun({ title, start, end, dept: (dept==='Tất cả'?null:dept), rows, summary });
  alert('Đã lưu kỳ lương');
}
//
// ===== Chấm công ghi tọa độ GPS =====
function getPosition(){
  return new Promise((resolve,reject)=>{
    if(!('geolocation' in navigator)) return reject(new Error('Trình duyệt không hỗ trợ Geolocation'));
    navigator.geolocation.getCurrentPosition(pos=>{
      resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    }, err=>{
      reject(err);
    }, { enableHighAccuracy:true, timeout:10000, maximumAge:0 });
  });
}

async function doCheckin(){ const me=Auth.me(); if(!me){ alert('Hãy đăng nhập'); return; }
  let coords=null;
  try{ coords=await getPosition(); }catch(e){ if(!confirm('Không lấy được vị trí. Vẫn tiếp tục check-in?')) return; }
  const att=DB.attendance(); const today=todayISO(); let row=att.find(a=>a.userId===me.id && a.date===today);
  if(row && row.checkIn){ alert('Hôm nay đã check-in'); return; }
  if(!row){ row={ id:uid(), userId:me.id, date:today, checkIn:nowISO(), checkOut:null, lat:coords?.lat, lng:coords?.lng }; att.push(row); }
  else{ row.checkIn=nowISO(); if(coords){ row.lat=coords.lat; row.lng=coords.lng; } }
  DB.saveAttendance(att); alert('Đã check-in'); render();
}
async function doCheckout(){ const me=Auth.me(); if(!me){ alert('Hãy đăng nhập'); return; }
  let coords=null; try{ coords=await getPosition(); }catch(_){ /* checkout vẫn cho phép */ }
  const att=DB.attendance(); const today=todayISO(); let row=att.find(a=>a.userId===me.id && a.date===today);
  if(!row || !row.checkIn){ alert('Bạn chưa check-in hôm nay'); return; }
  if(row.checkOut){ alert('Đã check-out rồi'); return; }
  row.checkOut=nowISO(); if(coords){ row.lat=coords.lat; row.lng=coords.lng; }
  DB.saveAttendance(att); alert('Đã check-out'); render();
}

function onUpdateProfile(e){ e.preventDefault();
  const me=Auth.me();
  const name=document.getElementById('p_name').value.trim();
  const pass=document.getElementById('p_pass').value;
  const list=DB.users().map(u=> u.id===me.id? { ...u, name, password: pass?pass:u.password }:u);
  DB.saveUsers(list); alert('Đã lưu'); render(); return false;
}

// Export/Import JSON
function exportJSON(name, data){ const blob=new Blob([JSON.stringify(data, null, 2)], {type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`${name}.json`; a.click(); URL.revokeObjectURL(url); }
function exportAll(){ exportJSON('thanhdo_backup', { users:DB.users(), tasks:DB.tasks(), attendance:DB.attendance() }); }
function importAll(e){ const file=e.target.files[0]; if(!file) return; const fr=new FileReader(); fr.onload=ev=>{ try{ const obj=JSON.parse(ev.target.result); if(obj.users&&obj.tasks&&obj.attendance){ DB.saveUsers(obj.users); DB.saveTasks(obj.tasks); DB.saveAttendance(obj.attendance); alert('Khôi phục xong'); location.reload(); } else { alert('File không đúng định dạng'); } }catch(err){ alert('Không đọc được file'); } }; fr.readAsText(file); }
function toggleAISettings() {
  const el = document.getElementById('aiSettings');
  if (!el) return;
  el.classList.toggle('hidden');
}
function maybeShowDataFreshnessNotice() {
  if (window.__DATA_DIRTY__) {
    renderChatMessage('bot',
      `<div class="badge warn">Dữ liệu vừa thay đổi. Mọi phân tích sau đây đã dùng bản mới nhất.</div>`);
    window.__DATA_DIRTY__ = false;
  }
}
