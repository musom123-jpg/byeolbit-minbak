const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('../supabaseClient');

function nightsBetween(checkin, checkout) {
  const ms = new Date(checkout) - new Date(checkin);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// 예약 생성: 결제 전 PENDING 상태로 먼저 자리를 잡아둡니다.
// 같은 방/기간이 겹치는 동시 예약은 DB의 exclude 제약(no_overlapping_reservations)이 막아줍니다.
router.post('/', async (req, res) => {
  const { room_id, guest_name, guest_phone, guest_email, checkin, checkout, guests, memo } = req.body;

  if (!room_id || !guest_name || !guest_phone || !checkin || !checkout) {
    return res.status(400).json({ error: '필수 정보가 누락되었습니다.' });
  }

  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', room_id)
    .eq('is_active', true)
    .single();

  if (roomErr || !room) return res.status(404).json({ error: '존재하지 않는 객실입니다.' });

  const nights = nightsBetween(checkin, checkout);
  if (nights < 1) return res.status(400).json({ error: '날짜를 다시 확인해주세요.' });
  if (guests && guests > room.capacity) {
    return res.status(400).json({ error: `이 객실은 최대 ${room.capacity}인까지 이용 가능합니다.` });
  }

  const totalPrice = nights * room.price_per_night;
  const orderId = 'ORD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');

  const { data: inserted, error: insertErr } = await supabase
    .from('reservations')
    .insert({
      order_id: orderId,
      room_id,
      guest_name,
      guest_phone,
      guest_email: guest_email || null,
      checkin,
      checkout,
      guests: guests || 1,
      nights,
      total_price: totalPrice,
      status: 'PENDING',
      memo: memo || null
    })
    .select()
    .single();

  if (insertErr) {
    // exclusion_violation: 겹치는 기간에 이미 PENDING/PAID 예약이 존재
    if (insertErr.code === '23P01') {
      return res.status(409).json({ error: '선택하신 날짜는 이미 예약이 완료되었습니다. 다른 날짜를 선택해주세요.' });
    }
    console.error(insertErr);
    return res.status(500).json({ error: '예약 처리 중 오류가 발생했습니다.' });
  }

  res.json({
    reservationId: inserted.id,
    orderId,
    amount: totalPrice,
    nights,
    roomName: room.name
  });
});

// 주문번호로 예약 조회 (결제 완료 페이지에서 사용)
router.get('/by-order/:orderId', async (req, res) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*, rooms(name)')
    .eq('order_id', req.params.orderId)
    .single();

  if (error || !data) return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });

  const { rooms, ...reservation } = data;
  res.json({ ...reservation, room_name: rooms ? rooms.name : null });
});

// PENDING 상태로 10분 이상 지난, 결제되지 않은 예약을 자동 정리(간단한 방식)
// 서버 시작 시 + 5분마다 가볍게 청소
// 주의: 결제(TOSS_CLIENT_KEY)가 아직 연결되지 않은 동안은 PENDING이 곧 "가예약(전화 확인 대기)" 상태이므로
// 자동 삭제하지 않습니다. 결제 연동 후에는 정상적으로 10분 뒤 자동 정리됩니다.
async function cleanupStalePending() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('reservations')
    .delete()
    .eq('status', 'PENDING')
    .lt('created_at', tenMinutesAgo);

  if (error) console.error('cleanupStalePending 오류:', error);
}

if (process.env.TOSS_CLIENT_KEY) {
  setInterval(cleanupStalePending, 5 * 60 * 1000);
  cleanupStalePending();
} else {
  console.log('TOSS_CLIENT_KEY가 없어 결제 미연동 상태입니다. PENDING 예약 자동 정리를 건너뜁니다.');
}

module.exports = router;
