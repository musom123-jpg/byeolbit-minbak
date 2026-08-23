require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const ADMIN_DIR = path.join(__dirname, 'admin-dashboard');
const ADMIN_COOKIE = 'byeolbit_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간
// 서버가 재시작되면 기존 세션은 모두 무효화됩니다(재로그인 필요) - 의도된 동작입니다.
const SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(String(expiresAt)).digest('hex');
  return `${expiresAt}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [expiresAtStr, sig] = token.split('.');
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !sig || Date.now() > expiresAt) return false;

  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(String(expiresAt)).digest('hex');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  return sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
}

function hasValidSession(req) {
  return verifySessionToken(req.cookies && req.cookies[ADMIN_COOKIE]);
}

// 쿠키 파싱 (별도 패키지 없이 처리)
function cookieParser(req, res, next) {
  const header = req.headers.cookie;
  req.cookies = {};
  if (header) {
    header.split(';').forEach((pair) => {
      const idx = pair.indexOf('=');
      if (idx === -1) return;
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      req.cookies[key] = decodeURIComponent(val);
    });
  }
  next();
}
app.use(cookieParser);

// 로그인 페이지/자체 정적 파일은 인증 없이 접근 가능
function requireAdminPage(req, res, next) {
  if (hasValidSession(req)) return next();
  res.redirect('/booking/admin/login');
}

function requireAdminApi(req, res, next) {
  if (hasValidSession(req)) return next();
  res.status(401).json({ error: '로그인이 필요합니다.' });
}

// 별빛민박 홈페이지(정적 파일)를 루트 경로에서 서빙
app.use(express.static(path.join(__dirname, '..')));

// 관리자 로그인
app.get('/booking/admin/login', (req, res) => {
  if (hasValidSession(req)) return res.redirect('/booking/admin/');
  res.sendFile(path.join(ADMIN_DIR, 'login.html'));
});

app.post('/booking/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  if (!expectedPass) {
    return res.status(500).json({ error: '서버에 ADMIN_PASSWORD가 설정되지 않았습니다.' });
  }

  const userBuf = Buffer.from(String(username || ''));
  const expectedUserBuf = Buffer.from(expectedUser);
  const passBuf = Buffer.from(String(password || ''));
  const expectedPassBuf = Buffer.from(expectedPass);

  const userMatch = userBuf.length === expectedUserBuf.length && crypto.timingSafeEqual(userBuf, expectedUserBuf);
  const passMatch = passBuf.length === expectedPassBuf.length && crypto.timingSafeEqual(passBuf, expectedPassBuf);

  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }

  res.cookie(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: req.hostname !== 'localhost',
    sameSite: 'lax',
    path: '/booking',
    maxAge: SESSION_TTL_MS
  });
  res.json({ ok: true });
});

app.post('/booking/api/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/booking' });
  res.json({ ok: true });
});

// 관리자 예약 스케줄 페이지 (로그인 필요) - public/ 보다 먼저 등록해 접근을 보호합니다
// 참고: strict routing이 꺼져있어 이 경로 하나로 '/booking/admin', '/booking/admin/' 모두 매칭됩니다.
app.get('/booking/admin/', requireAdminPage, (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});
app.get('/booking/admin/schedule', requireAdminPage, (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'schedule.html'));
});
app.get('/booking/admin/rooms', requireAdminPage, (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'rooms.html'));
});
app.get('/booking/admin/gallery', requireAdminPage, (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'gallery.html'));
});
app.use('/booking/api/admin', requireAdminApi, require('./routes/admin'));

// 예약 시스템은 /booking 경로 하위에서 서빙
app.use('/booking', express.static(path.join(__dirname, 'public')));

// 프론트에 업소 기본정보 및 결제 클라이언트 키를 안전하게 전달
app.get('/booking/api/config', (req, res) => {
  res.json({
    businessName: process.env.BUSINESS_NAME || '',
    businessPhone: process.env.BUSINESS_PHONE || '',
    businessAddress: process.env.BUSINESS_ADDRESS || '',
    businessLicenseNo: process.env.BUSINESS_LICENSE_NO || '',
    tossClientKey: process.env.TOSS_CLIENT_KEY || ''
  });
});

app.use('/booking/api/rooms', require('./routes/rooms'));
app.use('/booking/api/reservations', require('./routes/reservations'));
app.use('/booking/api/payments', require('./routes/payments'));

app.get('/booking/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/booking/fail', (req, res) => res.sendFile(path.join(__dirname, 'public', 'fail.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`별빛민박 홈페이지가 http://localhost:${PORT} 에서 실행 중입니다.`);
  console.log(`온라인 예약 시스템은 http://localhost:${PORT}/booking 에서 실행 중입니다.`);
});
