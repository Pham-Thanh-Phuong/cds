// Seed data + model helpers (Departments + helpers)
const Roles = { ADMIN: 'admin', EMP: 'employee' };
const Departments = ['Kinh doanh','Kỹ thuật','Nhân sự','Kế toán'];

function uid(){ return Math.random().toString(36).slice(2, 10); }
function todayISO(){ const d=new Date(); d.setHours(0,0,0,0); return d.toISOString(); }
function nowISO(){ return new Date().toISOString(); }

function initSeed(){
  if(!Store.has('users')){
    const users = [
      { id: uid(), email:'admin@thanhdo.com', name:'Quản trị hệ thống', role:Roles.ADMIN, dept:'Nhân sự', active:true, password:'admin123' },
      { id: uid(), email:'nhanviena@thanhdo.com', name:'Nhân viên A', role:Roles.EMP, dept:'Kỹ thuật', active:true, password:'123456' },
      { id: uid(), email:'nhanvienb@thanhdo.com', name:'Nhân viên B', role:Roles.EMP, dept:'Kinh doanh', active:true, password:'123456' },
    ];
    const tasks = [
      { id: uid(), title:'Chuẩn bị báo cáo tuần', desc:'Tổng hợp KPI tuần này', assignedTo: users[1].id, status:'todo', due: new Date(Date.now()+86400000).toISOString() },
      { id: uid(), title:'Kiểm tra dữ liệu chấm công', desc:'Đối soát log check-in/out', assignedTo: users[2].id, status:'inprogress', due: new Date(Date.now()+2*86400000).toISOString() }
    ];
    Store.set('users', users);
    Store.set('tasks', tasks);
    Store.set('attendance', []);
    Store.set('session', null);
  }
}

const DB = {
  payrollSettings: () => Store.get('payroll_settings', {}),
  savePayrollSettings: (map) => Store.set('payroll_settings', map),

  payrollRuns: () => Store.get('payroll_runs', []),
  savePayrollRuns: (list) => Store.set('payroll_runs', list),

  users(){ return Store.get('users', []); },
  saveUsers(list){ Store.set('users', list); },
  tasks(){ return Store.get('tasks', []); },
  saveTasks(list){ Store.set('tasks', list); },
  attendance(){ return Store.get('attendance', []); },
  saveAttendance(list){ Store.set('attendance', list); },
  session(){ return Store.get('session', null); },
  saveSession(s){ Store.set('session', s); }

};

initSeed();
// NEW: payroll settings mặc định + kho kỳ lương
const payroll_settings = {};
users.forEach(u => {
  payroll_settings[u.id] = {
    baseSalary: u.role === Roles.ADMIN ? 15000000 : 10000000,
    hourlyRate: 40000,
    otMultiplier: 1.5,
    allowance: 500000,
    deduction: 0
  };
});
Store.set('payroll_settings', payroll_settings);
Store.set('payroll_runs', []);
