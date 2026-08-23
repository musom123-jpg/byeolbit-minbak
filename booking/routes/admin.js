const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');

// 관리자용 예약 목록 (기간 겹치는 예약 전체, 취소건 포함)
// GET /booking/api/admin/reservations?from=2026-08-01&to=2026-08-31
router.get('/reservations', async (req, res) => {
  const { from, to } = req.query;

  let query = supabase
    .from('reservations')
    .select('*, rooms(name)')
    .order('checkin', { ascending: true });

  if (from) query = query.gte('checkout', from);
  if (to) query = query.lte('checkin', to);

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return res.status(500).json({ error: '예약 목록을 불러오지 못했습니다.' });
  }

  const reservations = data.map(({ rooms, ...r }) => ({ ...r, room_name: rooms ? rooms.name : null }));
  res.json(reservations);
});

// 예약 상태 변경 (관리자가 가예약 취소 등을 처리할 때 사용)
router.patch('/reservations/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['PENDING', 'PAID', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: '잘못된 상태 값입니다.' });
  }

  const { error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', req.params.id);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: '상태 변경에 실패했습니다.' });
  }
  res.json({ ok: true });
});

module.exports = router;
