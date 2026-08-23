let CONFIG = {};
let ROOMS = [];
let selectedRoom = null;
let currentSearch = null; // { checkin, checkout, guests }
let tossPayments = null;

const $ = (sel) => document.querySelector(sel);

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function nightsBetween(checkin, checkout) {
  return Math.round((new Date(checkout) - new Date(checkin)) / 86400000);
}
function formatWon(n) {
  return n.toLocaleString('ko-KR') + '원';
}

async function loadConfig() {
  const res = await fetch('/booking/api/config');
  CONFIG = await res.json();
  document.getElementById('businessName').textContent = CONFIG.businessName || '숙소 예약';
  document.title = (CONFIG.businessName || '숙소') + ' 예약하기';
  const tel = document.getElementById('businessPhone');
  tel.textContent = CONFIG.businessPhone || '';
  tel.href = 'tel:' + (CONFIG.businessPhone || '').replace(/[^0-9]/g, '');
  document.getElementById('footerBusiness').textContent =
    [CONFIG.businessName, CONFIG.businessAddress, CONFIG.businessPhone].filter(Boolean).join(' · ');
  document.getElementById('footerLicense').textContent =
    CONFIG.businessLicenseNo ? `숙박업 신고번호 ${CONFIG.businessLicenseNo}` : '';

  if (CONFIG.tossClientKey && window.TossPayments) {
    tossPayments = TossPayments(CONFIG.tossClientKey);
  }
}

async function loadRooms() {
  const res = await fetch('/booking/api/rooms');
  ROOMS = await res.json();
}

async function checkAvailability(roomId, checkin, checkout) {
  const params = new URLSearchParams({ checkin, checkout });
  const res = await fetch(`/booking/api/rooms/${roomId}/availability?${params}`);
  const data = await res.json();
  return data.available;
}

function roomCardTemplate(room, nights, available) {
  const div = document.createElement('div');
  div.className = 'room-card';
  const img = room.image_url ? `style="background-image:url('${room.image_url}')"` : '';
  const totalPrice = nights ? room.price_per_night * nights : null;

  div.innerHTML = `
    <div class="thumb" ${img}></div>
    <div class="body">
      <h3>${room.name}</h3>
      <p class="desc">${room.description || ''}</p>
      <p class="meta">기준 ${room.capacity}인</p>
      <div class="price-row">
        <div class="price">
          ${totalPrice ? formatWon(totalPrice) : formatWon(room.price_per_night)}
          <small>${totalPrice ? `${nights}박 총액` : '1박 기준'}</small>
        </div>
        ${
          currentSearch
            ? (available
                ? `<button data-room-id="${room.id}">선택하기</button>`
                : `<span class="sold-out">예약 마감</span>`)
            : `<span class="meta">날짜를 선택해주세요</span>`
        }
      </div>
    </div>
  `;

  if (currentSearch && available) {
    div.querySelector('button').addEventListener('click', () => openBookingDialog(room));
  }
  return div;
}

async function renderRooms() {
  const list = document.getElementById('roomList');
  const countEl = document.getElementById('roomCount');
  list.innerHTML = '';

  if (!ROOMS.length) {
    list.innerHTML = `<div class="empty-state">등록된 객실이 없습니다.</div>`;
    countEl.textContent = '';
    return;
  }

  if (!currentSearch) {
    countEl.textContent = `총 ${ROOMS.length}개 객실`;
    ROOMS.forEach((room) => list.appendChild(roomCardTemplate(room, null, null)));
    return;
  }

  countEl.textContent = '확인 중…';
  const nights = nightsBetween(currentSearch.checkin, currentSearch.checkout);

  const results = await Promise.all(
    ROOMS.filter((r) => r.capacity >= currentSearch.guests).map(async (room) => {
      const available = await checkAvailability(room.id, currentSearch.checkin, currentSearch.checkout);
      return { room, available };
    })
  );

  const availableCount = results.filter((r) => r.available).length;
  countEl.textContent = `${nights}박 · 예약 가능 ${availableCount}개`;

  if (!results.length) {
    list.innerHTML = `<div class="empty-state">선택하신 인원을 수용할 수 있는 객실이 없습니다.</div>`;
    return;
  }

  results
    .sort((a, b) => Number(b.available) - Number(a.available))
    .forEach(({ room, available }) => list.appendChild(roomCardTemplate(room, nights, available)));
}

