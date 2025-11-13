// ======================================================
// assets/js/ai_skills.js
// "Huấn luyện" AI theo hướng tác vụ: registry kỹ năng + executor
// ======================================================

/**
 * Chuẩn JSON kế hoạch mà AI phải xuất:
 * {
 *   "intent": "string (mô tả ngắn)",
 *   "steps": [
 *     {"tool":"tool_name","args":{...}},
 *     ...
 *   ]
 * }
 *
 * Kết quả thực thi sẽ là mảng [{tool, args, result}, ...]
 */

// ---------- KỸ NĂNG / CÔNG CỤ SẴN CÓ ----------
const AISkills = [
  {
    name: "list_employees",
    title: "Liệt kê nhân viên",
    description: "Trả danh sách nhân viên (lọc theo phòng ban nếu có).",
    schema: { dept: "string|null" },
    run: ({ dept }) => {
      const users = DB.users().filter(u => u.active !== false);
      const filtered = dept ? users.filter(u => (u.dept||'') === dept) : users;
      return filtered.map(u => ({ id:u.id, name:u.name, email:u.email, dept:u.dept||'', role:u.role, active:u.active }));
    }
  },
  {
    name: "list_tasks",
    title: "Liệt kê công việc",
    description: "Trả danh sách công việc, có thể lọc theo phòng ban hoặc trạng thái.",
    schema: { dept: "string|null", status: "todo|inprogress|done|null" },
    run: ({ dept, status }) => {
      const users = DB.users();
      let tasks = DB.tasks();
      if (dept) tasks = tasks.filter(t => { const u=users.find(x=>x.id===t.assignedTo); return u && (u.dept||'')===dept; });
      if (status) tasks = tasks.filter(t => t.status === status);
      return tasks.map(t => {
        const u = users.find(x => x.id===t.assignedTo);
        return { id:t.id, title:t.title, status:t.status, due:t.due, assignee:u?u.name:'?', dept:u?u.dept:'' };
      });
    }
  },
  {
    name: "tasks_near_deadline",
    title: "Công việc gần deadline",
    description: "Lấy top công việc đến hạn trong N ngày (mặc định 7).",
    schema: { days: "number|null" },
    run: ({ days }) => {
      const n = Number(days||7);
      const now = Date.now();
      const edge = now + n*24*3600*1000;
      const users = DB.users();
      return DB.tasks()
        .filter(t => t.due && new Date(t.due).getTime()<=edge && t.status!=='done')
        .sort((a,b)=> new Date(a.due)-new Date(b.due))
        .map(t => {
          const u=users.find(x=>x.id===t.assignedTo);
          return { id:t.id, title:t.title, due:t.due, assignee:u?u.name:'?', dept:u?u.dept:'', status:t.status };
        });
    }
  },
  {
    name: "attendance_anomalies",
    title: "Bất thường chấm công",
    description: "Tìm ngày không check-in/out hoặc thời lượng < 2h trong khoảng ngày.",
    schema: { start: "yyyy-mm-dd|null", end: "yyyy-mm-dd|null", userId: "string|null" },
    run: ({ start, end, userId }) => {
      const S = start ? new Date(start) : new Date(Date.now()-7*24*3600*1000);
      const E = end   ? new Date(end)   : new Date();
      S.setHours(0,0,0,0); E.setHours(23,59,59,999);
      const users = DB.users();
      const att = DB.attendance().filter(a => new Date(a.date)>=S && new Date(a.date)<=E);
      const within = userId ? att.filter(a=>a.userId===userId) : att;

      const issues = [];
      within.forEach(a=>{
        const h = (a.checkIn && a.checkOut) ? (new Date(a.checkOut)-new Date(a.checkIn))/36e5 : 0;
        if (!a.checkIn || !a.checkOut || h<2) {
          const u = users.find(x=>x.id===a.userId);
          issues.push({
            user: u?u.name:'?', dept:u?u.dept:'',
            date: a.date, checkIn: a.checkIn, checkOut: a.checkOut,
            hours: +h.toFixed(2)
          });
        }
      });
      return issues;
    }
  },
  {
    name: "kpi_overview",
    title: "Tóm tắt KPI",
    description: "Tổng hợp số NV, số task, % hoàn thành theo toàn cty.",
    schema: {},
    run: () => {
      const users = DB.users().filter(u=>u.active!==false);
      const tasks = DB.tasks();
      const done  = tasks.filter(t=>t.status==='done').length;
      const pct = tasks.length? ((done/tasks.length)*100).toFixed(1) : '0.0';
      return {
        employees: users.length,
        tasks: tasks.length,
        done,
        progressPct: pct
      };
    }
  },
  {
    name: "compute_payroll",
    title: "Tính lương",
    description: "Tính lương theo khoảng ngày & phòng ban (nếu có).",
    schema: { start: "yyyy-mm-dd", end: "yyyy-mm-dd", dept: "string|null" },
    run: ({ start, end, dept }) => {
      const { rows, summary } = computePayroll({ start, end, dept: dept||null });
      return { rows, summary };
    }
  },
  {
    name: "export_csv",
    title: "Xuất CSV",
    description: "Xuất CSV theo loại dữ liệu: users|tasks|attendance|payroll.",
    schema: { type: "users|tasks|attendance|payroll", payload: "any|null", start:"string|null", end:"string|null", dept:"string|null" },
    run: ({ type, payload, start, end, dept }) => {
      switch (type) {
        case 'users': exportUsersCSV(null); break;
        case 'tasks': exportTasksCSV(null); break;
        case 'attendance': exportAttendanceCSV(null); break;
        case 'payroll':
          if (!payload) {
            const label = dept||'Tất cả';
            const { rows } = computePayroll({ start, end, dept: dept||null });
            exportPayrollCSV(rows, start, end, label);
          } else {
            exportPayrollCSV(payload.rows||payload, start, end, dept||'Tất cả');
          }
          break;
      }
      return { ok:true, message:`Đã xuất CSV ${type}` };
    }
  },
  {
    name: "map_link",
    title: "Link bản đồ Google",
    description: "Tạo link Google Maps từ lat,lng.",
    schema: { lat:"number", lng:"number" },
    run: ({ lat, lng }) => ({ link: gmapLink(lat,lng,'Mở bản đồ'), lat, lng })
  }
];

