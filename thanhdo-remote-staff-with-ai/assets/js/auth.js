// Authentication + RBAC
const Auth = {
  login(email, password){
    const u = DB.users().find(x=>x.email===email && x.active!==false);
    if(!u) return { ok:false, msg:'Email không tồn tại hoặc tài khoản bị khoá' };
    if(u.password!==password) return { ok:false, msg:'Mật khẩu không đúng' };
    const session = { userId: u.id, ts: nowISO() };
    DB.saveSession(session);
    return { ok:true, user:u };
  },
  logout(){ DB.saveSession(null); },
  me(){ const s=DB.session(); if(!s) return null; return DB.users().find(u=>u.id===s.userId)||null; },
  require(role){
    const me=this.me();
    if(!me) return false;
    if(role===Roles.ADMIN) return me.role===Roles.ADMIN;
    return true;
  }
};
