const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// 전체 객실 목록
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('is_active', true)
    .order('id');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '객실 목록을 불러오지 못했습니다.' });
  }
  res.json(data);
});

// 특정 객실의 특정 기간 예약 가능 여부 확인
// GET /api/rooms/:id/availability?checkin=2026-08-10&checkout=2026-08-12
router.get('/:id/availability', async (req, res) => {
  const roomId = Number(req.params.id);
  const { checkin, checkout } = req.query;

  if (!checkin || !checkout) {
    return res.status(400).json({ error: 'checkin, checkout 날짜가 필요합니다.' });
  }
  if (new Date(checkin) >= new Date(checkout)) {
    return res.status(400).json({ error: '체크아웃 날짜는 체크인 날짜보다 이후여야 합니다.' });
  }

  // 날짜 구간이 겹치는 PAID 또는 PENDING(결제 대기중) 예약이 있는지 확인
  const { count, error } = await supabase
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .in('status', ['PAID', 'PENDING'])
    .lt('checkin', checkout)
    .gt('checkout', checkin);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '예약 가능 여부를 확인하지 못했습니다.' });
  }

  res.json({ available: (count || 0) === 0 });
});

module.exports = router;
