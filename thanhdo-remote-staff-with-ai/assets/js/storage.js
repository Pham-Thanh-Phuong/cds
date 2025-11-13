// Simple localStorage wrapper with namespacing
const TD_NS = 'td_staff_mgr_v1';
const Store = {
  get(key, fallback=null){
    try{ return JSON.parse(localStorage.getItem(`${TD_NS}:${key}`)) ?? fallback; }catch(_){ return fallback; }
  },
  set(key, value){ localStorage.setItem(`${TD_NS}:${key}`, JSON.stringify(value)); },
  del(key){ localStorage.removeItem(`${TD_NS}:${key}`); },
  has(key){ return localStorage.getItem(`${TD_NS}:${key}`) !== null; }
};
