(async function () {
  const params = new URLSearchParams(location.search);
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = Number(params.get('amount'));
  const box = document.getElementById('resultBox');

  if (!paymentKey || !orderId || !amount) {
    box.innerHTML = `<p class="result-status fail">잘못된 접근입니다</p>`;
    return;
  }

  try {
    const confirmRes = await fetch('/booking/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount })
    });
    const confirmData = await confirmRes.json();

    if (!confirmRes.ok) {
      box.innerHTML = `<p class="result-status fail">결제 승인에 실패했습니다</p><p class="result-detail">${confirmData.error || ''}</p>`;
      return;
    }

    const resRes = await fetch(`/booking/api/reservations/by-order/${orderId}`);
    const reservation = await resRes.json();

    box.innerHTML = `
      <p class="result-status">예약이 확정되었습니다</p>
      <p class="result-detail" style="margin-top:16px; text-align:left; white-space:pre-line;">
객실: ${reservation.room_name}
기간: ${reservation.checkin} ~ ${reservation.checkout} (${reservation.nights}박)
인원: ${reservation.guests}인
예약자: ${reservation.guest_name}
결제 금액: ${Number(reservation.total_price).toLocaleString('ko-KR')}원
예약번호: ${reservation.order_id}
      </p>
    `;
  } catch (err) {
    console.error(err);
    box.innerHTML = `<p class="result-status fail">처리 중 오류가 발생했습니다</p>`;
  }
})();
