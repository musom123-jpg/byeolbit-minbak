const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const supabase = require('../supabaseClient');

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY;

// 결제창에서 결제가 끝나면 프론트에서 이 API를 호출합니다.
// 여기서 반드시 "서버에서" 토스 API로 최종 승인 요청을 보내야
// 금액 조작 등 위변조를 막을 수 있습니다. (클라이언트만 믿으면 안 됨)
router.post('/confirm', async (req, res) => {
  const { paymentKey, orderId, amount } = req.body;

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: '결제 정보가 올바르지 않습니다.' });
  }

  const { data: reservation, error: findErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('order_id', orderId)
    .single();

  if (findErr || !reservation) {
    return res.status(404).json({ error: '예약 정보를 찾을 수 없습니다.' });
  }
  if (reservation.status === 'PAID') {
    return res.json({ ok: true, alreadyPaid: true });
  }
  // 프론트에서 전달한 금액이 실제 예약 금액과 다르면 절대 승인하지 않음
  if (Number(amount) !== reservation.total_price) {
    return res.status(400).json({ error: '결제 금액이 예약 금액과 일치하지 않습니다.' });
  }

  try {
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(TOSS_SECRET_KEY + ':').toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });

    const tossData = await tossRes.json();

    if (!tossRes.ok) {
      console.error('Toss 승인 실패:', tossData);
      return res.status(400).json({ error: tossData.message || '결제 승인에 실패했습니다.' });
    }

    const { error: updateErr } = await supabase
      .from('reservations')
      .update({ status: 'PAID', payment_key: paymentKey })
      .eq('order_id', orderId);

    if (updateErr) {
      console.error(updateErr);
      return res.status(500).json({ error: '결제 상태 저장 중 오류가 발생했습니다.' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '결제 승인 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
