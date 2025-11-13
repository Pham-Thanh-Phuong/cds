// Thêm route payroll vào object Routes
const Routes = {
  '#/login':      () => View.login(),
  '#/dashboard':  () => (Auth.me() ? View.dashboard()  : redirectLogin()),
  '#/employees':  () => (Auth.me() ? View.employees()  : redirectLogin()),
  '#/tasks':      () => (Auth.me() ? View.tasks()      : redirectLogin()),
  '#/attendance': () => (Auth.me() ? View.attendance() : redirectLogin()),
  '#/ai':         () => (Auth.me() ? View.ai()         : redirectLogin()),
  '#/admin':      () => (Auth.me() ? View.admin()      : redirectLogin()),
  '#/profile':    () => (Auth.me() ? View.profile()    : redirectLogin()),
  '#/payroll':    () => (Auth.me() ? View.payroll()    : redirectLogin()), // <-- NEW
};

function redirectLogin(){ location.hash = '#/login'; return ''; }

function render(){
  renderNavbar();
  mountUserMenu();

  const hash = location.hash || '#/login';
  const viewFn = Routes[hash] || Routes['#/login'];
  const html = viewFn();
  document.getElementById('app').innerHTML = html;

  // mount AI log khi ở tab AI
  if (hash === '#/ai' && typeof window.AILog !== 'undefined') {
    AILog.mount?.();
    AILog.renderLog?.();   // nếu có hàm này
  }
}

window.addEventListener('hashchange', render);
window.addEventListener('load', render);
window.addEventListener('storage', (e) => {
  // Nếu bất kỳ key dữ liệu thay đổi => đánh dấu và gợi ý refresh UI/AI
  if (['users','tasks','attendance','payroll_settings','payroll_runs'].includes(e.key)) {
    window.__DATA_DIRTY__ = true;
    console.log('[INFO] Dữ liệu vừa thay đổi từ tab khác. Realtime sẽ dùng bản mới.');
  }
});
