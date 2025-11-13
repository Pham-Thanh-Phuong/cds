// App bootstrap
(function(){
  // user menu toggle
  const btnUser = document.getElementById('btnUser');
  const wrap = document.getElementById('userMenuWrap');
  btnUser.addEventListener('click', ()=>{
    if(!Auth.me()) { location.hash = '#/login'; return; }
    wrap.classList.toggle('hidden');
    mountUserMenu();
  });
  document.addEventListener('click', (e)=>{
    if(!wrap.contains(e.target) && e.target!==btnUser) wrap.classList.add('hidden');
  });
  document.getElementById('btnTheme').addEventListener('click', toggleTheme);

  // default route
  if(!location.hash) location.hash = Auth.me()? '#/dashboard' : '#/login';
  render();
})();
window.addEventListener('storage', (e) => {
  // Nếu bất kỳ key dữ liệu thay đổi => đánh dấu và gợi ý refresh UI/AI
  if (['users','tasks','attendance','payroll_settings','payroll_runs'].includes(e.key)) {
    window.__DATA_DIRTY__ = true;
    console.log('[INFO] Dữ liệu vừa thay đổi từ tab khác. Realtime sẽ dùng bản mới.');
  }
});