// ---------- TRỢ LÝ: prompt dạy AI chọn kỹ năng ----------
function aiToolingSystemPrompt() {
  return [
    "Bạn là Trợ lý AI nội bộ của Công ty Thành Đô.",
    "PHẠM VI: chỉ trả lời các chủ đề liên quan đến dữ liệu và nghiệp vụ của hệ thống này: nhân viên (users), công việc (tasks), chấm công (attendance/GPS), tính lương (payroll), KPI/tổng hợp, xuất CSV, bản đồ.",
    "TUYỆT ĐỐI không trả lời nội dung ngoài phạm vi trên; nếu câu hỏi ngoài phạm vi, hãy trả JSON:",
    '{"intent":"out_of_scope","steps":[]}',

    "QUY TẮC:",
    "- Với câu hỏi trong phạm vi dữ liệu, BẮT BUỘC lập kế hoạch dùng tools để truy xuất số liệu (không suy đoán).",
    '- Chỉ trả về MỘT JSON kế hoạch theo mẫu: {"intent":"...","steps":[{"tool":"...","args":{...}}, ...]}.',
    "- Nếu chỉ là chào hỏi/hướng dẫn cách dùng, có thể steps=[].",
    "Các tools sẵn có:",
    ...AISkills.map(s=>`- ${s.name}: ${s.description} Args: ${JSON.stringify(s.schema)}`),

    "Ví dụ hợp lệ:",
    'Yêu cầu: "Ai chưa check-in 3 ngày gần nhất?"',
    '{"intent":"find_absence","steps":[{"tool":"attendance_anomalies","args":{"start":"<today-3>","end":"<today>"}}]}',
    'Yêu cầu: "Xuất bảng lương tháng này cho phòng Kỹ thuật"',
    '{"intent":"export_payroll","steps":[{"tool":"compute_payroll","args":{"start":"<firstOfMonth>","end":"<today>","dept":"Kỹ thuật"}},{"tool":"export_csv","args":{"type":"payroll"}}]}'
  ].join("\n");
}



// ---------- EXECUTOR: chạy kế hoạch do AI trả về ----------
async function runSkillPlan(plan) {
  const results = [];
  for (const step of (plan.steps||[])) {
    const tool = AISkills.find(t => t.name === step.tool);
    if (!tool) { results.push({ tool: step.tool, error: 'Tool not found' }); continue; }
    try {
      const out = await Promise.resolve(tool.run(step.args||{}));
      results.push({ tool: tool.name, args: step.args||{}, result: out });
    } catch (e) {
      results.push({ tool: tool.name, args: step.args||{}, error: e?.message||String(e) });
    }
  }
  return results;
}
