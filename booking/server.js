require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// 관리자 페이지/API 보호용 (HTTP Basic Auth)
function requireAdminAuth(req, res, next) {
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || '';

  if (!expectedPass) {
    return res.status(500).send('서버에 ADMIN_PASSWORD가 설정되지 않았습니다.');
  }

  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const [user, pass] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    const userBuf = Buffer.from(user || '');
    const expectedUserBuf = Buffer.from(expectedUser);
    const passBuf = Buffer.from(pass || '');
    const expectedPassBuf = Buffer.from(expectedPass);

    const userMatch = userBuf.length === expectedUserBuf.length && crypto.timingSafeEqual(userBuf, expectedUserBuf);
    const passMatch = passBuf.length === expectedPassBuf.length && crypto.timingSafeEqual(passBuf, expectedPassBuf);

    if (userMatch && passMatch) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="byeolbit-admin"');
  res.status(401).send('인증이 필요합니다.');
}

// 별빛민박 홈페이지(정적 파일)를 루트 경로에서 서빙
app.use(express.static(path.join(__dirname, '..')));

// 관리자 예약 스케줄 페이지 (로그인 필요) - public/ 보다 먼저 등록해 접근을 보호합니다
app.use('/booking/admin', requireAdminAuth, express.static(path.join(__dirname, 'admin-dashboard')));
app.use('/booking/api/admin', requireAdminAuth, require('./routes/admin'));

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