function openBookingDialog(room) {
  selectedRoom = room;
  const nights = nightsBetween(currentSearch.checkin, currentSearch.checkout);
  const total = nights * room.price_per_night;

  document.getElementById('bookingSummary').textContent =
    `${room.name}\n${currentSearch.checkin} ~ ${currentSearch.checkout} (${nights}박) · ${currentSearch.guests}인\n결제 금액: ${formatWon(total)}`;

  document.getElementById('guestName').value = '';
  document.getElementById('guestPhone').value = '';
  document.getElementById('guestEmail').value = '';
  document.getElementById('guestMemo').value = '';

  document.getElementById('bookingDialog').showModal();
}

async function submitBooking(e) {
  e.preventDefault();
  const payload = {
    room_id: selectedRoom.id,
    guest_name: document.getElementById('guestName').value.trim(),
    guest_phone: document.getElementById('guestPhone').value.trim(),
    guest_email: document.getElementById('guestEmail').value.trim(),
    memo: document.getElementById('guestMemo').value.trim(),
    checkin: currentSearch.checkin,
    checkout: currentSearch.checkout,
    guests: currentSearch.guests
  };

  const btn = document.getElementById('goToPayment');
  btn.disabled = true;
  btn.textContent = '처리 중…';

  try {
    const res = await fetch('/booking/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || '예약에 실패했습니다.');
      btn.disabled = false;
      btn.textContent = '결제하기';
      return;
    }

    if (!tossPayments) {
      // 결제 연동 전: 예약(가예약)은 이미 저장되었으니, 결제 없이 접수 완료로 안내합니다.
      alert(`예약이 접수되었습니다!\n예약번호: ${data.orderId}\n곧 전화로 연락드려 예약을 확정하겠습니다.`);
      document.getElementById('bookingDialog').close();
      btn.disabled = false;
      btn.textContent = '결제하기';
      currentSearch && (await renderRooms());
      return;
    }

    // 토스페이먼츠 결제창 호출 → 성공 시 /success, 실패 시 /fail 로 리다이렉트
    tossPayments.requestPayment('카드', {
      amount: data.amount,
      orderId: data.orderId,
      orderName: `${data.roomName} ${data.nights}박`,
      customerName: payload.guest_name,
      successUrl: `${window.location.origin}/booking/success`,
      failUrl: `${window.location.origin}/booking/fail`
    });
  } catch (err) {
    console.error(err);
    alert('예약 처리 중 오류가 발생했습니다.');
    btn.disabled = false;
    btn.textContent = '결제하기';
  }
}

function initSearchForm() {
  const checkin = document.getElementById('checkin');
  const checkout = document.getElementById('checkout');
  checkin.min = todayStr();
  checkin.value = todayStr();
  checkout.min = tomorrowStr();
  checkout.value = tomorrowStr();

  checkin.addEventListener('change', () => {
    const next = new Date(checkin.value);
    next.setDate(next.getDate() + 1);
    checkout.min = next.toISOString().slice(0, 10);
    if (checkout.value <= checkin.value) checkout.value = checkout.min;
  });

  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ci = checkin.value, co = checkout.value;
    const guests = Number(document.getElementById('guests').value);

    if (new Date(co) <= new Date(ci)) {
      document.getElementById('stayHint').textContent = '체크아웃 날짜를 다시 확인해주세요.';
      return;
    }
    currentSearch = { checkin: ci, checkout: co, guests };
    const nights = nightsBetween(ci, co);
    document.getElementById('stayHint').textContent = `${ci} ~ ${co} · ${nights}박 · ${guests}인 기준으로 확인합니다.`;
    await renderRooms();
    document.getElementById('rooms').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

document.getElementById('cancelBooking').addEventListener('click', () => {
  document.getElementById('bookingDialog').close();
});
document.getElementById('bookingForm').addEventListener('submit', submitBooking);

(async function init() {
  await loadConfig();
  await loadRooms();
  initSearchForm();
  await renderRooms();
})();
