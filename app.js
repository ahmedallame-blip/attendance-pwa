const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwiCdx3RZWje849mf1yntoLa65Nek6roV4ehn0tJkERtpJr9LEB2_wUSIrC3eKRjSbfCQ/exec";
let currentUser = null;

/* -------------------- أدوات عامة -------------------- */

function qs(id) {
  return document.getElementById(id);
}

function setMsg(text) {
  qs("msg").innerText = text;
}

function saveSession(data) {
  localStorage.setItem("attendance_session", JSON.stringify(data));
}

function getSession() {
  const raw = localStorage.getItem("attendance_session");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("attendance_session");
}

function getOfflineLogs() {
  const raw = localStorage.getItem("offline_logs");
  return raw ? JSON.parse(raw) : [];
}

function saveOfflineLogs(arr) {
  localStorage.setItem("offline_logs", JSON.stringify(arr));
}

function getDeviceId() {
  let id = localStorage.getItem("device_id");
  if (!id) {
    id = "DEV_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    localStorage.setItem("device_id", id);
  }
  return id;
}

/* -------------------- الشبكة -------------------- */

function updateNetwork() {
  const el = qs("networkStatus");

  if (navigator.onLine) {
    el.innerText = "متصل";
    el.className = "online";
  } else {
    el.innerText = "غير متصل";
    el.className = "offline";
  }
}

window.addEventListener("online", () => {
  updateNetwork();
  syncOffline();
});

window.addEventListener("offline", updateNetwork);

/* -------------------- بداية الصفحة -------------------- */

window.onload = function () {
  updateNetwork();
  registerSW();

  const session = getSession();

  if (session) {
    currentUser = session;
    showDashboard();
    setMsg("تم فتح الجلسة المحفوظة");
  } else {
    setMsg("جاهز للعمل");
  }
};

/* -------------------- Service Worker -------------------- */

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js");
  }
}

/* -------------------- واجهة -------------------- */

function showDashboard() {
  qs("loginBox").classList.add("hidden");
  qs("dashboard").classList.remove("hidden");
  qs("welcome").innerText = "مرحباً " + currentUser.full_name;
}

function showLogin() {
  qs("loginBox").classList.remove("hidden");
  qs("dashboard").classList.add("hidden");
}

/* -------------------- تسجيل الدخول -------------------- */

async function login() {
  const username = qs("username").value.trim();
  const password = qs("password").value.trim();

  if (!username || !password) {
    setMsg("يرجى إدخال اسم المستخدم وكلمة المرور");
    return;
  }

  if (!navigator.onLine) {
    setMsg("لا يوجد إنترنت. استخدم الجلسة المحفوظة سابقاً.");
    return;
  }

  setMsg("جاري تسجيل الدخول...");

  try {
    const payload = {
      action: "login",
      username,
      password,
      device_id: getDeviceId(),
      browser: navigator.userAgent,
      platform: navigator.platform
    };

    const res = await fetch(SCRIPT_URL, {
  method: "POST",
  mode: "no-cors",
  headers: {
    "Content-Type": "text/plain;charset=utf-8"
  },
  body: JSON.stringify(payload)
});

    const data = await res.json();

    if (data.success) {
      currentUser = data.data;
      saveSession(currentUser);
      showDashboard();
      setMsg("تم تسجيل الدخول بنجاح");
      syncOffline();
    } else {
      setMsg(data.message);
    }

  } catch (err) {
    setMsg("تعذر الاتصال بالسيرفر");
  }
}

/* -------------------- تسجيل الحركات -------------------- */

function checkIn() {
  sendAttendance("check_in");
}

function checkOut() {
  sendAttendance("check_out");
}

function extraCheck() {
  sendAttendance("extra_check");
}

function sendAttendance(type) {
  if (!currentUser) {
    setMsg("يرجى تسجيل الدخول");
    return;
  }

  if (!navigator.geolocation) {
    setMsg("الجهاز لا يدعم الموقع");
    return;
  }

  setMsg("جاري جلب الموقع...");

  navigator.geolocation.getCurrentPosition(
    pos => {

      const payload = {
        action: "attendance",
        action_type: type,
        user_id: currentUser.user_id,
        employee_id: currentUser.employee_id,
        full_name: currentUser.full_name,
        department: currentUser.department,
        site_id: currentUser.site_id,
        allowed_lat: currentUser.allowed_lat,
        allowed_lng: currentUser.allowed_lng,
        allowed_radius: currentUser.allowed_radius,
        device_id: getDeviceId(),
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        client_time: new Date().toISOString()
      };

      if (!navigator.onLine) {
        const logs = getOfflineLogs();
        logs.push(payload);
        saveOfflineLogs(logs);

        setMsg("تم حفظ العملية أوفلاين\nسيتم الإرسال عند رجوع النت");
        return;
      }

      sendToServer(payload);
    },
    err => {
      setMsg("تعذر جلب الموقع");
    },
    {
      enableHighAccuracy: true,
      timeout: 15000
    }
  );
}

/* -------------------- إرسال للسيرفر -------------------- */

async function sendToServer(payload) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      setMsg("تم إرسال العملية بنجاح");
    } else {
      setMsg(data.message);
    }

  } catch (err) {
    const logs = getOfflineLogs();
    logs.push(payload);
    saveOfflineLogs(logs);

    setMsg("تعذر الإرسال، تم حفظ العملية أوفلاين");
  }
}

/* -------------------- مزامنة الأوفلاين -------------------- */

async function syncOffline() {
  if (!navigator.onLine) return;

  const logs = getOfflineLogs();

  if (!logs.length) return;

  setMsg("جاري مزامنة السجلات المؤجلة...");

  for (let item of logs) {
    await sendToServer(item);
  }

  saveOfflineLogs([]);
  setMsg("تمت مزامنة السجلات بنجاح");
}

/* -------------------- تسجيل الخروج -------------------- */

function logout() {
  clearSession();
  currentUser = null;
  showLogin();
  setMsg("تم تسجيل الخروج");
}
