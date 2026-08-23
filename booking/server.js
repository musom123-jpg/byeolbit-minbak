require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// 별빛민박 홈페이지(정적 파일)를 루트 경로에서 서빙
app.use(express.static(path.join(__dirname, '..')));

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
